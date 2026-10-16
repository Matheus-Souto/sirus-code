//! New project from a name: a fresh folder under a chosen parent with
//! `git init`, a README and a first commit. The folder name is a slug of the name, so the
//! renderer never supplies a path segment; existing non-empty folders are refused.
//! Clone (2026-10-12): a GitHub `owner/repo`, an `https://` or an SSH address is cloned into
//! `<parent>/<repo name>`; other transports, local paths and option-like input are refused.

use std::path::{Path, PathBuf};

use crate::error::{Error, Result};

const MAX_NAME_CHARS: usize = 100;
const MAX_SLUG_CHARS: usize = 64;

/// Lowercase ASCII letters, digits and single dashes; Portuguese accents fold to their letter.
pub(crate) fn slug(name: &str) -> Option<String> {
    let mut out = String::new();
    for c in name.trim().to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            other => other,
        };
        if c.is_ascii_alphanumeric() {
            out.push(c);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    let out: String = out.chars().take(MAX_SLUG_CHARS).collect();
    let out = out.trim_matches('-');
    (!out.is_empty()).then(|| out.to_string())
}

pub(crate) fn validate_name(name: &str) -> Result<(String, String)> {
    let name = name.trim();
    if name.is_empty()
        || name.chars().count() > MAX_NAME_CHARS
        || name.chars().any(char::is_control)
    {
        return Err(Error::new(
            "invalid_project_name",
            "Use a project name of 1–100 characters.",
        ));
    }
    let slug = slug(name).ok_or_else(|| {
        Error::new(
            "invalid_project_name",
            "The name needs at least one letter or digit.",
        )
    })?;
    Ok((name.to_string(), slug))
}

/// `~` and `~/…` become paths in the home folder; anything else is kept as typed.
pub(crate) fn expand_home(path: &str, home: Option<&Path>) -> PathBuf {
    match (path.strip_prefix('~'), home) {
        (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with('/') => {
            home.join(rest.trim_start_matches('/'))
        }
        _ => PathBuf::from(path),
    }
}

pub(crate) fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .filter(|home| home.is_absolute())
}

/// `~` / `~/…` expand to the home folder; anything else must already be absolute. A missing
/// parent is created only inside the home folder (the default is `~/Projetos`).
fn resolve_parent(parent: &str, home: Option<&Path>) -> Result<PathBuf> {
    let parent = parent.trim();
    if parent.is_empty() || parent.len() > 4096 || parent.chars().any(char::is_control) {
        return Err(Error::invalid_path("choose a parent folder"));
    }
    let raw = expand_home(parent, home);
    if !raw.is_absolute()
        || raw
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(Error::invalid_path(
            "the parent folder must be an absolute path",
        ));
    }
    if !raw.exists() {
        let inside_home = home.is_some_and(|home| raw.starts_with(home) && raw != home);
        if !inside_home {
            return Err(Error::invalid_path("the parent folder does not exist"));
        }
        std::fs::create_dir_all(&raw).map_err(|err| {
            Error::invalid_path(format!("cannot create the parent folder: {err}"))
        })?;
    }
    crate::paths::ensure_dir(&raw)
}

/// Creates `<parent>/<slug>` with Git, README.md and a first commit; returns the folder.
pub(crate) fn create(name: &str, parent: &str) -> Result<PathBuf> {
    create_in(name, parent, home_dir().as_deref(), &[])
}

/// `env` is only for tests (a fixed commit identity); the app uses the person's Git config.
fn create_in(
    name: &str,
    parent: &str,
    home: Option<&Path>,
    env: &[(&str, &std::ffi::OsStr)],
) -> Result<PathBuf> {
    let (name, slug) = validate_name(name)?;
    let target = resolve_parent(parent, home)?.join(&slug);
    let created = match std::fs::symlink_metadata(&target) {
        Ok(meta) => {
            let empty = meta.is_dir()
                && std::fs::read_dir(&target)
                    .map(|mut entries| entries.next().is_none())
                    .unwrap_or(false);
            if !empty {
                return Err(Error::new(
                    "project_exists",
                    format!("A folder named “{slug}” already exists there and is not empty."),
                ));
            }
            false
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(&target)
                .map_err(|err| Error::invalid_path(format!("cannot create the folder: {err}")))?;
            true
        }
        Err(err) => {
            return Err(Error::invalid_path(format!(
                "cannot inspect the folder: {err}"
            )))
        }
    };
    let result = initialize(&target, &name, env);
    if result.is_err() {
        // Undo only what this call made: the new folder, or the files written into an empty one.
        if created {
            let _ = std::fs::remove_dir_all(&target);
        } else {
            let _ = std::fs::remove_file(target.join("README.md"));
            let _ = std::fs::remove_dir_all(target.join(".git"));
        }
    }
    result.map(|()| target)
}

