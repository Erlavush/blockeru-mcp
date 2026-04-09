# Blockeru MCP Plan

## Goal

Build this folder into an MCP server that lets Codex control Blockbench and generate a usable model project from:

- text prompts
- user-supplied reference images

The target output is not "perfect arbitrary 3D from any photo". The realistic v1 goal is:

- Blockbench-ready low-poly / cube-based assets
- simple UV + texture generation
- iterative preview and repair inside Blockbench
- exportable `.bbmodel` plus texture assets

## Reality Check

The difficult part is not MCP transport. Existing open-source projects already prove that Blockbench can expose MCP-compatible or MCP-adjacent control surfaces.

The difficult part is the orchestration layer:

1. interpret text or image input
2. convert it into a structured asset specification
3. convert that specification into deterministic Blockbench edits
4. render previews
5. compare preview vs. prompt/reference
6. repair until acceptable

That orchestration is the real value of this repo.

## Recommended Product Shape

Use a two-part architecture:

1. `blockeru-mcp` Node/TypeScript server
2. Blockbench companion plugin

The Node server is the MCP server that Codex connects to.
The Blockbench plugin is the execution bridge inside the Blockbench desktop app.

Why this split:

- Codex works naturally with a Node MCP server
- image preprocessing and orchestration are easier in Node than inside a Blockbench plugin
- the Blockbench plugin can stay small and deterministic
- the transport layer and the AI orchestration layer stay decoupled

## Recommended v1 Scope

Constrain v1 hard. Do not promise general 3D reconstruction.

Recommended supported asset classes:

- Minecraft-style block/item assets
- cube-based furniture
- room props with simple silhouettes
- stylized low-poly objects

Recommended reference inputs:

- text-only prompts
- one reference image with a clear silhouette
- ideally front/side orthographic-style references

Avoid in v1:

- arbitrary real-world photos with complex perspective
- organic characters from a single image
- "perfect" texture recreation from photographs
- complex animation generation

## Core Architecture

### 1. MCP Server Layer

This repo should expose a standard MCP server over `stdio` first.

Primary responsibilities:

- receive tool calls from Codex
- validate arguments
- manage sessions/config
- preprocess reference images
- generate structured asset plans
- call the Blockbench bridge
- return previews, logs, and exported file paths

### 2. Blockbench Bridge Plugin

The plugin should expose a localhost API to the Node MCP server.

Recommended transport:

- localhost HTTP or WebSocket

Primary responsibilities:

- read current project state
- create/open/save projects
- create/update/delete cubes or meshes
- create groups/bones
- manage UVs
- create/update/read textures
- render preview screenshots
- export assets

The plugin should stay deterministic and tool-level. It should not contain the high-level "AI thinking".

### 3. Generation Pipeline

Use this internal pipeline:

1. `input -> AssetSpec`
2. `AssetSpec -> BuildPlan`
3. `BuildPlan -> Blockbench operations`
4. `render_preview`
5. `preview critique`
6. `repair pass`
7. `export`

## Internal Data Models

### AssetSpec

Structured intent extracted from text/image.

Suggested fields:

- `assetType`
- `style`
- `targetFormat`
- `dimensions`
- `symmetry`
- `palette`
- `materials`
- `parts[]`
- `textureStrategy`
- `constraints`
- `referenceImages[]`

### BuildPlan

Deterministic instructions that the bridge can execute.

Suggested fields:

- `project`
- `groups`
- `elements`
- `uvCommands`
- `textureCommands`
- `validationRules`
- `exportTargets`

## MCP Tool Surface

Recommended first-pass tools:

- `ping`
- `get_blockbench_status`
- `connect_blockbench`
- `create_project`
- `get_project_state`
- `analyze_text_prompt`
- `analyze_reference_image`
- `generate_asset_spec`
- `build_asset_from_spec`
- `render_preview`
- `repair_asset_from_feedback`
- `export_asset`

Important note:

Do not start with a single giant tool like `make_model_from_image_perfectly`.
That hides failure modes and makes debugging hard.

