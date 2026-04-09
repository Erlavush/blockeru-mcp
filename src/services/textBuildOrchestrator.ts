import type {
  GenerateAssetFromTextInput,
  GenerateAssetFromTextResult,
} from "../contracts/schemas.js";
import { draftAssetSpecFromPrompt } from "./promptDrafting.js";
import type { BridgeClient } from "./bridgeClient.js";
import { buildBlockbenchAssetFromSpec } from "./specBuildOrchestrator.js";

export async function generateBlockbenchAssetFromText(options: {
  bridge: BridgeClient;
  input: GenerateAssetFromTextInput;
}): Promise<GenerateAssetFromTextResult> {
  const draftedSpec = draftAssetSpecFromPrompt(
    options.input.prompt,
    options.input.formatId,
  );
  const built = await buildBlockbenchAssetFromSpec({
    bridge: options.bridge,
    input: {
      spec: draftedSpec,
      prompt: options.input.prompt,
      projectName: options.input.projectName,
      formatId: options.input.formatId,
      textureWidth: options.input.textureWidth,
      textureHeight: options.input.textureHeight,
      boxUv: options.input.boxUv,
      projectMode: options.input.projectMode,
      createTexture: options.input.createTexture,
      renderPreview: options.input.renderPreview,
    },
  });

  return {
    prompt: options.input.prompt,
    projectModeUsed: built.projectModeUsed,
    spec: built.spec,
    plan: built.plan,
    project: built.project,
    texture: built.texture,
    createdCubes: built.createdCubes,
    qualityReport: built.qualityReport,
    preview: built.preview,
  };
}