fn initialize(target: &Path, name: &str, env: &[(&str, &std::ffi::OsStr)]) -> Result<()> {
    let step = |args: &[&str]| -> Result<()> {
        let output = if env.is_empty() {
            crate::git::bounded_run(target, args)?
        } else {
            crate::git::run_env(target, args, env)?
        };
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(Error::git(if stderr.is_empty() {
            format!("git {} failed", args.join(" "))
        } else {
            stderr
        }))
    };
    step(&["init", "-q"])?;
    std::fs::write(target.join("README.md"), format!("# {name}\n"))
        .map_err(|err| Error::invalid_path(format!("cannot write README.md: {err}")))?;
    step(&["add", "--", "README.md"])?;
    step(&["commit", "-q", "-m", "Initial commit"])
}

/// A repository address the clone accepts: `owner/repo` and `github.com/owner/repo` become
/// GitHub `https` addresses; `https://`, `ssh://` and `git@host:path` pass through. Returns the
/// address and the repository's folder name.
pub(crate) fn clone_source(input: &str) -> Result<(String, String)> {
    let input = input.trim();
    let invalid = || {
        Error::new(
            "invalid_repository",
            "Use a GitHub owner/repo, an https:// address or a git@ address.",
        )
    };
    if input.is_empty()
        || input.len() > 2048
        || input.starts_with('-')
        || input.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err(invalid());
    }
    let short = |rest: &str| {
        let parts: Vec<&str> = rest.trim_end_matches('/').split('/').collect();
        let safe = |part: &str| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && part
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
        };
        (parts.len() == 2 && parts.iter().all(|part| safe(part)))
            .then(|| format!("https://github.com/{}/{}", parts[0], parts[1]))
    };
    let url = if let Some(rest) = input.strip_prefix("github.com/") {
        short(rest).ok_or_else(invalid)?
    } else if input.starts_with("https://") || input.starts_with("ssh://") {
        input.to_string()
    } else if let Some(rest) = input.strip_prefix("git@") {
        let (host, path) = rest.split_once(':').ok_or_else(invalid)?;
        if host.is_empty() || path.is_empty() || host.contains('/') {
            return Err(invalid());
        }
        input.to_string()
    } else {
        short(input).ok_or_else(invalid)?
    };
    let last = url
        .trim_end_matches('/')
        .rsplit(['/', ':'])
        .next()
        .unwrap_or_default();
    let name = last.strip_suffix(".git").unwrap_or(last).to_string();
    let valid_name = !name.is_empty()
        && name != "."
        && name != ".."
        && name.len() <= MAX_SLUG_CHARS
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if !valid_name {
        return Err(invalid());
    }
    Ok((url, name))
}

/// A folder name typed for a clone (the phone's optional "Folder name", ADR-131): one path
/// segment of ASCII letters, digits, `-`, `_` and `.`, never `.`/`..` or option-like.
pub(crate) fn clone_folder(input: &str) -> Result<String> {
    let name = input.trim();
    let valid = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.starts_with('-')
        && name.len() <= MAX_SLUG_CHARS
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if valid {
        Ok(name.to_string())
    } else {
        Err(Error::new(
            "invalid_project_name",
            "Use a folder name of letters, digits, dashes, dots or underscores.",
        ))
    }
}

/// An existing folder typed as a path (the phone has no folder picker, ADR-131): `~` expands,
/// and it must then be absolute, without `..`, and an existing directory.
pub(crate) fn typed_folder(path: &str, home: Option<&Path>) -> Result<PathBuf> {
    let path = path.trim();
    if path.is_empty() || path.len() > 4096 || path.chars().any(char::is_control) {
        return Err(Error::invalid_path("type the folder's full path"));
    }
    let raw = expand_home(path, home);
    if !raw.is_absolute()
        || raw
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(Error::invalid_path("the folder must be an absolute path"));
    }
    if !raw.exists() {
        return Err(Error::invalid_path("the folder does not exist"));
    }
    crate::paths::ensure_dir(&raw)
}

