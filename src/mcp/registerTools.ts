import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../config.js";
import {
  AnalyzeReferenceImageInputSchema,
  BuildAssetFromSpecInputSchema,
  CreateProjectSnapshotInputSchema,
  CritiquePreviewAgainstReferenceInputSchema,
  CritiqueProjectAgainstIntentInputSchema,
  CubeCreateInputSchema,
  CubeDeleteInputSchema,
  CubeUpdateInputSchema,
  DescribeProjectStructureInputSchema,
  DiffProjectSnapshotsInputSchema,
  DraftAssetSpecFromImageInputSchema,
  EnsureProjectInputSchema,
  ExportProjectInputSchema,
  ExtractMeasurementGuidanceInputSchema,
  GenerateAssetFromImageInputSchema,
  GenerateAssetFromTextInputSchema,
  GroupCreateInputSchema,
  GroupDeleteInputSchema,
  GroupUpdateInputSchema,
  ImportProjectInputSchema,
  PreviewRenderInputSchema,
  ProjectClearInputSchema,
  ProjectCreateInputSchema,
  ProjectValidateInputSchema,
  PromptAnalysisInputSchema,
  ReparentSceneNodeInputSchema,
  RestoreProjectSnapshotInputSchema,
  SelectSceneNodesInputSchema,
  SolveImageMeasurementsInputSchema,
  TextureAssignInputSchema,
  TextureCreateInputSchema,
  TextureDeleteInputSchema,
  TexturePaintRegionInputSchema,
  TextureReadInputSchema,
  TextureUpdateInputSchema,
} from "../contracts/schemas.js";
import { SERVER_VERSION } from "../constants.js";
import type { BridgeClient } from "../services/bridgeClient.js";
import {
  draftAssetSpecFromImageGuidance,
  draftAssetSpecFromImageGuidanceDetailed,
} from "../services/imageGuidancePlanning.js";
import { draftAssetSpecFromPrompt } from "../services/promptDrafting.js";
import { extractMeasurementGuidanceFromObservations } from "../services/imageObservationExtraction.js";
import { analyzeReferenceImage } from "../services/referenceImageAnalysis.js";
import { critiquePreviewAgainstReference } from "../services/referencePreviewCritique.js";
import { buildBlockbenchAssetFromSpec } from "../services/specBuildOrchestrator.js";
import { generateBlockbenchAssetFromImageGuidance } from "../services/imageBuildOrchestrator.js";
import { ensureProject, validateProject } from "../services/projectControl.js";
import { describeProjectStructure } from "../services/projectIntrospection.js";
import { diffProjectSnapshots } from "../services/projectSnapshots.js";
import { critiqueProjectAgainstIntent } from "../services/semanticCritique.js";
import { paintTextureRegionDataUrl } from "../services/textureEditing.js";
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

const PROJECT_TOOL_NAMES = [
  "ensure_project",
  "create_blockbench_project",
  "clear_blockbench_project",
  "get_blockbench_project_state",
  "get_project_contents",
  "get_scene_graph",
  "get_blockbench_selection",
  "select_blockbench_nodes",
  "create_blockbench_group",
  "update_blockbench_group",
  "delete_blockbench_group",
  "reparent_blockbench_node",
  "create_project_snapshot",
  "restore_project_snapshot",
  "diff_project_snapshots",
  "list_blockbench_codecs",
  "export_blockbench_project",
  "import_blockbench_project",
  "describe_project_structure",
  "critique_project_against_intent",
  "validate_project",
] as const;

const MODELING_TOOL_NAMES = [
  "add_blockbench_cube",
  "update_blockbench_cube",
  "delete_blockbench_cube",
] as const;

const TEXTURE_TOOL_NAMES = [
  "create_blockbench_texture",
  "read_blockbench_texture",
  "update_blockbench_texture",
  "delete_blockbench_texture",
  "paint_blockbench_texture_region",
  "assign_blockbench_texture",
] as const;

