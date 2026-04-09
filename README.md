# Blockeru MCP

Blockeru MCP is a local MCP server that lets Codex orchestrate Blockbench through a thin localhost bridge plugin.

Current status:

- MCP server scaffold: implemented
- Blockbench bridge plugin: implemented as a starter bridge
- Live bridge primitives: health, create project, clear project, read project state, add cube, create texture, render preview
- High-level text-to-model orchestration: implemented
- High-level spec-to-model orchestration: implemented
- High-level image-guided planning and generation: implemented
- Post-build quality scoring and UV/texture diagnostics: implemented

## Repo Layout

- `src/`: MCP server implementation
- `blockbench-plugin/`: Blockbench desktop plugin bridge
- `PLAN.md`: product and implementation plan

## How It Works

1. Codex connects to the local MCP server over `stdio`
2. The MCP server calls the Blockbench bridge over localhost HTTP
3. The Blockbench plugin executes deterministic edits inside Blockbench
4. Codex iterates using project state and rendered previews

## Install

```bash
npm install
npm run build
```

## Run The MCP Server

```bash
node dist/index.js
```

Default bridge URL:

```text
http://127.0.0.1:37891/blockeru-bridge
```

Override it with:

```text
BLOCKERU_BRIDGE_URL=http://127.0.0.1:37891/blockeru-bridge
```

## Load The Blockbench Plugin

In Blockbench Desktop:

1. Open `File > Plugins > Load Plugin from File`
2. Select `blockbench-plugin/blockeru_mcp_bridge.js`
3. Allow local network access if Blockbench prompts for it

The plugin starts a localhost bridge on:

```text
http://127.0.0.1:37891/blockeru-bridge
```

## Codex Example

After building, add the MCP server to Codex:

```bash
codex mcp add blockeru --command node --args Z:\\blockeru-mcp\\dist\\index.js
```

## Next Steps

- add groups, bones, UV tools, and export tools
- add real image-analysis ingestion instead of structured image guidance only
- add preview critique and repair loop

## Current High-Level Tools

The MCP server now exposes these high-level orchestration tools:

- `build_asset_from_spec`
- `generate_asset_from_text`
- `generate_asset_from_image_guidance`
- `generate_blockbench_asset_from_text` as a backward-compatible alias

These tools follow the same core flow:

1. drafts an asset spec from the prompt
2. replaces the current Blockbench project contents by default, or creates a fresh project if requested
3. plans deterministic cube placement
4. generates a procedural material atlas
5. packs UV islands across the atlas by material slot
6. builds the cubes in Blockbench
7. scores the result with a quality report
8. renders a preview back to the MCP client

Important:

- `generate_asset_from_text` defaults to `projectMode="replace_current_project"`
- use `projectMode="new_project"` only when you explicitly want a separate Blockbench tab
- `generate_asset_from_image_guidance` expects structured observations about the reference image
- the MCP server still relies on Codex vision or another vision tool to turn an uploaded image into those structured observations
