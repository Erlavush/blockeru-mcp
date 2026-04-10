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
      repairLoop: options.input.repairLoop,
      projectMode: options.input.projectMode,
      createTexture: options.input.createTexture,
      renderPreview: options.input.renderPreview,
    },
  });

  return {
    prompt: options.input.prompt,
    projectModeUsed: built.projectModeUsed,
    spec: built.spec,
    semanticIntent: built.semanticIntent,
    plan: built.plan,
    mutationPlan: built.mutationPlan,
    mutationSummary: built.mutationSummary,
    project: built.project,
    texture: built.texture,
    createdCubes: built.createdCubes,
    resolvedCubes: built.resolvedCubes,
    resolvedTextures: built.resolvedTextures,
    structureSummary: built.structureSummary,
    semanticCritique: built.semanticCritique,
    multiViewCritique: built.multiViewCritique,
    qualityReport: built.qualityReport,
    repairHistory: built.repairHistory,
    preview: built.preview,
  };
}
