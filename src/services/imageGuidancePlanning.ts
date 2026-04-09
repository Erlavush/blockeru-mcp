import type {
  AssetPart,
  AssetSpec,
  DraftAssetSpecFromImageInput,
  ImageGuidance,
} from "../contracts/schemas.js";
import { draftAssetSpecFromPrompt } from "./promptDrafting.js";

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
  const inferredAssetType = inferAssetTypeHint(input.imageGuidance);
  const planningPrompt = buildImageGuidancePlanningPrompt(input.prompt, {
    ...input.imageGuidance,
    assetTypeHint: input.imageGuidance.assetTypeHint ?? inferredAssetType,
  });
  const baseSpec = draftAssetSpecFromPrompt(planningPrompt, input.formatId);
  const materials = uniqueWords([
    ...baseSpec.materials,
    ...input.imageGuidance.materials,
  ]);
  const palette = uniqueWords([
    ...input.imageGuidance.dominantColors,
    ...baseSpec.palette,
  ]);
  const constraints = [...baseSpec.constraints];

  if (input.imageGuidance.notes) {
    constraints.push(`Image guidance: ${input.imageGuidance.notes}`);
  }

  if (input.imageGuidance.visibleParts.length > 0) {
    constraints.push(
      `Visible parts: ${uniqueWords(input.imageGuidance.visibleParts).join(", ")}`,
    );
  }

  return {
    ...baseSpec,
    assetType: inferredAssetType ?? baseSpec.assetType,
    estimatedSize: normalizeProportions(
      baseSpec.estimatedSize,
      input.imageGuidance.proportionHint,
    ),
    symmetry: input.imageGuidance.symmetry ?? baseSpec.symmetry,
    materials: materials.length > 0 ? materials : baseSpec.materials,
    palette: palette.length > 0 ? palette : baseSpec.palette,
    parts: mergePartMetadata(baseSpec.parts, input.imageGuidance),
    constraints,
  };
}
