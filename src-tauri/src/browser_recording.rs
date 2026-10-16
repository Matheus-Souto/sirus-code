//! Browser recordings (ADR-111). The renderer records the page's frames with
//! MediaRecorder and streams the encoded chunks here; they are written straight to a file in
//! Movies/Sirus Code, so a long recording never sits in memory. Ids are random, a recording is
//! bounded in size and only `mp4` or `webm` files are written.
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;

use parking_lot::Mutex;
use tauri::Manager;

use crate::error::{Error, Result};

/// The largest recording kept; past it the recording stops with an error.
const MAX_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_OPEN: usize = 4;

struct Recording {
    path: PathBuf,
    file: std::fs::File,
    written: u64,
}

static RECORDINGS: Mutex<Option<HashMap<String, Recording>>> = Mutex::new(None);

/// The file name for a recording started at `stamp` (local time, `YYYY-MM-DD HH.MM.SS`).
pub fn file_name(stamp: &str, extension: &str) -> Option<String> {
    matches!(extension, "mp4" | "webm").then(|| format!("Browser recording {stamp}.{extension}"))
}

#[tauri::command]
pub fn browser_recording_start(app: tauri::AppHandle, extension: String) -> Result<String> {
    let stamp = chrono::Local::now().format("%Y-%m-%d %H.%M.%S").to_string();
    let name = file_name(&stamp, &extension)
        .ok_or_else(|| Error::new("invalid", "Unsupported recording format."))?;
    let dir = app
        .path()
        .video_dir()
        .map_err(|_| Error::new("native", "The Movies folder is unavailable."))?
        .join("Sirus Code");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join(name);
    let file = std::fs::File::create(&path)?;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let mut guard = RECORDINGS.lock();
    let open = guard.get_or_insert_with(HashMap::new);
    if open.len() >= MAX_OPEN {
        return Err(Error::new("invalid", "Too many recordings are open."));
    }
    open.insert(
        id.clone(),
        Recording {
            path,
            file,
            written: 0,
        },
    );
    Ok(id)
}

#[tauri::command]
pub fn browser_recording_append(id: String, chunk: String) -> Result<()> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(chunk)
        .map_err(|_| Error::new("invalid", "Invalid recording data."))?;
    let mut guard = RECORDINGS.lock();
    let recording = guard
        .as_mut()
        .and_then(|open| open.get_mut(&id))
        .ok_or_else(|| Error::not_found("recording not found"))?;
    if recording.written + bytes.len() as u64 > MAX_BYTES {
        return Err(Error::new("invalid", "The recording is too large."));
    }
    recording.file.write_all(&bytes)?;
    recording.written += bytes.len() as u64;
    Ok(())
}

/// Closes the file and shows it in Finder; an empty recording is removed.
#[tauri::command]
pub fn browser_recording_finish(id: String, reveal: bool) -> Result<Option<String>> {
    let recording = RECORDINGS
        .lock()
        .as_mut()
        .and_then(|open| open.remove(&id))
        .ok_or_else(|| Error::not_found("recording not found"))?;
    let Recording {
        path,
        mut file,
        written,
    } = recording;
    file.flush()?;
    drop(file);
    if written == 0 {
        let _ = std::fs::remove_file(&path);
        return Ok(None);
    }
    if reveal {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn();
    }
    Ok(Some(path.to_string_lossy().into_owned()))
}

type Reply = std::result::Result<serde_json::Value, String>;
/// Agent recording requests waiting for the renderer, which owns the recorder.
static REQUESTS: Mutex<Option<HashMap<String, std::sync::mpsc::Sender<Reply>>>> = Mutex::new(None);

/// Asks the renderer to start or stop recording the session's browser and waits for its answer
/// (ADR-112). Runs on the MCP bridge's blocking thread.
pub fn agent_request(app: &tauri::AppHandle, session_id: &str, action: &str) -> Reply {
    use tauri::Emitter;
    let id = uuid::Uuid::new_v4().simple().to_string();
    let (sender, receiver) = std::sync::mpsc::channel();
    REQUESTS
        .lock()
        .get_or_insert_with(HashMap::new)
        .insert(id.clone(), sender);
    let sent = app.emit(
        "browser-record-request",
        serde_json::json!({ "requestId": id, "sessionId": session_id, "action": action }),
    );
    let reply = match sent {
        Ok(()) => receiver
            .recv_timeout(std::time::Duration::from_secs(30))
            .unwrap_or_else(|_| Err("the app did not answer in time".into())),
        Err(_) => Err("the app window is unavailable".into()),
    };
    if let Some(open) = REQUESTS.lock().as_mut() {
        open.remove(&id);
    }
    reply
}

/// The renderer's answer to an agent recording request.
#[tauri::command]
pub fn browser_record_reply(
    request_id: String,
    result: Option<serde_json::Value>,
    error: Option<String>,
) {
    let sender = REQUESTS
        .lock()
        .as_mut()
        .and_then(|open| open.remove(&request_id));
    if let Some(sender) = sender {
        let _ = sender.send(match error {
            Some(error) => Err(error.chars().take(300).collect()),
            None => Ok(result.unwrap_or(serde_json::Value::Null)),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_video_formats_get_a_file_name() {
        assert_eq!(
            file_name("2026-10-11 22.00.00", "mp4").as_deref(),
            Some("Browser recording 2026-10-11 22.00.00.mp4")
        );
        assert!(file_name("x", "webm").is_some());
        assert_eq!(file_name("x", "sh"), None);
        assert_eq!(file_name("x", "../mp4"), None);
    }

    #[test]
    fn replies_reach_only_their_waiting_request() {
        let (sender, receiver) = std::sync::mpsc::channel();
        REQUESTS
            .lock()
            .get_or_insert_with(HashMap::new)
            .insert("r1".into(), sender);
        browser_record_reply("other".into(), None, Some("x".into()));
        browser_record_reply(
            "r1".into(),
            Some(serde_json::json!({ "path": "/v.mp4" })),
            None,
        );
        assert_eq!(receiver.recv().unwrap().unwrap()["path"], "/v.mp4");
        browser_record_reply("r1".into(), None, Some("late".into()));
        assert!(receiver.try_recv().is_err());
    }

    #[test]
    fn unknown_recordings_are_refused() {
        assert!(browser_recording_append("nope".into(), "AAAA".into()).is_err());
        assert!(browser_recording_finish("nope".into(), false).is_err());
    }
}
