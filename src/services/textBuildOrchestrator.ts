import type {
  CubeResult,
  GenerateAssetFromTextInput,
  GenerateAssetFromTextResult,
} from "../contracts/schemas.js";
import { draftAssetSpecFromPrompt } from "./promptDrafting.js";
import { planBuildFromAssetSpec } from "./assetPlanning.js";
import { generateMaterialAtlas } from "./proceduralTexture.js";
import type { BridgeClient } from "./bridgeClient.js";

export async function generateBlockbenchAssetFromText(options: {
  bridge: BridgeClient;
  input: GenerateAssetFromTextInput;
}): Promise<GenerateAssetFromTextResult> {
  const draftedSpec = draftAssetSpecFromPrompt(options.input.prompt, options.input.formatId);
  const plan = planBuildFromAssetSpec({
    prompt: options.input.prompt,
    spec: draftedSpec,
    projectName: options.input.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
  });
  const spec = {
    ...draftedSpec,
    estimatedSize: plan.estimatedSize,
  };
  let projectModeUsed: "replace_current_project" | "new_project" = options.input.projectMode;

  if (options.input.projectMode === "replace_current_project") {
    const currentProject = await options.bridge.getProjectState();
    const canReuseCurrentProject =
      currentProject.open &&
      (currentProject.formatId === null || currentProject.formatId === plan.formatId);

    if (canReuseCurrentProject) {
      await options.bridge.clearProject({
        name: plan.projectName,
        textureWidth: plan.textureWidth,
        textureHeight: plan.textureHeight,
        boxUv: plan.boxUv,
      });
    } else {
      projectModeUsed = "new_project";
      await options.bridge.createProject({
        name: plan.projectName,
        formatId: plan.formatId,
        textureWidth: plan.textureWidth,
        textureHeight: plan.textureHeight,
        boxUv: plan.boxUv,
      });
    }
  } else {
    await options.bridge.createProject({
      name: plan.projectName,
      formatId: plan.formatId,
      textureWidth: plan.textureWidth,
      textureHeight: plan.textureHeight,
      boxUv: plan.boxUv,
    });
  }

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
        boxUv: plan.boxUv,
        textureRef: texture?.uuid,
      }),
    );
  }

  const project = await options.bridge.getProjectState();
  const preview = options.input.renderPreview
    ? await options.bridge.renderPreview({ mimeType: "image/png" })
    : null;

  return {
    prompt: options.input.prompt,
    projectModeUsed,
    spec,
    plan,
    project,
    texture,
    createdCubes,
    preview,
  };
}
