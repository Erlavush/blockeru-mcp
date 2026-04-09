import type {
  GenerateAssetFromImageInput,
  GenerateAssetFromImageResult,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";
import {
  buildImageGuidancePlanningPrompt,
  draftAssetSpecFromImageGuidance,
} from "./imageGuidancePlanning.js";
import { buildBlockbenchAssetFromSpec } from "./specBuildOrchestrator.js";

export async function generateBlockbenchAssetFromImageGuidance(options: {
  bridge: BridgeClient;
  input: GenerateAssetFromImageInput;
}): Promise<GenerateAssetFromImageResult> {
  const planningPrompt = buildImageGuidancePlanningPrompt(
    options.input.prompt,
    options.input.imageGuidance,
  );
  const draftedSpec = draftAssetSpecFromImageGuidance({
    prompt: options.input.prompt,
    formatId: options.input.formatId,
    imageGuidance: options.input.imageGuidance,
  });
  const built = await buildBlockbenchAssetFromSpec({
    bridge: options.bridge,
    input: {
      spec: draftedSpec,
      prompt: planningPrompt,
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
    source: "image_guidance",
    prompt: options.input.prompt,
    projectModeUsed: built.projectModeUsed,
    imageGuidance: options.input.imageGuidance,
    spec: built.spec,
    plan: built.plan,
    project: built.project,
    texture: built.texture,
    createdCubes: built.createdCubes,
    qualityReport: built.qualityReport,
    preview: built.preview,
  };
}
