//! The supervised `expo-device-hub` child (ADR-128). It listens on a free
//! loopback port, in its own process group, and is restarted with a doubling
//! backoff (1 s to 30 s, reset after a minute up) while a pane still wants it.
//! Stopping kills the whole group. The pid is recorded so a hub left behind by
//! a crashed app is found and stopped before the next one starts.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::toolchain::Node;
use crate::error::{Error, Result};
use crate::models::DeviceHubState;

const READY_TIMEOUT: Duration = Duration::from_secs(30);
const STABLE_UPTIME: Duration = Duration::from_secs(60);
const MAX_RESTART_DELAY: Duration = Duration::from_secs(30);
const RECORD: &str = "hub.json";

#[derive(Default)]
struct Inner {
    running: Option<Running>,
    starting: bool,
    error: Option<String>,
    /// While true, an exit is treated as a crash and restarted.
    wanted: bool,
    restart_delay: Duration,
    generation: u64,
}

#[derive(Clone)]
struct Running {
    pid: u32,
    port: u16,
    started: Instant,
    generation: u64,
}

#[derive(Serialize, Deserialize)]
struct Record {
    pid: u32,
    entry: PathBuf,
}

pub struct Hub {
    inner: Mutex<Inner>,
    /// Serializes starts so two panes never spawn two hubs.
    start: tokio::sync::Mutex<()>,
    tools: PathBuf,
}

/// One HTTP client for loopback calls to the hub (no system proxy).
pub fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .no_proxy()
            .connect_timeout(Duration::from_secs(5))
            .tcp_nodelay(true)
            .build()
            .unwrap_or_default()
    })
}

impl Hub {
    pub fn new(tools: PathBuf) -> Self {
        Self {
            inner: Mutex::new(Inner::default()),
            start: tokio::sync::Mutex::new(()),
            tools,
        }
    }

    pub fn state(&self) -> DeviceHubState {
        let inner = self.inner.lock();
        DeviceHubState {
            running: inner.running.is_some(),
            starting: inner.starting,
            error: inner.error.clone(),
        }
    }

    /// `http://127.0.0.1:<port>` while the hub answers.
    pub fn origin(&self) -> Option<String> {
        self.inner
            .lock()
            .running
            .as_ref()
            .map(|running| format!("http://127.0.0.1:{}", running.port))
    }

    /// Starts the hub unless it runs; returns its origin once `/readyz` answers.
    pub async fn ensure(&'static self, node: &Node, entry: &Path, changed: fn()) -> Result<String> {
        let _guard = self.start.lock().await;
        if let Some(origin) = self.origin() {
            return Ok(origin);
        }
        {
            let mut inner = self.inner.lock();
            inner.starting = true;
            inner.wanted = true;
        }
        changed();
        let started = self.spawn(node, entry, changed).await;
        {
            let mut inner = self.inner.lock();
            inner.starting = false;
            inner.error = started.as_ref().err().map(ToString::to_string);
        }
        changed();
        started
    }

