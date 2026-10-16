//! The pinned `expo-device-hub` install (ADR-128) and the Node.js and Xcode it
//! needs. Nothing here downloads anything until the person presses Install in
//! the Devices pane: the package is then installed with the person's own npm
//! into `<app data>/tools/expo-device-hub/<version>` and run from there with
//! Node, never through `npx` (an npx cache would make every first start after
//! a reboot depend on the registry, and the version is part of the contract).
//!
//! The install is staged into a sibling folder; a sentinel holding the version
//! is written only after npm exits 0 and the entry file exists, and the folder
//! is then renamed into place. npm extracts files before it finishes, so an
//! entry file alone does not prove a usable tree.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tokio::process::Command;

use crate::error::{Error, Result};

pub const HUB_PACKAGE: &str = "expo-device-hub";
pub const HUB_VERSION: &str = "0.15.3";
/// Node.js the hub supports.
pub const NODE_MAJOR: u32 = 22;
const ENTRY: [&str; 3] = ["dist", "server", "cli.mjs"];
const SENTINEL: &str = ".install-complete";
const INSTALL_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const PROBE_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub struct Node {
    pub path: PathBuf,
    pub version: String,
    pub major: u32,
}

impl Node {
    pub fn ok(&self) -> bool {
        self.major >= NODE_MAJOR && self.npm().is_some()
    }

    /// npm beside this Node (Homebrew, nvm, the official installer and Volta all put it there).
    pub fn npm(&self) -> Option<PathBuf> {
        let npm = self.path.parent()?.join("npm");
        npm.exists().then_some(npm)
    }

