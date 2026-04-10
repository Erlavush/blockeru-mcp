import type {
  AssetPart,
  AssetSpec,
  DraftAssetSpecFromImageInput,
  ImageGuidance,
  ImageMeasurementGuidance,
  MeasurementObservationReport,
  MeasurementReport,
  ReferenceImageAnalysis,
} from "../contracts/schemas.js";
import { draftAssetSpecFromPrompt } from "./promptDrafting.js";
import { applyMeasurementGuidanceToSpec } from "./imageMeasurements.js";
import { extractMeasurementGuidanceFromObservations } from "./imageObservationExtraction.js";
import { analyzeReferenceImage } from "./referenceImageAnalysis.js";

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function uniqueWords(values: readonly string[]): string[] {
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeWord(value);
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  }

  return output;
}

function normalizeProportions(
  base: readonly [number, number, number],
  hint: readonly [number, number, number] | undefined,
): [number, number, number] {
  if (!hint) {
    return [base[0], base[1], base[2]];
  }

  const maxBase = Math.max(...base);
  const maxHint = Math.max(...hint);

  if (maxBase <= 0 || maxHint <= 0) {
    return [base[0], base[1], base[2]];
  }

  const ratio = maxBase / maxHint;

  return [
    Math.max(1, Math.round(hint[0] * ratio)),
    Math.max(1, Math.round(hint[1] * ratio)),
    Math.max(1, Math.round(hint[2] * ratio)),
  ];
}

function inferReferenceMaterials(analysis: ReferenceImageAnalysis | null): string[] {
  if (!analysis) {
    return [];
  }

  return Object.keys(analysis.materialColorHints);
}

function chooseReferencePalette(
  guidance: ImageGuidance,
  analysis: ReferenceImageAnalysis | null,
  fallback: readonly string[],
): string[] {
  const values = uniqueWords([
    ...(analysis?.dominantColors ?? []),
    ...guidance.dominantColors,
    ...fallback,
  ]);

  return values.length > 0 ? values : ["natural"];
}

export function buildImageGuidancePlanningPrompt(
  prompt: string,
  guidance: ImageGuidance,
): string {
  const segments = [prompt];

  if (guidance.assetTypeHint) {
    segments.push(guidance.assetTypeHint);
  }

  if (guidance.subject) {
    segments.push(guidance.subject);
  }

  if (guidance.silhouette) {
    segments.push(guidance.silhouette);
  }

  if (guidance.materials.length > 0) {
    segments.push(guidance.materials.join(" "));
  }

  if (guidance.dominantColors.length > 0) {
    segments.push(guidance.dominantColors.join(" "));
  }

  if (guidance.visibleParts.length > 0) {
    segments.push(guidance.visibleParts.join(" "));
  }

  if (guidance.notes) {
    segments.push(guidance.notes);
  }

  return segments.join(" ");
}

function inferAssetTypeHint(guidance: ImageGuidance): string | undefined {
  if (guidance.assetTypeHint) {
    return guidance.assetTypeHint;
  }

  const parts = uniqueWords(guidance.visibleParts);

  if (parts.some((part) => part.includes("drawer"))) {
    return "cabinet";
  }

  if (parts.some((part) => part.includes("shelf"))) {
    return "shelf";
  }

  if (parts.some((part) => part.includes("headboard"))) {
    return "bed";
  }

  if (parts.some((part) => part.includes("shade")) || parts.some((part) => part.includes("stem"))) {
    return "lamp";
  }

  return undefined;
}

function mergePartMetadata(parts: AssetPart[], guidance: ImageGuidance): AssetPart[] {
  const visibleParts = uniqueWords(guidance.visibleParts);
  const partText = visibleParts.join(" ");

  return parts.map((part) => {
    const updatedPart = { ...part };

    if (
      updatedPart.name === "seat" &&
      (partText.includes("cushion") || partText.includes("upholstered"))
    ) {
      updatedPart.material = "fabric";
      updatedPart.notes = `${updatedPart.notes ? `${updatedPart.notes} ` : ""}Image guidance suggests a cushioned seat.`;
    }

    if (
      updatedPart.name === "backrest" &&
      partText.includes("upholstered")
    ) {
      updatedPart.material = "fabric";
    }

    if (
      updatedPart.name === "handles" &&
      guidance.materials.some((material) => normalizeWord(material) === "metal")
    ) {
      updatedPart.material = "metal";
    }

    return updatedPart;
  });
}

