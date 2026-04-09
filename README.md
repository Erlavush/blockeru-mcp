# Blockeru MCP

Blockeru MCP is a local MCP server that lets Codex orchestrate Blockbench through a thin localhost bridge plugin.

Current status:

- MCP server scaffold: implemented
- Blockbench bridge plugin: implemented as a starter bridge
- Live bridge primitives: health, create project, clear project, read project state, add cube, create texture, render preview
- High-level text-to-model orchestration: implemented
- High-level spec-to-model orchestration: implemented
- High-level image-guided planning and generation: implemented
- Image-guided measurement solving with block-to-unit anchors: implemented
- Observation-to-measurement extraction for uploaded images: implemented
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

## Measurement Model

Blockeru now supports image-guided measurement solving for Minecraft-style assets:

- `1 block = 16 x 16 x 16` model units
- a measurement anchor converts image pixels into model units
- measured axes override prompt heuristics
- unmeasured axes can still fall back to the base prompt/image-guided spec

Practical example:

- if the object width measures `160 px` in the reference image
- and that width is known to be `1 block`
- then the solver uses `16 / 160 = 0.1` model units per pixel

You can now also provide image observations instead of raw measurement JSON:

- image view, such as `front` or `side`
- one overall bounds rectangle
- optional per-part rectangles
- one known anchor dimension

The server will derive `measurementGuidance` automatically before solving final Blockbench units.

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
- add preview critique against reference images, not only geometric quality heuristics

## Current High-Level Tools

The MCP server now exposes these high-level orchestration tools:

- `build_asset_from_spec`
- `generate_asset_from_text`
- `generate_asset_from_image_guidance`
- `solve_image_measurements`
- `extract_measurement_guidance_from_observations`
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

When using image-guided measurement:

1. provide descriptive `imageGuidance`
2. either provide `measurementGuidance` directly, or provide `observationGuidance`
3. include one anchor dimension, like `width = 1 block`
4. include overall bounds and optional part bounds
5. let the solver convert image spans into snapped Blockbench units before the build starts

Important:

- `generate_asset_from_text` defaults to `projectMode="replace_current_project"`
- use `projectMode="new_project"` only when you explicitly want a separate Blockbench tab
- `generate_asset_from_image_guidance` expects structured observations about the reference image
- the MCP server still relies on Codex vision or another vision tool to turn an uploaded image into those structured observations
