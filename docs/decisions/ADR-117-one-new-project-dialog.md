# ADR-117: One "New project" dialog

**Status:** Accepted (2026-10-12). Refines ADR-074.

## Context

The project switcher and the landing project menu had two entries side by side: "New project" opened the native folder picker, and "Create new project…" opened the dialog that makes a folder with Git. The owner found the pair confusing and asked for a single button.

## Decision

- **One entry.** The switcher, the landing project menu and the palette now have one "New project" entry, which opens the dialog.
- **Three cards.** The dialog opens with three cards, each with an icon and one short line (chosen from six previews), and no rule under the title (the dialog's `plain` variant). The fields for the chosen card follow:
  - "Open folder" takes a path, typed or chosen with Choose…, and adds it like the picker did (`openProjectPath` in the store);
  - "Create from scratch" is the earlier form: a name and a parent folder;
  - "Clone from GitHub" takes a repository and a parent folder (below).
- **Fixed size.** The three sets of fields share one grid cell and only the chosen one is visible (the others are `inert`), so the dialog keeps its height when the card changes.
- **Clone.** `clone_project` (`new_project::clone`) accepts a GitHub `owner/repo` or `github.com/owner/repo` (made `https://github.com/…`), an `https://` or `ssh://` address, or `git@host:path`. Option-like input, whitespace, local paths and other transports (`file`, `ext::`) are refused, and Git runs with `protocol.allow=never` except `https` and `ssh`, so a crafted address cannot reach another transport. SSH runs in `BatchMode` and Git never prompts, so a private repository without credentials fails instead of hanging. The clone goes to `<parent>/<repo name>`; an existing folder of that name is refused, and a failed clone removes what it wrote. Hooks stay off as for every native Git command. The project is added under the repository's name and opens in a new thread.
- **Last choice remembered.** The dialog reopens on the card used last (`sirus.newProjectMode` in local storage), starting on "Open folder".
- **`~` paths.** `add_project` expands a leading `~` the same way `create_project` does, through `new_project::expand_home`, so typed paths work.
- **⌘O unchanged.** "Open Project" (⌘O) still goes straight to the native picker.
