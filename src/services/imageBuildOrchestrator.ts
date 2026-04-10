import type {
  AssetSpec,
  GenerateAssetFromImageInput,
  GenerateAssetFromImageResult,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";
import {
  buildImageGuidancePlanningPrompt,
  draftAssetSpecFromImageGuidanceDetailed,
} from "./imageGuidancePlanning.js";
import { applyReferencePreviewRepairToSpec } from "./referenceImageRepair.js";
import {
  critiquePreviewAgainstReference,
  mergeReferencePreviewCritiqueIntoQualityReport,
} from "./referencePreviewCritique.js";
import { buildBlockbenchAssetFromSpec } from "./specBuildOrchestrator.js";

function resolvePreviewViewPreset(
  input: GenerateAssetFromImageInput,
): "preserve" | "front" | "side" | "three_quarter" {
  const view = input.observationGuidance?.imageView ?? "unknown";

  switch (view) {
    case "front":
      return "front";
    case "side":
      return "side";
    case "three_quarter":
      return "three_quarter";
    default:
      return "preserve";
  }
}

export async function generateBlockbenchAssetFromImageGuidance(options: {
  bridge: BridgeClient;
  input: GenerateAssetFromImageInput;
}): Promise<GenerateAssetFromImageResult> {
  const planningPrompt = buildImageGuidancePlanningPrompt(
    options.input.prompt,
    options.input.imageGuidance,
  );
  const drafted = draftAssetSpecFromImageGuidanceDetailed({
    prompt: options.input.prompt,
    formatId: options.input.formatId,
    imageGuidance: options.input.imageGuidance,
    measurementGuidance: options.input.measurementGuidance,
    observationGuidance: options.input.observationGuidance,
    referenceImage: options.input.referenceImage,
  });
  const maxImagePasses = options.input.referenceImage
    ? Math.min(options.input.repairLoop.maxPasses, 2)
    : 1;
  let currentSpec: AssetSpec = drafted.spec;
  let finalBuilt = await buildBlockbenchAssetFromSpec({
    bridge: options.bridge,
    input: {
      spec: currentSpec,
      prompt: planningPrompt,
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
  let finalPreview = finalBuilt.preview;
  let finalVisualCritique: GenerateAssetFromImageResult["visualCritique"] = null;
  let finalQualityReport = finalBuilt.qualityReport;

  for (let pass = 1; pass <= maxImagePasses; pass += 1) {
    if (pass > 1) {
      finalBuilt = await buildBlockbenchAssetFromSpec({
        bridge: options.bridge,
        input: {
          spec: currentSpec,
          prompt: planningPrompt,
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
    }

    if (!options.input.referenceImage || !options.input.renderPreview) {
      finalPreview = finalBuilt.preview;
      finalQualityReport = finalBuilt.qualityReport;
      break;
    }

    const critiquePreview = await options.bridge.renderPreview({
      mimeType: "image/png",
      viewPreset: resolvePreviewViewPreset(options.input),
      projection:
        resolvePreviewViewPreset(options.input) === "three_quarter" ? "perspective" : "orthographic",
      fov: resolvePreviewViewPreset(options.input) === "three_quarter" ? 35 : undefined,
    });
    const visual = critiquePreviewAgainstReference({
      referenceImage: options.input.referenceImage,
      preview: critiquePreview,
      referenceAnalysis: drafted.referenceImageAnalysis,
    });

    finalPreview = critiquePreview;
    finalVisualCritique = visual.critique;
    finalQualityReport = mergeReferencePreviewCritiqueIntoQualityReport({
      qualityReport: finalBuilt.qualityReport,
      critique: visual.critique,
    });

    if (
      pass >= maxImagePasses ||
      !visual.critique.findings.some((finding) => finding.severity === "warning" || finding.severity === "error")
    ) {
      break;
    }

    currentSpec = applyReferencePreviewRepairToSpec({
      spec: finalBuilt.spec,
      critique: visual.critique,
      referenceImageAnalysis: drafted.referenceImageAnalysis,
    });
  }

  return {
    source: "image_guidance",
    prompt: options.input.prompt,
    projectModeUsed: finalBuilt.projectModeUsed,
    imageGuidance: options.input.imageGuidance,
    referenceImage: options.input.referenceImage ?? null,
    referenceImageAnalysis: drafted.referenceImageAnalysis,
    measurementGuidanceUsed: drafted.measurementGuidanceUsed,
    observationReport: drafted.observationReport,
    measurementReport: drafted.measurementReport,
    spec: finalBuilt.spec,
    semanticIntent: finalBuilt.semanticIntent,
    plan: finalBuilt.plan,
    mutationPlan: finalBuilt.mutationPlan,
    mutationSummary: finalBuilt.mutationSummary,
    project: finalBuilt.project,
    texture: finalBuilt.texture,
    createdCubes: finalBuilt.createdCubes,
    resolvedCubes: finalBuilt.resolvedCubes,
    resolvedTextures: finalBuilt.resolvedTextures,
    structureSummary: finalBuilt.structureSummary,
    semanticCritique: finalBuilt.semanticCritique,
    visualCritique: finalVisualCritique,
    multiViewCritique: finalBuilt.multiViewCritique,
    qualityReport: finalQualityReport,
    repairHistory: finalBuilt.repairHistory,
    preview: finalPreview,
  };
}
