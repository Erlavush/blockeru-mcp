import type {
  BuildAssetFromSpecInput,
  BuildAssetFromSpecResult,
  CubeResult,
} from "../contracts/schemas.js";
import { planBuildFromAssetSpec } from "./assetPlanning.js";
import { analyzeBuildQuality } from "./buildQuality.js";
import { generateMaterialAtlas } from "./proceduralTexture.js";
import type { BridgeClient } from "./bridgeClient.js";

async function prepareProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
}): Promise<"replace_current_project" | "new_project"> {
  let projectModeUsed: "replace_current_project" | "new_project" = options.input.projectMode;

  if (options.input.projectMode === "replace_current_project") {
    const currentProject = await options.bridge.getProjectState();
    const canReuseCurrentProject =
      currentProject.open &&
      (currentProject.formatId === null || currentProject.formatId === options.input.formatId);

    if (canReuseCurrentProject) {
      try {
        await options.bridge.clearProject({
          name: options.projectName,
          textureWidth: options.input.textureWidth,
          textureHeight: options.input.textureHeight,
          boxUv: options.input.boxUv,
        });

        return projectModeUsed;
      } catch (_error) {
        projectModeUsed = "new_project";
      }
    } else {
      projectModeUsed = "new_project";
    }
  }

  await options.bridge.createProject({
    name: options.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
  });

  return projectModeUsed;
}

export async function buildBlockbenchAssetFromSpec(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
}): Promise<BuildAssetFromSpecResult> {
  const planningPrompt =
    options.input.prompt?.trim() || options.input.projectName || options.input.spec.assetType;
  const plan = planBuildFromAssetSpec({
    prompt: planningPrompt,
    spec: options.input.spec,
    projectName: options.input.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
  });

  const spec = {
    ...options.input.spec,
    estimatedSize: plan.estimatedSize,
    targetFormat: options.input.formatId,
  };

  const projectModeUsed = await prepareProject({
    bridge: options.bridge,
    input: options.input,
    projectName: plan.projectName,
  });

  let texture = null;

  if (options.input.createTexture) {
    const atlas = generateMaterialAtlas(spec, plan);
    texture = await options.bridge.createTexture({
      name: atlas.name,
      dataUrl: atlas.dataUrl,
      applyToAll: false,
      setAsDefault: true,
    });

    if (texture.width === 0 || texture.height === 0) {
      texture = {
        ...texture,
        width: plan.textureWidth,
        height: plan.textureHeight,
      };
    }
  }

  const createdCubes: CubeResult[] = [];

  for (const cube of plan.cubes) {
    createdCubes.push(
      await options.bridge.addCube({
        name: cube.name,
        from: cube.from,
        to: cube.to,
        origin: cube.origin,
        uvOffset: cube.uvOffset,
        faces: cube.faces,
        boxUv: plan.boxUv,
        textureRef: texture?.uuid,
      }),
    );
  }

  const project = await options.bridge.getProjectState();
  const preview = options.input.renderPreview
    ? await options.bridge.renderPreview({ mimeType: "image/png" })
    : null;
  const qualityReport = analyzeBuildQuality({
    plan,
    project,
    texture,
    createdCubes,
    previewRendered: preview !== null,
  });

  return {
    source: "spec",
    prompt: options.input.prompt ?? null,
    projectModeUsed,
    spec,
    plan,
    project,
    texture,
    createdCubes,
    qualityReport,
    preview,
  };
}