export function draftAssetSpecFromImageGuidance(
  input: DraftAssetSpecFromImageInput,
): AssetSpec {
  return draftAssetSpecFromImageGuidanceDetailed(input).spec;
}

export function draftAssetSpecFromImageGuidanceDetailed(
  input: DraftAssetSpecFromImageInput,
): {
  baseSpec: AssetSpec;
  spec: AssetSpec;
  measurementGuidanceUsed: ImageMeasurementGuidance | null;
  observationReport: MeasurementObservationReport | null;
  measurementReport: MeasurementReport | null;
  referenceImageAnalysis: ReferenceImageAnalysis | null;
} {
  const referenceImageAnalysis = input.referenceImage
    ? analyzeReferenceImage({
        referenceImage: input.referenceImage,
        observationGuidance: input.observationGuidance,
      })
    : null;
  const inferredAssetType = inferAssetTypeHint(input.imageGuidance);
  const planningPrompt = buildImageGuidancePlanningPrompt(input.prompt, {
    ...input.imageGuidance,
    assetTypeHint: input.imageGuidance.assetTypeHint ?? inferredAssetType,
  });
  const baseSpec = draftAssetSpecFromPrompt(planningPrompt, input.formatId);
  const materials = uniqueWords([
    ...baseSpec.materials,
    ...inferReferenceMaterials(referenceImageAnalysis),
    ...input.imageGuidance.materials,
  ]);
  const palette = chooseReferencePalette(
    input.imageGuidance,
    referenceImageAnalysis,
    baseSpec.palette,
  );
  const constraints = [...baseSpec.constraints];

  if (input.imageGuidance.notes) {
    constraints.push(`Image guidance: ${input.imageGuidance.notes}`);
  }

  if (input.imageGuidance.visibleParts.length > 0) {
    constraints.push(
      `Visible parts: ${uniqueWords(input.imageGuidance.visibleParts).join(", ")}`,
    );
  }

  const mergedSpec: AssetSpec = {
    ...baseSpec,
    assetType: inferredAssetType ?? baseSpec.assetType,
    estimatedSize: normalizeProportions(
      baseSpec.estimatedSize,
      input.imageGuidance.proportionHint,
    ),
    symmetry: input.imageGuidance.symmetry ?? baseSpec.symmetry,
    materials: materials.length > 0 ? materials : baseSpec.materials,
    palette: palette.length > 0 ? palette : baseSpec.palette,
    materialColorHints: {
      ...baseSpec.materialColorHints,
      ...(referenceImageAnalysis?.materialColorHints ?? {}),
    },
    parts: mergePartMetadata(baseSpec.parts, input.imageGuidance),
    constraints,
  };

  let measurementGuidanceUsed = input.measurementGuidance ?? null;
  let observationReport: MeasurementObservationReport | null = null;

  if (!measurementGuidanceUsed && input.observationGuidance) {
    const extracted = extractMeasurementGuidanceFromObservations({
      observationGuidance: input.observationGuidance,
      referenceImageAnalysis,
    });
    measurementGuidanceUsed = extracted.measurementGuidance;
    observationReport = extracted.observationReport;
  }

  if (!measurementGuidanceUsed) {
    return {
      baseSpec: mergedSpec,
      spec: mergedSpec,
      measurementGuidanceUsed: null,
      observationReport,
      measurementReport: null,
      referenceImageAnalysis,
    };
  }

  const measured = applyMeasurementGuidanceToSpec({
    spec: mergedSpec,
    measurementGuidance: measurementGuidanceUsed,
  });

  const measurementWarnings = observationReport
    ? [...measured.measurementReport.warnings, ...observationReport.warnings]
    : measured.measurementReport.warnings;

  return {
    baseSpec: mergedSpec,
    spec: measured.spec,
    measurementGuidanceUsed,
    observationReport,
    measurementReport: {
      ...measured.measurementReport,
      warnings: measurementWarnings,
    },
    referenceImageAnalysis,
  };
}