Expose composable tools first, then optionally add a high-level convenience tool later:

- `generate_asset_from_text`
- `generate_asset_from_image`

These convenience tools should internally use the lower-level pipeline.

## Preview and Repair Loop

This is essential if the goal is quality.

Loop:

1. generate initial build
2. render preview
3. compare preview against prompt/reference
4. produce structured change requests
5. apply repair edits
6. stop after score threshold or max iteration count

Suggested stop conditions:

- similarity/quality score reached
- no high-confidence fixes remain
- max 3 to 5 repair loops

## Image Handling Strategy

Do not assume the MCP server itself automatically receives raw ChatGPT/Codex image attachments.

Design for explicit image handling:

- local file path
- URL
- base64 payload

For Codex specifically, the model may understand the attached image in-chat, but the server should still support explicit image inputs so the workflow is portable and testable.

Recommended v1 image analysis:

- dominant silhouette
- approximate bounding box
- part segmentation hints
- palette extraction
- symmetry detection
- rough material classification

## Recommendation on External Dependencies

Best reference project to learn from:

- `sigee-min/ashfox`

Reason:

- closest to the deterministic tool-level model
- explicitly exposes modeling, texturing, preview, validation, and export operations
- MIT licensed

Secondary reference:

- `jasonjgardner/blockbench-mcp-plugin`

Reason:

- more mature and more widely adopted
- useful reference for transport, packaging, and client setup
- GPL-3.0, so use as inspiration carefully if license flexibility matters

Do not use `enfp-dev-studio/blockbench-mcp` as the main base unless its code quality checks out during implementation. It is relevant, but it currently looks much earlier-stage.

## Recommended Build Phases

### Phase 0. Define the contract

- choose target asset domain
- choose supported export formats
- decide whether v1 is cube-only or also mesh-capable
- define success criteria for text and image workflows

### Phase 1. Scaffold the repo

- initialize Node/TypeScript MCP server
- define config system
- define shared schemas for `AssetSpec` and `BuildPlan`
- add logging and error handling

### Phase 2. Build the Blockbench plugin bridge

- create plugin skeleton
- expose localhost transport
- implement project/session tools
- implement minimal element operations
- implement preview screenshot tool

### Phase 3. Add deterministic low-level editing tools

- groups/bones
- cubes
- optional meshes
- texture creation/update
- UV assignment
- validation
- export

### Phase 4. Add text-to-asset pipeline

- prompt parsing
- structured `AssetSpec`
- `BuildPlan` generation
- execution in Blockbench

### Phase 5. Add image-to-asset pipeline

- explicit image input support
- image preprocessing
- palette + silhouette extraction
- part inference
- map to `AssetSpec`

### Phase 6. Add preview critique and repair

- preview render tool
- structured difference report
- patch plan generation
- iterative repair loop

### Phase 7. Add DX and documentation

- Codex setup guide
- Blockbench plugin install guide
- sample prompts
- troubleshooting

### Phase 8. Add tests

- schema validation tests
- planner tests
- transport contract tests
- golden tests for asset specs
- manual E2E checklist with Blockbench desktop

## Success Criteria for v1

v1 is successful if Codex can reliably do this:

1. connect to Blockbench
2. create a new project
3. generate a simple blockbench-ready asset from text
4. generate a simple blockbench-ready asset from one clean reference image
5. render a preview
6. apply one or more repair passes
7. export the final model and texture files

## Biggest Risks

- trying to support arbitrary photos too early
- building only high-level tools without deterministic low-level primitives
- putting too much logic inside the Blockbench plugin
- skipping preview/repair iteration
- unclear scope between cube modeling and mesh modeling
- texture generation quality becoming the real bottleneck

## Recommendation

Build this repo as the orchestration-first MCP server, with a small Blockbench plugin as the execution bridge.

For implementation strategy:

- reference Ashfox for deterministic Blockbench capabilities
- keep the plugin thin
- keep the MCP server smart
- target constrained Blockbench assets first
- ship text workflow before image workflow