const ORCHESTRATION_TOOL_NAMES = [
  "build_asset_from_spec",
  "generate_asset_from_text",
  "generate_blockbench_asset_from_text",
  "analyze_reference_image",
  "critique_preview_against_reference",
  "draft_asset_spec_from_prompt",
  "draft_asset_spec_from_image_guidance",
  "solve_image_measurements",
  "extract_measurement_guidance_from_observations",
  "generate_asset_from_image_guidance",
] as const;

const UTILITY_TOOL_NAMES = [
  "ping",
  "get_blockbench_status",
  "list_capabilities",
  "render_blockbench_preview",
] as const;

async function buildCapabilities(deps: ToolDeps) {
  try {
    const health = await deps.bridge.health();

    return {
      server: {
        name: deps.config.serverName,
        version: SERVER_VERSION,
      },
      bridge: {
        url: deps.bridge.baseUrl,
        reachable: true,
        pluginId: health.pluginId,
        pluginVersion: health.version,
        capabilities: health.capabilities,
        currentProject: health.project,
      },
      defaults: {
        projectFormat: deps.config.defaultProjectFormat,
        textureWidth: deps.config.defaultTextureWidth,
        textureHeight: deps.config.defaultTextureHeight,
        boxUv: deps.config.defaultBoxUv,
      },
      limits: {
        maxRepairPasses: 4,
        maxPaintRegionPixels: 16384,
      },
      mutationPolicy: {
        supportsIfRevision: true,
        strict: false,
        supportsManagedPatch: true,
        supportsLegacyScopeMigration: true,
        supportsManagedTextureReuse: true,
        supportsTexturePaintRegion: true,
        supportsSemanticCritique: true,
        supportsReferenceImageCritique: true,
        supportsReferencePaletteExtraction: true,
        supportsMultiViewCritique: true,
        supportsProjectSnapshots: true,
        supportsCodecImportExport: true,
        supportsSceneGraphControl: true,
        recommendedFlow: [
          "analyze_reference_image",
          "solve_image_measurements",
          "get_blockbench_project_state",
          "get_scene_graph",
          "get_project_contents",
          "create_project_snapshot",
          "describe_project_structure or critique_project_against_intent",
          "mutate with ifRevision",
          "validate_project",
          "render_blockbench_preview",
          "repeat multi-view critique until side/front/back structure is closed",
        ],
        note:
          "All mutating tools accept ifRevision. Structured builds use a managed mutation scope and a managed atlas name so repeated generations can patch cubes and reuse or update textures instead of recreating the whole project by default. The bridge also supports full project snapshots, six-view structural critique, and codec-aware import/export for safer checkpointing and interchange.",
      },
      tools: {
        utility: [...UTILITY_TOOL_NAMES],
        project: [...PROJECT_TOOL_NAMES],
        modeling: [...MODELING_TOOL_NAMES],
        texture: [...TEXTURE_TOOL_NAMES],
        orchestration: [...ORCHESTRATION_TOOL_NAMES],
      },
    };
  } catch (error) {
    return {
      server: {
        name: deps.config.serverName,
        version: SERVER_VERSION,
      },
      bridge: {
        url: deps.bridge.baseUrl,
        reachable: false,
        pluginId: null,
        pluginVersion: null,
        capabilities: [],
        currentProject: null,
        error: error instanceof Error ? error.message : "Bridge is not reachable.",
      },
      defaults: {
        projectFormat: deps.config.defaultProjectFormat,
        textureWidth: deps.config.defaultTextureWidth,
        textureHeight: deps.config.defaultTextureHeight,
        boxUv: deps.config.defaultBoxUv,
      },
      limits: {
        maxRepairPasses: 4,
        maxPaintRegionPixels: 16384,
      },
      mutationPolicy: {
        supportsIfRevision: true,
        strict: false,
        supportsManagedPatch: true,
        supportsLegacyScopeMigration: true,
        supportsManagedTextureReuse: true,
        supportsTexturePaintRegion: true,
        supportsSemanticCritique: true,
        supportsReferenceImageCritique: true,
        supportsReferencePaletteExtraction: true,
        supportsMultiViewCritique: true,
        supportsProjectSnapshots: true,
        supportsCodecImportExport: true,
        supportsSceneGraphControl: true,
        recommendedFlow: [
          "analyze_reference_image",
          "solve_image_measurements",
          "get_blockbench_project_state",
          "get_scene_graph",
          "get_project_contents",
          "create_project_snapshot",
          "describe_project_structure or critique_project_against_intent",
          "mutate with ifRevision",
          "validate_project",
          "render_blockbench_preview",
          "repeat multi-view critique until side/front/back structure is closed",
        ],
        note:
          "All mutating tools accept ifRevision. Structured builds use a managed mutation scope and a managed atlas name so repeated generations can patch cubes and reuse or update textures instead of recreating the whole project by default. The bridge also supports full project snapshots, six-view structural critique, and codec-aware import/export for safer checkpointing and interchange.",
      },
      tools: {
        utility: [...UTILITY_TOOL_NAMES],
        project: [...PROJECT_TOOL_NAMES],
        modeling: [...MODELING_TOOL_NAMES],
        texture: [...TEXTURE_TOOL_NAMES],
        orchestration: [...ORCHESTRATION_TOOL_NAMES],
      },
    };
  }
}

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
    "list_capabilities",
    {
      title: "List Capabilities",
      description: "Return the Blockeru MCP tool surface, bridge capabilities, defaults, and mutation policy.",
      inputSchema: {},
    },
    async () => okResult(await buildCapabilities(deps)),
  );

  server.registerTool(
    "ensure_project",
    {
      title: "Ensure Project",
      description:
        "Reuse, clear, or create a Blockbench project according to the requested mode, with optional revision guarding.",
      inputSchema: EnsureProjectInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await ensureProject({
          bridge: deps.bridge,
          input,
        });
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to ensure the Blockbench project.", error);
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
    "get_project_contents",
    {
      title: "Get Project Contents",
      description:
        "Read the current Blockbench project contents, including cube summaries, texture summaries, and project revision.",
      inputSchema: {},
    },
    async () => {
      try {
        const contents = await deps.bridge.getProjectContents();
        return okResult(contents);
      } catch (error) {
        return errorResult("Failed to read Blockbench project contents.", error);
      }
    },
  );

  server.registerTool(
    "get_scene_graph",
    {
      title: "Get Scene Graph",
      description:
        "Read the current Blockbench scene graph including groups, cube parent paths, and the current selection.",
      inputSchema: {},
    },
    async () => {
      try {
        return okResult(await deps.bridge.getSceneGraph());
      } catch (error) {
        return errorResult("Failed to read the Blockbench scene graph.", error);
      }
    },
  );

  server.registerTool(
    "get_blockbench_selection",
    {
      title: "Get Blockbench Selection",
      description: "Read the currently selected cubes and groups in Blockbench.",
      inputSchema: {},
    },
    async () => {
      try {
        return okResult(await deps.bridge.getSelection());
      } catch (error) {
        return errorResult("Failed to read the current Blockbench selection.", error);
      }
    },
  );

  server.registerTool(
    "select_blockbench_nodes",
    {
      title: "Select Blockbench Nodes",
      description:
        "Select one or more cubes or groups in the current Blockbench project, optionally clearing the existing selection first.",
      inputSchema: SelectSceneNodesInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.selectSceneNodes(input));
      } catch (error) {
        return errorResult("Failed to update the Blockbench selection.", error);
      }
    },
  );

  server.registerTool(
    "create_blockbench_group",
    {
      title: "Create Blockbench Group",
      description: "Create a group in the current Blockbench project, optionally under a parent group.",
      inputSchema: GroupCreateInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.createGroup(input));
      } catch (error) {
        return errorResult("Failed to create the Blockbench group.", error);
      }
    },
  );

  server.registerTool(
    "update_blockbench_group",
    {
      title: "Update Blockbench Group",
      description: "Update a Blockbench group name, pivot/origin, rotation, color, visibility, or export flag.",
      inputSchema: GroupUpdateInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.updateGroup(input));
      } catch (error) {
        return errorResult("Failed to update the Blockbench group.", error);
      }
    },
  );

  server.registerTool(
    "delete_blockbench_group",
    {
      title: "Delete Blockbench Group",
      description: "Delete a group from the current Blockbench project.",
      inputSchema: GroupDeleteInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.deleteGroup(input));
      } catch (error) {
        return errorResult("Failed to delete the Blockbench group.", error);
      }
    },
  );

  server.registerTool(
    "reparent_blockbench_node",
    {
      title: "Reparent Blockbench Node",
      description: "Move a cube or group under another group, or back to the root scene.",
      inputSchema: ReparentSceneNodeInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.reparentSceneNode(input));
      } catch (error) {
        return errorResult("Failed to reparent the Blockbench node.", error);
      }
    },
  );

  server.registerTool(
    "create_project_snapshot",
    {
      title: "Create Project Snapshot",
      description:
        "Capture a restorable Blockbench project snapshot including cube geometry, UV data, textures, and project settings.",
      inputSchema: CreateProjectSnapshotInputSchema.shape,
    },
    async (input) => {
      try {
        const snapshot = await deps.bridge.createProjectSnapshot(input);
        return okResult(snapshot);
      } catch (error) {
        return errorResult("Failed to create a Blockbench project snapshot.", error);
      }
    },
  );

  server.registerTool(
    "restore_project_snapshot",
    {
      title: "Restore Project Snapshot",
      description:
        "Replace or recreate the current Blockbench project from a previously captured snapshot.",
      inputSchema: RestoreProjectSnapshotInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.restoreProjectSnapshot(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to restore the Blockbench project snapshot.", error);
      }
    },
  );

  server.registerTool(
    "diff_project_snapshots",
    {
      title: "Diff Project Snapshots",
      description:
        "Compare two captured project snapshots and summarize which cubes or textures were added, removed, or changed.",
      inputSchema: DiffProjectSnapshotsInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(
          diffProjectSnapshots({
            before: input.before,
            after: input.after,
          }),
        );
      } catch (error) {
        return errorResult("Failed to diff the supplied project snapshots.", error);
      }
    },
  );

  server.registerTool(
    "list_blockbench_codecs",
    {
      title: "List Blockbench Codecs",
      description:
        "List the import/export codecs currently exposed by the live Blockbench environment.",
      inputSchema: {},
    },
    async () => {
      try {
        return okResult(await deps.bridge.listCodecs());
      } catch (error) {
        return errorResult("Failed to list Blockbench codecs.", error);
      }
    },
  );

  server.registerTool(
    "export_blockbench_project",
    {
      title: "Export Blockbench Project",
      description:
        "Export the current Blockbench project through a selected codec and return the serialized payload.",
      inputSchema: ExportProjectInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.exportProject(input));
      } catch (error) {
        return errorResult("Failed to export the current Blockbench project.", error);
      }
    },
  );

  server.registerTool(
    "import_blockbench_project",
    {
      title: "Import Blockbench Project",
      description:
        "Import serialized project content through a selected Blockbench codec into a new or current project.",
      inputSchema: ImportProjectInputSchema.shape,
    },
    async (input) => {
      try {
        return okResult(await deps.bridge.importProject(input));
      } catch (error) {
        return errorResult("Failed to import the supplied Blockbench project payload.", error);
      }
    },
  );

  server.registerTool(
    "describe_project_structure",
    {
      title: "Describe Project Structure",
      description:
        "Summarize the current Blockbench project structure so the AI can inspect semantic part relationships and managed asset scope.",
      inputSchema: DescribeProjectStructureInputSchema.shape,
    },
    async (input) => {
      try {
        const contents = await deps.bridge.getProjectContents();
        const result = describeProjectStructure({
          contents,
          managedScope: input.managedScope,
          managedOnly: input.managedOnly,
        });
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to describe the current Blockbench project structure.", error);
      }
    },
  );

  server.registerTool(
    "critique_project_against_intent",
    {
      title: "Critique Project Against Intent",
      description:
        "Compare the current Blockbench project against reference intent derived from a prompt or spec and return semantic findings.",
      inputSchema: CritiqueProjectAgainstIntentInputSchema.shape,
    },
    async (input) => {
      try {
        if (!input.prompt && !input.spec) {
          return errorResult("Provide either prompt or spec to critique the project against intent.");
        }

        const contents = await deps.bridge.getProjectContents();
        const spec =
          input.spec ??
          draftAssetSpecFromPrompt(
            input.prompt ?? "chair",
            contents.project.formatId ?? deps.config.defaultProjectFormat,
          );
        const result = critiqueProjectAgainstIntent({
          contents,
          managedScope: input.managedScope,
          managedOnly: input.managedOnly,
          prompt: input.prompt,
          spec,
        });
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to critique the current Blockbench project against intent.", error);
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
    "validate_project",
    {
      title: "Validate Project",
      description:
        "Validate the current Blockbench project contents for basic geometry, texture, and placement issues.",
      inputSchema: ProjectValidateInputSchema.shape,
    },
    async (input) => {
      try {
        const contents = await deps.bridge.getProjectContents();
        const result = validateProject({
          contents,
          input,
        });
        return okResult({
          ...result,
          revision: contents.project.revision,
        });
      } catch (error) {
        return errorResult("Failed to validate the current Blockbench project.", error);
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
    "update_blockbench_cube",
    {
      title: "Update Blockbench Cube",
      description: "Update a cube in the current Blockbench project.",
      inputSchema: CubeUpdateInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.updateCube(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to update cube in Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "delete_blockbench_cube",
    {
      title: "Delete Blockbench Cube",
      description: "Delete a cube from the current Blockbench project.",
      inputSchema: CubeDeleteInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.deleteCube(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to delete cube from Blockbench.", error);
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
    "read_blockbench_texture",
    {
      title: "Read Blockbench Texture",
      description: "Read a texture image from the current Blockbench project.",
      inputSchema: TextureReadInputSchema.shape,
    },
    async (input) => {
      try {
        const texture = await deps.bridge.readTexture(input);
        const image = dataUrlToImagePayload(texture.dataUrl);

        if (!image) {
          return errorResult("Blockbench returned an invalid texture payload.");
        }

        return okResultWithImage(
          {
            uuid: texture.uuid,
            name: texture.name,
            width: texture.width,
            height: texture.height,
            useAsDefault: texture.useAsDefault,
          },
          image,
        );
      } catch (error) {
        return errorResult("Failed to read texture from Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "update_blockbench_texture",
    {
      title: "Update Blockbench Texture",
      description: "Replace an existing texture image in the current Blockbench project.",
      inputSchema: TextureUpdateInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.updateTexture(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to update texture in Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "delete_blockbench_texture",
    {
      title: "Delete Blockbench Texture",
      description: "Delete a texture from the current Blockbench project.",
      inputSchema: TextureDeleteInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.deleteTexture(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to delete texture from Blockbench.", error);
      }
    },
  );

  server.registerTool(
    "paint_blockbench_texture_region",
    {
      title: "Paint Blockbench Texture Region",
      description:
        "Read an existing Blockbench texture, repaint one pixel region with a Minecraft-style material treatment, and write it back revision-safely.",
      inputSchema: TexturePaintRegionInputSchema.shape,
    },
    async (input) => {
      try {
        const regionArea = input.region.width * input.region.height;

        if (regionArea > 16384) {
          return errorResult(
            `Texture paint region is too large (${regionArea} pixels). Limit is 16384 pixels per operation.`,
          );
        }

        const currentTexture = await deps.bridge.readTexture({
          target: input.target,
        });
        const paintedDataUrl = paintTextureRegionDataUrl({
          dataUrl: currentTexture.dataUrl,
          input: {
            region: input.region,
            material: input.material,
            colorHint: input.colorHint,
            seed: input.seed,
          },
        });
        const updatedTexture = await deps.bridge.updateTexture({
          target: input.target,
          dataUrl: paintedDataUrl,
          setAsDefault: true,
          applyToAll: false,
          ifRevision: input.ifRevision,
        });
        const image = dataUrlToImagePayload(paintedDataUrl);

        if (!image) {
          return errorResult("Failed to encode the painted texture image.");
        }

        return okResultWithImage(
          {
            texture: updatedTexture,
            region: input.region,
          },
          image,
        );
      } catch (error) {
        return errorResult("Failed to paint the requested texture region.", error);
      }
    },
  );

  server.registerTool(
    "assign_blockbench_texture",
    {
      title: "Assign Blockbench Texture",
      description: "Assign an existing texture to a cube in the current Blockbench project.",
      inputSchema: TextureAssignInputSchema.shape,
    },
    async (input) => {
      try {
        const result = await deps.bridge.assignTexture(input);
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to assign texture in Blockbench.", error);
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
    "analyze_reference_image",
    {
      title: "Analyze Reference Image",
      description:
        "Segment a supplied reference image, fit observed part rectangles to the foreground, and extract dominant palette and material color hints.",
      inputSchema: AnalyzeReferenceImageInputSchema.shape,
    },
    async (input) => {
      try {
        const result = analyzeReferenceImage({
          referenceImage: input.referenceImage,
          observationGuidance: input.observationGuidance,
        });
        return okResult(result);
      } catch (error) {
        return errorResult("Failed to analyze the supplied reference image.", error);
      }
    },
  );

  server.registerTool(
    "critique_preview_against_reference",
    {
      title: "Critique Preview Against Reference",
      description:
        "Render the current Blockbench preview, compare it to a supplied reference image, and return silhouette and palette mismatch findings.",
      inputSchema: CritiquePreviewAgainstReferenceInputSchema.shape,
    },
    async (input) => {
      try {
        const preview = await deps.bridge.renderPreview({
          mimeType: "image/png",
          viewPreset: input.viewPreset,
          projection: input.viewPreset === "three_quarter" ? "perspective" : "orthographic",
          fov: input.viewPreset === "three_quarter" ? 35 : undefined,
        });
        const result = critiquePreviewAgainstReference({
          referenceImage: input.referenceImage,
          preview,
        });
        const image = dataUrlToImagePayload(preview.dataUrl);

        if (!image) {
          return errorResult("Blockbench returned an invalid preview payload.");
        }

        return okResultWithImage(
          {
            analysis: result.analysis,
            critique: result.critique,
            preview: {
              mimeType: preview.mimeType,
              width: preview.width,
              height: preview.height,
            },
          },
          image,
        );
      } catch (error) {
        return errorResult("Failed to critique the Blockbench preview against the reference.", error);
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
          referenceImageAnalysis: result.referenceImageAnalysis,
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
        const referenceImageAnalysis = input.referenceImage
          ? analyzeReferenceImage({
              referenceImage: input.referenceImage,
              observationGuidance: input.observationGuidance,
            })
          : null;
        const result = extractMeasurementGuidanceFromObservations({
          observationGuidance: input.observationGuidance,
          referenceImageAnalysis,
        });
        return okResult({
          ...result,
          referenceImageAnalysis,
        });
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