    /// PATH for the hub and npm: Node's own folder first, so `#!/usr/bin/env node` finds it.
    pub fn child_path(&self) -> std::ffi::OsString {
        let mut dirs: Vec<PathBuf> = self
            .path
            .parent()
            .map(Path::to_path_buf)
            .into_iter()
            .collect();
        dirs.extend(std::env::split_paths(&crate::detect::cli_path()));
        dirs.extend(["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(PathBuf::from));
        std::env::join_paths(dirs).unwrap_or_default()
    }
}

pub fn install_dir(tools: &Path) -> PathBuf {
    tools.join(HUB_PACKAGE).join(HUB_VERSION)
}

pub fn entry(tools: &Path) -> PathBuf {
    let mut path = install_dir(tools).join("node_modules").join(HUB_PACKAGE);
    path.extend(ENTRY);
    path
}

pub fn installed(tools: &Path) -> bool {
    let sentinel = std::fs::read_to_string(install_dir(tools).join(SENTINEL)).unwrap_or_default();
    sentinel.trim() == HUB_VERSION && entry(tools).is_file()
}

/// `v22.11.0` → 22.
pub fn node_major(version: &str) -> Option<u32> {
    version
        .trim()
        .strip_prefix('v')?
        .split('.')
        .next()?
        .parse()
        .ok()
}

/// Folders a Node install usually lives in when the app starts from Finder
/// without the shell's PATH: the app's CLI PATH, then version managers.
fn node_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&crate::detect::cli_path()).collect();
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if home.is_absolute() {
            // nvm: newest version first.
            let mut versions: Vec<(Vec<u32>, PathBuf)> =
                std::fs::read_dir(home.join(".nvm/versions/node"))
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter_map(|entry| {
                        let name = entry.file_name().to_string_lossy().into_owned();
                        let parts = name
                            .strip_prefix('v')?
                            .split('.')
                            .map(|part| part.parse().ok())
                            .collect::<Option<Vec<u32>>>()?;
                        Some((parts, entry.path().join("bin")))
                    })
                    .collect();
            versions.sort_by(|a, b| b.0.cmp(&a.0));
            dirs.extend(versions.into_iter().map(|(_, dir)| dir));
            for relative in [
                ".volta/bin",
                ".local/share/fnm/aliases/default/bin",
                ".local/share/mise/shims",
                ".asdf/shims",
            ] {
                dirs.push(home.join(relative));
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    dirs.retain(|dir| seen.insert(dir.clone()));
    dirs
}

/// The first Node.js 22+ with npm beside it; otherwise the newest one found, so
/// the pane can say which version is too old.
pub async fn find_node() -> Option<Node> {
    let mut best: Option<Node> = None;
    for dir in node_dirs() {
        let path = dir.join("node");
        if !path.is_file() {
            continue;
        }
        let Some(version) = node_version(&path).await else {
            continue;
        };
        let Some(major) = node_major(&version) else {
            continue;
        };
        let node = Node {
            path,
            version,
            major,
        };
        if node.ok() {
            return Some(node);
        }
        if best.as_ref().is_none_or(|best| best.major < node.major) {
            best = Some(node);
        }
    }
    best
}

async fn node_version(path: &Path) -> Option<String> {
    let mut command = Command::new(path);
    command
        .arg("--version")
        .env("PATH", crate::detect::cli_path());
    let output = crate::cli_output::capture_command(command, PROBE_TIMEOUT)
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (version.starts_with('v') && version.len() <= 32).then_some(version)
}

/// Xcode's `simctl` answers (macOS only).
pub async fn xcode_available() -> bool {
    if !cfg!(target_os = "macos") {
        return false;
    }
    let mut command = Command::new("/usr/bin/xcrun");
    command
        .args(["--find", "simctl"])
        .env("PATH", "/usr/bin:/bin:/usr/sbin:/sbin");
    crate::cli_output::capture_command(command, PROBE_TIMEOUT)
        .await
        .is_ok_and(|output| output.status.success())
}

/// npm-installs the pinned hub (with install scripts off: the hub's optional
/// WebRTC module is never used) and publishes it atomically.
pub async fn install(tools: &Path, node: &Node) -> Result<()> {
    if installed(tools) {
        return Ok(());
    }
    let npm = node
        .npm()
        .ok_or_else(|| Error::new("devices", "npm was not found next to Node.js."))?;
    let parent = tools.join(HUB_PACKAGE);
    let target = install_dir(tools);
    std::fs::create_dir_all(&parent)?;
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    let staging = parent.join(format!(".staging-{}", uuid::Uuid::new_v4().simple()));
    std::fs::create_dir_all(&staging)?;
    let result = stage(&staging, &npm, node).await.and_then(|()| {
        std::fs::write(staging.join(SENTINEL), format!("{HUB_VERSION}\n"))?;
        match std::fs::rename(&staging, &target) {
            Ok(()) => Ok(()),
            Err(_) if installed(tools) => Ok(()),
            Err(error) => Err(error.into()),
        }
    });
    let _ = std::fs::remove_dir_all(&staging);
    if result.is_ok() {
        prune_old_versions(&parent);
    }
    result
}

async fn stage(staging: &Path, npm: &Path, node: &Node) -> Result<()> {
    let mut command = Command::new(npm);
    command
        .arg("install")
        .arg("--prefix")
        .arg(staging)
        .args([
            "--no-fund",
            "--no-audit",
            "--ignore-scripts",
            "--omit=dev",
            "--no-update-notifier",
            "--loglevel=error",
        ])
        .arg(format!("{HUB_PACKAGE}@{HUB_VERSION}"))
        .current_dir(staging)
        .env("PATH", node.child_path())
        .env("npm_config_update_notifier", "false");
    let output = crate::cli_output::capture_command(command, INSTALL_TIMEOUT)
        .await
        .map_err(|error| Error::new("devices", format!("npm could not run: {error}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let last = stderr
            .lines()
            .rev()
            .find(|line| !line.trim().is_empty())
            .unwrap_or("no output");
        return Err(Error::new(
            "devices",
            format!(
                "npm install failed ({}): {}",
                output.status,
                last.chars().take(300).collect::<String>()
            ),
        ));
    }
    let mut entry = staging.join("node_modules").join(HUB_PACKAGE);
    entry.extend(ENTRY);
    if !entry.is_file() {
        return Err(Error::new(
            "devices",
            "npm finished but the device hub's entry file is missing.",
        ));
    }
    Ok(())
}

/// Older pinned versions are removed once the current one is in place.
fn prune_old_versions(parent: &Path) {
    let Ok(entries) = std::fs::read_dir(parent) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let semver =
            name.split('.').count() == 3 && name.split('.').all(|part| part.parse::<u32>().is_ok());
        if semver && name != HUB_VERSION {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn node_versions_parse() {
        assert_eq!(node_major("v22.11.0"), Some(22));
        assert_eq!(node_major("v26.9.0\n"), Some(26));
        assert_eq!(node_major("22.1.0"), None);
        assert_eq!(node_major("vX"), None);
    }

    #[test]
    fn an_install_counts_only_with_its_sentinel_and_entry() {
        let dir = tempfile::tempdir().unwrap();
        assert!(!installed(dir.path()));
        let entry = entry(dir.path());
        std::fs::create_dir_all(entry.parent().unwrap()).unwrap();
        std::fs::write(&entry, "").unwrap();
        assert!(!installed(dir.path()), "npm may have stopped half way");
        std::fs::write(install_dir(dir.path()).join(SENTINEL), "0.0.1\n").unwrap();
        assert!(!installed(dir.path()), "another version's sentinel");
        std::fs::write(
            install_dir(dir.path()).join(SENTINEL),
            format!("{HUB_VERSION}\n"),
        )
        .unwrap();
        assert!(installed(dir.path()));
    }

    #[test]
    fn pruning_keeps_the_pinned_version_and_staging() {
        let dir = tempfile::tempdir().unwrap();
        for name in ["0.1.0", HUB_VERSION, ".staging-x", "notes"] {
            std::fs::create_dir_all(dir.path().join(name)).unwrap();
        }
        prune_old_versions(dir.path());
        assert!(!dir.path().join("0.1.0").exists());
        assert!(dir.path().join(HUB_VERSION).exists());
        assert!(dir.path().join(".staging-x").exists());
        assert!(dir.path().join("notes").exists());
    }
}
