import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../config.js";
import {
  BuildAssetFromSpecInputSchema,
  CubeCreateInputSchema,
  DraftAssetSpecFromImageInputSchema,
  ExtractMeasurementGuidanceInputSchema,
  GenerateAssetFromImageInputSchema,
  GenerateAssetFromTextInputSchema,
  PreviewRenderInputSchema,
  ProjectClearInputSchema,
  ProjectCreateInputSchema,
  PromptAnalysisInputSchema,
  SolveImageMeasurementsInputSchema,
  TextureCreateInputSchema,
} from "../contracts/schemas.js";
import { SERVER_VERSION } from "../constants.js";
import type { BridgeClient } from "../services/bridgeClient.js";
import {
  draftAssetSpecFromImageGuidance,
  draftAssetSpecFromImageGuidanceDetailed,
} from "../services/imageGuidancePlanning.js";
import { draftAssetSpecFromPrompt } from "../services/promptDrafting.js";
import { extractMeasurementGuidanceFromObservations } from "../services/imageObservationExtraction.js";
import { buildBlockbenchAssetFromSpec } from "../services/specBuildOrchestrator.js";
import { generateBlockbenchAssetFromImageGuidance } from "../services/imageBuildOrchestrator.js";
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

function okResultFromGeneratedAsset<T extends { preview: { mimeType: string; width: number; height: number; dataUrl: string } | null }>(
  result: T,
) {
  if (result.preview) {
    const image = dataUrlToImagePayload(result.preview.dataUrl);

    if (image) {
      return okResultWithImage(
        {
          ...result,
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
}

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
    "clear_blockbench_project",
    {
      title: "Clear Blockbench Project",
      description:
        "Remove cubes and textures from the currently open Blockbench project while keeping the current tab open.",
      inputSchema: ProjectClearInputSchema.shape,
    },
    async (input) => {
      try {
        const project = await deps.bridge.clearProject(input);
        return okResult(project);
      } catch (error) {
        return errorResult("Failed to clear the current Blockbench project.", error);
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
    "build_asset_from_spec",
    {
      title: "Build Asset From Spec",
      description:
        "Build a Blockbench asset from an explicit structured asset spec using the deterministic planner, texture generator, and bridge.",
      inputSchema: BuildAssetFromSpecInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await buildBlockbenchAssetFromSpec({
          bridge: deps.bridge,
          input,
        });

        return okResultFromGeneratedAsset(result);
      } catch (error) {
        return errorResult("Failed to build the Blockbench asset from the supplied spec.", error);
      }
    },
  );

  server.registerTool(
    "generate_asset_from_text",
    {
      title: "Generate Asset From Text",
      description:
        "Draft an asset spec from a text prompt, build it in Blockbench, and return a preview image when available.",
      inputSchema: GenerateAssetFromTextInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await generateBlockbenchAssetFromText({
          bridge: deps.bridge,
          input,
        });

        return okResultFromGeneratedAsset(result);
      } catch (error) {
        return errorResult("Failed to generate the Blockbench asset from text.", error);
      }
    },
  );

  server.registerTool(
    "generate_blockbench_asset_from_text",
    {
      title: "Generate Blockbench Asset From Text",
      description:
        "Backward-compatible alias for generate_asset_from_text.",
      inputSchema: GenerateAssetFromTextInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await generateBlockbenchAssetFromText({
          bridge: deps.bridge,
          input,
        });

        return okResultFromGeneratedAsset(result);
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

  server.registerTool(
    "draft_asset_spec_from_image_guidance",
    {
      title: "Draft Asset Spec From Image Guidance",
      description:
        "Turn structured observations about an uploaded reference image into an asset spec that can be built deterministically in Blockbench.",
      inputSchema: DraftAssetSpecFromImageInputSchema.shape,
    },
    async (input) => {
      try {
        const spec = draftAssetSpecFromImageGuidance(input);
        return okResult(spec);
      } catch (error) {
        return errorResult("Failed to draft an asset spec from image guidance.", error);
      }
    },
  );

  server.registerTool(
    "solve_image_measurements",
    {
      title: "Solve Image Measurements",
      description:
        "Convert an anchored image measurement set into Blockbench model units and return both the base spec and the measured spec before building.",
      inputSchema: SolveImageMeasurementsInputSchema.shape,
    },
    async (input) => {
      try {
        const result = draftAssetSpecFromImageGuidanceDetailed(input);

        if (!result.measurementGuidanceUsed || !result.measurementReport) {
          return errorResult(
            "Missing measurement input. Provide either measurementGuidance or observationGuidance.",
          );
        }

        return okResult({
          baseSpec: result.baseSpec,
          measuredSpec: result.spec,
          measurementGuidanceUsed: result.measurementGuidanceUsed,
          observationReport: result.observationReport,
          measurementReport: result.measurementReport,
        });
      } catch (error) {
        return errorResult("Failed to solve image-guided measurements.", error);
      }
    },
  );

  server.registerTool(
    "extract_measurement_guidance_from_observations",
    {
      title: "Extract Measurement Guidance From Observations",
      description:
        "Convert observed image rectangles plus one anchor dimension into measurementGuidance that can feed the image measurement solver.",
      inputSchema: ExtractMeasurementGuidanceInputSchema.shape,
    },
    async (input) => {
      try {
        const result = extractMeasurementGuidanceFromObservations({
          observationGuidance: input.observationGuidance,
        });
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to extract measurement guidance from image observations.", error);
      }
    },
  );

  server.registerTool(
    "generate_asset_from_image_guidance",
    {
      title: "Generate Asset From Image Guidance",
      description:
        "Use structured image observations plus a prompt to draft a spec, build the Blockbench asset, and return a preview image when available.",
      inputSchema: GenerateAssetFromImageInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await generateBlockbenchAssetFromImageGuidance({
          bridge: deps.bridge,
          input,
        });

        return okResultFromGeneratedAsset(result);
      } catch (error) {
        return errorResult(
          "Failed to generate the Blockbench asset from image guidance.",
          error,
        );
      }
    },
  );
}