/// Clones a repository into `<parent>/<folder or repo name>`. Only `https` and `ssh`
/// transports run, SSH never prompts (BatchMode) and hooks stay off, as for every native Git
/// command. An existing folder of that name is refused.
pub(crate) fn clone(source: &str, parent: &str, folder: Option<&str>) -> Result<(PathBuf, String)> {
    let (url, repo) = clone_source(source)?;
    let name = match folder.map(str::trim).filter(|folder| !folder.is_empty()) {
        Some(folder) => clone_folder(folder)?,
        None => repo,
    };
    let parent = resolve_parent(parent, home_dir().as_deref())?;
    let target = parent.join(&name);
    match std::fs::symlink_metadata(&target) {
        Ok(_) => {
            return Err(Error::new(
                "project_exists",
                format!("A folder named “{name}” already exists there."),
            ))
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => {
            return Err(Error::invalid_path(format!(
                "cannot inspect the folder: {err}"
            )))
        }
    }
    let output = crate::git::run_env(
        &parent,
        &[
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.https.allow=always",
            "-c",
            "protocol.ssh.allow=always",
            "clone",
            "--quiet",
            "--",
            &url,
            &name,
        ],
        &[(
            "GIT_SSH_COMMAND",
            std::ffi::OsStr::new("ssh -o BatchMode=yes"),
        )],
    )?;
    if !output.status.success() {
        let _ = std::fs::remove_dir_all(&target);
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(Error::git(if stderr.is_empty() {
            "git clone failed".to_string()
        } else {
            stderr.chars().take(600).collect()
        }));
    }
    Ok((target, name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clone_sources_are_github_https_or_ssh_only() {
        let ok = |input: &str| clone_source(input).unwrap();
        assert_eq!(
            ok("viannaanalyst/sirus-code"),
            (
                "https://github.com/viannaanalyst/sirus-code".into(),
                "sirus-code".into()
            )
        );
        assert_eq!(ok("github.com/a/b.git/").1, "b");
        assert_eq!(ok("https://github.com/a/repo.git").1, "repo");
        assert_eq!(ok("git@github.com:a/my_repo.git").1, "my_repo");
        assert_eq!(ok("ssh://git@host.dev/team/app").1, "app");
        for bad in [
            "",
            "-uhttps://x/y",
            "--upload-pack=touch /tmp/x",
            "ext::sh -c touch% /tmp/x",
            "file:///etc",
            "/Users/me/repo",
            "../repo",
            "a/b/c",
            "https://host/..",
            "git@host",
            "http://github.com/a/b",
            "a b/c",
        ] {
            assert!(clone_source(bad).is_err(), "{bad}");
        }
    }

    /// Needs the network: `cargo test clones_a_public_repository -- --ignored`.
    #[test]
    #[ignore]
    fn clones_a_public_repository() {
        let parent = std::env::temp_dir().join(format!("sirus-clone-{}", std::process::id()));
        std::fs::create_dir_all(&parent).unwrap();
        let parent_text = parent.to_string_lossy().into_owned();
        let (path, name) = clone("octocat/Hello-World", &parent_text, None).unwrap();
        assert_eq!(name, "Hello-World");
        assert!(path.join(".git").is_dir() && path.join("README").is_file());
        assert!(clone("octocat/Hello-World", &parent_text, None).is_err());
        assert!(clone("octocat/does-not-exist-sirus", &parent_text, None).is_err());
        assert!(!parent.join("does-not-exist-sirus").exists());
        let _ = std::fs::remove_dir_all(&parent);
    }

    #[test]
    fn slugs_fold_accents_and_keep_only_safe_characters() {
        assert_eq!(
            slug("Meu Projeto Incrível").as_deref(),
            Some("meu-projeto-incrivel")
        );
        assert_eq!(slug("  ../../etc/passwd ").as_deref(), Some("etc-passwd"));
        assert_eq!(slug("Ação & Reação!").as_deref(), Some("acao-reacao"));
        assert_eq!(slug("🚀🚀"), None);
        assert_eq!(slug("---"), None);
        assert!(slug(&"a".repeat(200)).unwrap().len() <= MAX_SLUG_CHARS);
        assert!(validate_name("").is_err());
        assert!(validate_name("bad\nname").is_err());
        assert!(validate_name(&"x".repeat(101)).is_err());
        assert_eq!(
            validate_name(" Sirus ").unwrap(),
            ("Sirus".into(), "sirus".into())
        );
    }

    #[test]
    fn clone_folders_are_one_safe_segment() {
        assert_eq!(clone_folder(" my-app_2.0 ").unwrap(), "my-app_2.0");
        for bad in [
            "",
            " ",
            ".",
            "..",
            "-x",
            "a/b",
            "../x",
            "a b",
            "ação",
            &"x".repeat(65),
        ] {
            assert!(clone_folder(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn typed_folders_must_be_absolute_existing_directories() {
        let root = std::env::temp_dir().join(format!("sirus-typed-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("repo")).unwrap();
        std::fs::write(root.join("file.txt"), "x").unwrap();
        let home = root.canonicalize().unwrap();
        assert_eq!(
            typed_folder("~/repo", Some(&home)).unwrap(),
            home.join("repo")
        );
        assert_eq!(
            typed_folder(&format!(" {} ", home.join("repo").display()), None).unwrap(),
            home.join("repo")
        );
        for bad in [
            "".to_string(),
            "repo".to_string(),
            "./repo".to_string(),
            format!("{}/repo/../repo", home.display()),
            format!("{}/missing", home.display()),
            format!("{}/file.txt", home.display()),
            "~/missing".to_string(),
        ] {
            assert!(typed_folder(&bad, Some(&home)).is_err(), "{bad}");
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn parents_must_be_absolute_and_are_created_only_inside_home() {
        let root = std::env::temp_dir().join(format!("sirus-new-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let home = root.canonicalize().unwrap();
        assert!(resolve_parent("relative/dir", Some(&home)).is_err());
        assert!(resolve_parent("/nonexistent-sirus-parent/x", Some(&home)).is_err());
        assert!(resolve_parent(&format!("{}/a/../b", home.display()), Some(&home)).is_err());
        assert_eq!(
            resolve_parent("~/Projetos", Some(&home)).unwrap(),
            home.join("Projetos")
        );
        assert!(resolve_parent("~other/x", Some(&home)).is_err());
        assert_eq!(expand_home("~/a", Some(&home)), home.join("a"));
        assert_eq!(expand_home("~", Some(&home)), home);
        assert_eq!(expand_home("~x", Some(&home)), PathBuf::from("~x"));
        assert_eq!(expand_home("~/a", None), PathBuf::from("~/a"));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn creates_a_committed_repository_and_refuses_non_empty_folders() {
        let root = std::env::temp_dir().join(format!("sirus-new-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let home = root.canonicalize().unwrap();
        // A fixed identity so the first commit works on any machine.
        let env = [
            ("GIT_AUTHOR_NAME", std::ffi::OsStr::new("Sirus Test")),
            (
                "GIT_AUTHOR_EMAIL",
                std::ffi::OsStr::new("test@example.invalid"),
            ),
            ("GIT_COMMITTER_NAME", std::ffi::OsStr::new("Sirus Test")),
            (
                "GIT_COMMITTER_EMAIL",
                std::ffi::OsStr::new("test@example.invalid"),
            ),
            ("GIT_CONFIG_NOSYSTEM", std::ffi::OsStr::new("1")),
            ("GIT_CONFIG_GLOBAL", std::ffi::OsStr::new("/dev/null")),
        ];
        let target = create_in("Meu App", "~/Projetos", Some(&home), &env).unwrap();
        assert_eq!(target, home.join("Projetos/meu-app"));
        assert_eq!(
            std::fs::read_to_string(target.join("README.md")).unwrap(),
            "# Meu App\n"
        );
        let log = crate::git::run_ok(&target, &["log", "--pretty=%s"]).unwrap();
        assert_eq!(log, "Initial commit");
        let again = create_in("meu app", "~/Projetos", Some(&home), &env).unwrap_err();
        assert!(matches!(
            again,
            Error::App {
                code: "project_exists",
                ..
            }
        ));
        // An empty folder of that name is reused.
        std::fs::create_dir(home.join("Projetos/vazio")).unwrap();
        assert!(create_in("Vazio", "~/Projetos", Some(&home), &env).is_ok());
        // A failed step removes the folder it created.
        let broken = [(
            "GIT_DIR",
            std::ffi::OsStr::new("/nonexistent-sirus-git-dir"),
        )];
        assert!(create_in("Quebrado", "~/Projetos", Some(&home), &broken).is_err());
        assert!(!home.join("Projetos/quebrado").exists());
        let _ = std::fs::remove_dir_all(&root);
    }
}
