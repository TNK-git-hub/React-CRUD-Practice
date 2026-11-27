# UI source

Visual source of truth for this project. Confirmed at `/onboard`. Features with no UI skip this file.

| Field | Value |
|---|---|
| mode | `figma` / `codebase` / `none` |
| Confirmed | |

## figma

Leave blank when mode is not `figma`.

- MCP server: (already connected; do not install one here)
- File URL:
- Screen pages:
- Design-system pages:
- Code Connect: yes / no
- Repo chrome that wins over the frame (buttons, inputs, shell):

## codebase

Leave blank when mode is not `codebase`.

| Role | Path | Notes |
|---|---|---|
| Components | | |
| Tokens | | |
| App shell | | |
| Reference screen | | 3–5 rows, paths you opened |

## Rules

- `none`: this project has no UI. Do not invent screens.
- `figma`: the node named in the spec is the layout source. Read it through the connected Figma Dev Mode MCP during BUILD. Generated code from that MCP is a reference, not production code. When Code Connect maps the node to a repo component, use that component. Paths in "repo chrome" supply buttons, inputs, and the shell.
- `codebase`: reuse layout, components, and tokens from the reference paths. A new visual pattern is a review finding.
- If the named node or reference file cannot be read, stop and ask. Do not design the screen from memory.