    async fn spawn(&'static self, node: &Node, entry: &Path, changed: fn()) -> Result<String> {
        reap_stale(&self.tools.join(RECORD));
        let port = free_port()?;
        let mut command = Command::new(&node.path);
        command
            .arg(entry)
            .args(["--port", &port.to_string(), "--host", "127.0.0.1"])
            .args(["--hide-sidebar", "--hide-boot-device", "--platform", "ios"])
            .env("PATH", node.child_path())
            .env("FORCE_COLOR", "0")
            .env("NO_COLOR", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(false);
        if let Some(dir) = entry.parent() {
            command.current_dir(dir);
        }
        #[cfg(unix)]
        command.process_group(0);
        let mut child = command.spawn().map_err(|error| {
            Error::new(
                "devices",
                format!("The device hub could not start: {error}"),
            )
        })?;
        let pid = child.id().unwrap_or_default();
        let last_line = std::sync::Arc::new(Mutex::new(String::new()));
        for stream in [
            child
                .stdout
                .take()
                .map(|out| Box::new(out) as Box<dyn tokio::io::AsyncRead + Send + Unpin>),
            child
                .stderr
                .take()
                .map(|err| Box::new(err) as Box<dyn tokio::io::AsyncRead + Send + Unpin>),
        ]
        .into_iter()
        .flatten()
        {
            let last_line = last_line.clone();
            tauri::async_runtime::spawn(async move {
                let mut lines = BufReader::new(stream).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let line: String = line.chars().take(400).collect();
                    tracing::debug!(target: "device_hub", "{line}");
                    if !line.trim().is_empty() {
                        *last_line.lock() = line;
                    }
                }
            });
        }
        let origin = format!("http://127.0.0.1:{port}");
        let deadline = Instant::now() + READY_TIMEOUT;
        loop {
            if let Ok(Some(status)) = child.try_wait() {
                let detail = last_line.lock().clone();
                return Err(Error::new(
                    "devices",
                    format!("The device hub exited ({status}). {detail}")
                        .trim()
                        .to_string(),
                ));
            }
            let ready = http()
                .get(format!("{origin}/readyz"))
                .timeout(Duration::from_secs(2))
                .send()
                .await
                .is_ok_and(|response| response.status().is_success());
            if ready {
                break;
            }
            if Instant::now() >= deadline {
                stop_pid(pid);
                let _ = child.wait().await;
                return Err(Error::new(
                    "devices",
                    "The device hub did not answer in 30 seconds.",
                ));
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        let record = Record {
            pid,
            entry: entry.to_path_buf(),
        };
        if let Ok(text) = serde_json::to_string(&record) {
            let _ = std::fs::write(self.tools.join(RECORD), text);
        }
        let generation = {
            let mut inner = self.inner.lock();
            inner.generation += 1;
            let generation = inner.generation;
            inner.running = Some(Running {
                pid,
                port,
                started: Instant::now(),
                generation,
            });
            inner.error = None;
            generation
        };
        tracing::info!(pid, port, "device hub started");
        tauri::async_runtime::spawn(self.supervise(
            child,
            generation,
            node.clone(),
            entry.to_path_buf(),
            changed,
        ));
        Ok(origin)
    }

    /// Waits for the child to exit. A named, boxed future: a restart starts a
    /// new hub, whose supervisor would otherwise be part of its own type.
    fn supervise(
        &'static self,
        mut child: tokio::process::Child,
        generation: u64,
        node: Node,
        entry: PathBuf,
        changed: fn(),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>> {
        Box::pin(async move {
            let status = child.wait().await;
            self.exited(generation, status.ok(), &node, &entry, changed)
                .await;
        })
    }

    /// The child is gone: restart it with backoff while it is still wanted.
    async fn exited(
        &'static self,
        generation: u64,
        status: Option<std::process::ExitStatus>,
        node: &Node,
        entry: &Path,
        changed: fn(),
    ) {
        let delay = {
            let mut inner = self.inner.lock();
            let Some(running) = inner.running.clone().filter(|r| r.generation == generation) else {
                return;
            };
            inner.running = None;
            let _ = std::fs::remove_file(self.tools.join(RECORD));
            if !inner.wanted {
                return;
            }
            // A hub that ran a minute or more starts the backoff over.
            let delay =
                if running.started.elapsed() >= STABLE_UPTIME || inner.restart_delay.is_zero() {
                    Duration::from_secs(1)
                } else {
                    (inner.restart_delay * 2).min(MAX_RESTART_DELAY)
                };
            inner.restart_delay = delay;
            inner.error = Some(format!(
                "The device hub stopped ({}); restarting.",
                status.map(|status| status.to_string()).unwrap_or_default()
            ));
            delay
        };
        tracing::warn!(?status, ?delay, "device hub exited; restarting");
        changed();
        tokio::time::sleep(delay).await;
        if self.inner.lock().wanted {
            let _ = self.ensure(node, entry, changed).await;
        }
    }

    /// Stops the hub and its process group; it is not restarted.
    pub fn stop(&self) {
        let running = {
            let mut inner = self.inner.lock();
            inner.wanted = false;
            inner.restart_delay = Duration::ZERO;
            inner.running.take()
        };
        if let Some(running) = running {
            tracing::info!(pid = running.pid, "device hub stopped");
            stop_pid(running.pid);
            let _ = std::fs::remove_file(self.tools.join(RECORD));
        }
    }

    pub fn running(&self) -> bool {
        self.inner.lock().running.is_some()
    }
}

/// SIGKILL to the hub's group and to anything that left it.
fn stop_pid(pid: u32) {
    #[cfg(unix)]
    if pid > 1 {
        let _ = crate::process_tree::stop_tree(pid);
    }
    #[cfg(not(unix))]
    let _ = pid;
}

fn free_port() -> Result<u16> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

/// A hub recorded by an earlier run is stopped only if that pid still runs
/// the same entry file (a reused pid is left alone).
fn reap_stale(record: &Path) {
    let Ok(text) = std::fs::read_to_string(record) else {
        return;
    };
    let _ = std::fs::remove_file(record);
    let Ok(record) = serde_json::from_str::<Record>(&text) else {
        return;
    };
    if record.pid <= 1 {
        return;
    }
    let Ok(output) = std::process::Command::new("/bin/ps")
        .args(["-o", "command=", "-p", &record.pid.to_string()])
        .output()
    else {
        return;
    };
    let command = String::from_utf8_lossy(&output.stdout);
    if command.contains(&*record.entry.to_string_lossy()) {
        tracing::warn!(
            pid = record.pid,
            "stopping a device hub left by an earlier run"
        );
        #[cfg(unix)]
        unsafe {
            libc::kill(-(record.pid as i32), libc::SIGKILL);
            libc::kill(record.pid as i32, libc::SIGKILL);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_ports_are_loopback_and_nonzero() {
        assert_ne!(free_port().unwrap(), 0);
    }

    #[test]
    fn a_stale_record_for_another_program_is_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(RECORD);
        // This test process is not a hub: it must survive.
        let record = Record {
            pid: std::process::id(),
            entry: dir.path().join("not-this-program.mjs"),
        };
        std::fs::write(&path, serde_json::to_string(&record).unwrap()).unwrap();
        reap_stale(&path);
        assert!(!path.exists());
    }
}
