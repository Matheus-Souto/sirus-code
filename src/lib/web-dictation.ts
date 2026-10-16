/**
 * Dictation for the UI served to a phone (ADR-084): the Mac's microphone is out of
 * reach there, so the browser's own speech recognition (Siri dictation on iPhone)
 * transcribes on the device. Same shape as the native commands: start, then stop
 * with the final text.
 */
interface RecognitionResult { readonly isFinal: boolean; readonly 0: { readonly transcript: string } }
interface RecognitionEvent { readonly resultIndex: number; readonly results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const scope = globalThis as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/**
 * iPhone and iPad home-screen apps expose speech recognition but never deliver words (a WebKit
 * limitation, bug 225298): there the composer offers no mic and the keyboard's own dictation is
 * the way to speak. A Safari tab keeps it.
 */
export function iosHomeScreenApp(nav: { userAgent: string; maxTouchPoints?: number; standalone?: boolean } = navigator, standaloneDisplay = globalThis.matchMedia?.("(display-mode: standalone)").matches ?? false): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1);
  return ios && (nav.standalone === true || standaloneDisplay);
}

export function webDictationSupported(): boolean {
  return recognitionConstructor() !== null && !iosHomeScreenApp();
}

/** Joins what was said so far: final phrases, then the phrase still being heard. */
export function joinTranscript(results: ArrayLike<RecognitionResult>): { final: string; interim: string } {
  let final = "", interim = "";
  for (let index = 0; index < results.length; index += 1) {
    const text = results[index][0].transcript;
    if (results[index].isFinal) final += text; else interim += text;
  }
  return { final: final.replace(/\s+/g, " ").trim(), interim: interim.replace(/\s+/g, " ").trim() };
}

function errorMessage(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone permission was denied.";
  if (code === "language-not-supported") return "Speech recognition is unavailable for this language.";
  if (code === "network") return "Speech recognition is unavailable right now.";
  return "Dictation failed.";
}

/**
 * iPhone's recognizer stops hearing after the first session in continuous mode, so this
 * listens in short sessions and starts the next one while the person is still recording;
 * the phrases of every session add up.
 */
export class WebDictation {
  private recognition: Recognition | null = null;
  private listening = false;
  private earlier = "";
  private current = "";
  private ended: Promise<void> = Promise.resolve();
  private finish: () => void = () => undefined;
  private failure: string | null = null;
  private locale = "";
  private onInterim: (text: string) => void = () => undefined;

  /** Resolves once the browser is listening; `onInterim` follows the words as they come. */
  start(locale: string, onInterim: (text: string) => void): Promise<void> {
    if (!recognitionConstructor()) return Promise.reject(new Error("Speech recognition is unavailable right now."));
    this.locale = locale;
    this.onInterim = onInterim;
    this.earlier = "";
    this.current = "";
    this.failure = null;
    this.listening = true;
    this.ended = new Promise((resolve) => { this.finish = resolve; });
    try {
      this.listen();
    } catch (error) {
      this.listening = false;
      return Promise.reject(error instanceof Error ? error : new Error("Dictation could not start."));
    }
    return Promise.resolve();
  }

  private text(): string {
    return [this.earlier, this.current].filter(Boolean).join(" ");
  }

  private listen() {
    const Constructor = recognitionConstructor()!;
    const recognition = new Constructor();
    recognition.lang = this.locale;
    recognition.continuous = false;
    recognition.interimResults = true;
    this.recognition = recognition;
    recognition.onresult = (event) => {
      const { final, interim } = joinTranscript(event.results);
      this.current = final;
      this.onInterim([this.text(), interim].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      this.failure = errorMessage(event.error);
      // Permission refused or no service: stop instead of trying again.
      if (event.error !== "network") this.listening = false;
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.earlier = this.text();
      this.current = "";
      if (this.listening) {
        try { this.listen(); return; } catch { this.listening = false; }
      }
      this.recognition = null;
      this.finish();
    };
    recognition.start();
  }

  /** Stops listening; the final text, or nothing when cancelled. */
  async stop(cancelled: boolean): Promise<string> {
    const recognition = this.recognition;
    this.listening = false;
    if (!recognition) return cancelled ? "" : this.text();
    if (cancelled) { this.recognition = null; recognition.abort(); this.finish(); return ""; }
    recognition.stop();
    // The last phrase arrives just before `end`; give up after a few seconds.
    await Promise.race([this.ended, new Promise((resolve) => setTimeout(resolve, 4000))]);
    const text = this.text();
    if (this.failure && !text) throw new Error(this.failure);
    return text;
  }
}

/**
 * Dictation for the iPhone home-screen app (ADR-084 addendum): the phone records the audio
 * itself (recording works there; only speech recognition does not) and the computer transcribes
 * it with its own speech recognition on stop. No words show while recording.
 */
export class RecordedDictation {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private stopped: Promise<void> = Promise.resolve();

  private readonly transcribe: (audio: string) => Promise<string | null>;

  constructor(transcribe: (audio: string) => Promise<string | null>) {
    this.transcribe = transcribe;
  }

  static supported(): boolean {
    return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && MediaRecorder.isTypeSupported?.("audio/mp4") !== false;
  }

  async start(): Promise<void> {
    this.release();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new Error("Microphone permission was denied.");
    }
    this.stream = stream;
    this.chunks = [];
    const recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported?.("audio/mp4") ? { mimeType: "audio/mp4" } : undefined);
    this.recorder = recorder;
    recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
    this.stopped = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    recorder.start(1000);
  }

  /** Stops recording; the computer's transcript, or nothing when cancelled or silent. */
  async stop(cancelled: boolean): Promise<string> {
    const recorder = this.recorder;
    if (!recorder) return "";
    if (recorder.state !== "inactive") recorder.stop();
    await Promise.race([this.stopped, new Promise((resolve) => setTimeout(resolve, 2000))]);
    const chunks = this.chunks;
    this.release();
    if (cancelled || !chunks.length) return "";
    const audio = await blobToBase64(new Blob(chunks, { type: chunks[0].type || "audio/mp4" }));
    return (await this.transcribe(audio))?.trim() ?? "";
  }

  private release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new Error("Dictation failed."));
    reader.readAsDataURL(blob);
  });
}
