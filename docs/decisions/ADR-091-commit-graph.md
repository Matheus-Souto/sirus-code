# ADR-091: Commit graph

**Status:** Accepted

## Context

The Changes pane drew history as two-line rows, 56 px tall, with one colour and loose curves. A compact graph adapted from VS Code (MIT) fixes that: one 22 px row per commit, a colour per branch, arcs at merges, a ringed HEAD and ref pills. The owner wanted the same drawing with Sirus's colours, and chose them from four previews.

## Decision

- `src/lib/git-graph.ts` derives from VS Code's `scmHistory.ts` through an MIT intermediary; their notices are in `THIRD-PARTY-NOTICES.md`.
- Each row gets its own SVG: the previous row's output lanes become the next row's input lanes, and curves are arcs.
- The colours are Sirus's: the current branch is lilac `#8C9BFF`, its upstream `#B9A3FF`, and new branches cycle through the Astro colours (orange, green, yellow, pink, teal).
- `graphCommitFromDecorations` turns the `git log %D` decorations Sirus already reads into a head flag and typed refs (local, remote, tag).
- `GitHistory` shows the subject and author on one line, with a tag pill when there is one (otherwise the first ref).
- Node cutouts use the pane colour.

## Consequences

- No native change: the history command and its `--topo-order` output are the same.
- A local branch with a slash in its name is coloured as a remote one. This only affects its colour.
