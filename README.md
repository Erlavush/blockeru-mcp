# Blockeru MCP

Blockeru MCP is a local MCP server that lets Codex orchestrate Blockbench through a thin localhost bridge plugin.

Current status:

- MCP server scaffold: implemented
- Blockbench bridge plugin: implemented as a starter bridge
- Live bridge primitives: health, create project, read project state, add cube, create texture, render preview
- High-level image-to-model orchestration: planned next

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
- add prompt-to-asset planning
- add image-to-asset planning
- add preview critique and repair loop
