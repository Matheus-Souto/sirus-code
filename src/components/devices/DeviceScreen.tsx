import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { DeviceHubAccess } from "@/client/types";
import { useTranslation } from "@/i18n/use-translation";
import { cn } from "@/lib/cn";
import { createDeviceStream, displayRotation, fitFrame, type DeviceScreen as Screen, type DeviceStreamClient, type DeviceStreamStatus } from "@/lib/device-stream";

export interface DeviceScreenHandle {
  pressButton: (button: "home" | "lock") => void;
  rotate: () => void;
}

/**
 * The live simulator screen (ADR-128). Pointer presses become touches in the
 * device's coordinates (pointer capture keeps a swipe going outside the box),
 * keys go to the device as hardware keyboard input while the screen has focus,
 * and the stream runs only while `visible`.
 */
export const DeviceScreen = forwardRef<DeviceScreenHandle, {
  udid: string;
  name: string;
  access: DeviceHubAccess;
  visible: boolean;
  onInput?: (connected: boolean) => void;
}>(function DeviceScreen({ udid, name, access, visible, onInput }, ref) {
  const t = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<DeviceStreamClient | null>(null);
  const [status, setStatus] = useState<{ value: DeviceStreamStatus; detail?: string }>({ value: "connecting" });
  const [screen, setScreen] = useState<Screen | null>(null);
  const [input, setInput] = useState(false);
  const [mjpeg, setMjpeg] = useState<{ url: string; generation: number } | null>(null);
  const onInputRef = useRef(onInput);
  useLayoutEffect(() => { onInputRef.current = onInput; });

  useImperativeHandle(ref, () => ({
    pressButton: (button) => clientRef.current?.pressButton(button),
    rotate: () => clientRef.current?.rotate(),
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const client = createDeviceStream({ udid, access }, canvas, {
      onStatus: (value, detail) => setStatus({ value, detail }),
      onScreen: setScreen,
      onMjpegFallback: (url) => setMjpeg((current) => ({ url, generation: (current?.generation ?? 0) + 1 })),
      onInput: (connected) => { setInput(connected); onInputRef.current?.(connected); },
    });
    clientRef.current = client;
    setStatus({ value: "connecting" });
    setMjpeg(null);
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
      setInput(false);
      onInputRef.current?.(false);
    };
  }, [udid, access, visible]);

  const attachImage = useCallback((image: HTMLImageElement | null) => clientRef.current?.setMjpegImage(image), []);

  // The stage measures itself so a narrow dock shows a smaller phone, never a squeezed one.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      setStage((current) => current.width === rect.width && current.height === rect.height ? current : { width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rotation = displayRotation(screen);
  const aspect = useMemo(() => {
    if (!screen) return 9 / 19.5;
    const landscape = screen.orientation === "landscape_left" || screen.orientation === "landscape_right";
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    return landscape ? long / short : short / long;
  }, [screen]);
  const frame = fitFrame(aspect, stage.width, stage.height);
  // A sideways device draws its raw portrait frame rotated inside the landscape box.
  const sideways = rotation === 90 || rotation === -90;
  const media: CSSProperties = sideways
    ? { width: frame.height, height: frame.width, left: (frame.width - frame.height) / 2, top: (frame.height - frame.width) / 2, transform: `rotate(${rotation}deg)` }
    : { width: frame.width, height: frame.height, ...(rotation ? { transform: `rotate(${rotation}deg)` } : {}) };

  const pressed = useRef(false);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return { x: clamp((event.clientX - rect.left) / Math.max(1, rect.width)), y: clamp((event.clientY - rect.top) / Math.max(1, rect.height)) };
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (!pressed.current) return;
    pressed.current = false;
    const { x, y } = point(event);
    clientRef.current?.sendTouch("end", x, y);
  };

  const message = status.value === "error"
    ? t("devices.streamFailed", { error: status.detail ?? "" })
    : status.value === "connecting" ? (status.detail ?? t("devices.connecting")) : null;

  return (
    <div
      ref={stageRef}
      className="device-stage"
      tabIndex={0}
      role="application"
      aria-label={t("devices.screen", { name })}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.metaKey || event.nativeEvent.isComposing) return;
        event.preventDefault();
        clientRef.current?.sendKey(event.code, "down");
      }}
      onKeyUp={(event) => {
        if (event.target !== event.currentTarget) return;
        clientRef.current?.sendKey(event.code, "up");
      }}
    >
      <div
        className="device-frame"
        style={{ width: frame.width, height: frame.height }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          stageRef.current?.focus({ preventScroll: true });
          pressed.current = true;
          const { x, y } = point(event);
          clientRef.current?.sendTouch("begin", x, y);
        }}
        onPointerMove={(event) => {
          if (!pressed.current) return;
          const { x, y } = point(event);
          clientRef.current?.sendTouch("move", x, y);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <canvas ref={canvasRef} className={cn("device-media", mjpeg && "hidden")} style={media} />
        {visible && mjpeg ? <img key={mjpeg.generation} ref={attachImage} alt="" draggable={false} className="device-media object-contain" style={media} /> : null}
        {message ? (
          <div className="device-message">
            <p className="ui-caption">{message}</p>
            {status.value === "error" ? (
              <button type="button" className="device-text-button ui-control" onClick={() => { clientRef.current?.stop(); clientRef.current?.start(); }}>
                {t("devices.reconnect")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {status.value === "streaming" && !input ? <p className="device-input-lost ui-caption">{t("devices.inputLost")}</p> : null}
    </div>
  );
});
