import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../config.js";
import {
  CubeCreateInputSchema,
  GenerateAssetFromTextInputSchema,
  PreviewRenderInputSchema,
  ProjectCreateInputSchema,
  PromptAnalysisInputSchema,
  TextureCreateInputSchema,
} from "../contracts/schemas.js";
import { SERVER_VERSION } from "../constants.js";
import type { BridgeClient } from "../services/bridgeClient.js";
import { draftAssetSpecFromPrompt } from "../services/promptDrafting.js";
import { generateBlockbenchAssetFromText } from "../services/textBuildOrchestrator.js";
import {
  dataUrlToImagePayload,
  errorResult,
  okResult,
  okResultWithImage,
} from "./results.js";

type ToolDeps = {
  config: ServerConfig;
  bridge: BridgeClient;
};

export function registerTools(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "ping",
    {
      title: "Ping",
      description: "Check whether the Blockeru MCP server is running.",
      inputSchema: {},
    },
    async () =>
      okResult({
        server: deps.config.serverName,
        version: SERVER_VERSION,
        bridgeUrl: deps.bridge.baseUrl,
        now: new Date().toISOString(),
      }),
  );

  server.registerTool(
    "get_blockbench_status",
    {
      title: "Blockbench Status",
      description: "Check whether the Blockbench bridge plugin is reachable.",
      inputSchema: {},
    },
    async () => {
      try {
        const health = await deps.bridge.health();

        return okResult({
          bridgeUrl: deps.bridge.baseUrl,
          reachable: true,
          health,
          message: "Blockbench bridge is reachable.",
        });
      } catch (error) {
        return okResult({
          bridgeUrl: deps.bridge.baseUrl,
          reachable: false,
          health: null,
          message:
            error instanceof Error ? error.message : "Blockbench bridge is not reachable.",
        });
      }
    },
  );

  server.registerTool(
    "create_blockbench_project",
    {
      title: "Create Blockbench Project",
      description: "Create a new Blockbench project through the bridge plugin.",
      inputSchema: ProjectCreateInputSchema.shape,
    },
    async (input) => {
      try {
        const project = await deps.bridge.createProject(input);
        return okResult(project);
      } catch (error) {
        return errorResult("Failed to create Blockbench project.", error);
      }
    },
  );

  server.registerTool(
    "get_blockbench_project_state",
    {
      title: "Get Blockbench Project State",
      description: "Read the currently opened Blockbench project state.",
      inputSchema: {},
    },
    async () => {
      try {
        const project = await deps.bridge.getProjectState();
        return okResult(project);
      } catch (error) {
        return errorResult("Failed to read Blockbench project state.", error);
      }
    },
  );

  server.registerTool(
    "add_blockbench_cube",
    {
      title: "Add Blockbench Cube",
      description: "Add a cube to the current Blockbench project.",
      inputSchema: CubeCreateInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.addCube(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to add cube to Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "create_blockbench_texture",
    {
      title: "Create Blockbench Texture",
      description: "Create a texture inside the current Blockbench project from a data URL.",
      inputSchema: TextureCreateInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.createTexture(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to create texture in Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "render_blockbench_preview",
    {
      title: "Render Blockbench Preview",
      description: "Render the current Blockbench preview viewport and return it to the client.",
      inputSchema: PreviewRenderInputSchema.shape,
    },
    async (input) => {
      try {
        const preview = await deps.bridge.renderPreview(input);
        const image = dataUrlToImagePayload(preview.dataUrl);

        if (!image) {
          return errorResult("Blockbench returned an invalid preview payload.");
        }

        return okResultWithImage(
          {
            mimeType: preview.mimeType,
            width: preview.width,
            height: preview.height,
          },
          image,
        );
      } catch (error) {
        return errorResult("Failed to render Blockbench preview.", error);
      }
    },
  );

  server.registerTool(
    "generate_blockbench_asset_from_text",
    {
      title: "Generate Blockbench Asset From Text",
      description:
        "Create a fresh Blockbench project from a text prompt, plan a cube layout, generate a starter texture atlas, build the asset, and return a preview.",
      inputSchema: GenerateAssetFromTextInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await generateBlockbenchAssetFromText({
          bridge: deps.bridge,
          input,
        });

        if (result.preview) {
          const image = dataUrlToImagePayload(result.preview.dataUrl);

          if (image) {
            return okResultWithImage(
              {
                prompt: result.prompt,
                spec: result.spec,
                plan: result.plan,
                project: result.project,
                texture: result.texture,
                createdCubes: result.createdCubes,
                preview: {
                  mimeType: result.preview.mimeType,
                  width: result.preview.width,
                  height: result.preview.height,
                },
              },
              image,
            );
          }
        }

        return okResult(result);
      } catch (error) {
        return errorResult("Failed to generate the Blockbench asset from text.", error);
      }
    },
  );

  server.registerTool(
    "draft_asset_spec_from_prompt",
    {
      title: "Draft Asset Spec From Prompt",
      description:
        "Produce a structured starter asset spec from a text prompt. This is heuristic and intended to bootstrap the build plan.",
      inputSchema: PromptAnalysisInputSchema.shape,
    },
    async ({ prompt, formatId }) => {
      try {
        const spec = draftAssetSpecFromPrompt(prompt, formatId);
        return okResult(spec);
      } catch (error) {
        return errorResult("Failed to draft an asset spec from the prompt.", error);
      }
    },
  );
}
