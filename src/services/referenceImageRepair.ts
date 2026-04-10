import type {
  AssetPart,
  AssetSpec,
  ReferenceImageAnalysis,
  ReferencePreviewCritique,
} from "../contracts/schemas.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scaleAxis(value: number, factor: number): number {
  return Math.max(1, Math.round(value * factor));
}

function scalePart(
  part: AssetPart,
  factorX: number,
  factorY: number,
): AssetPart {
  return {
    ...part,
    size: [
      scaleAxis(part.size[0], factorX),
      scaleAxis(part.size[1], factorY),
      part.size[2],
    ],
  };
}

export function applyReferencePreviewRepairToSpec(options: {
  spec: AssetSpec;
  critique: ReferencePreviewCritique;
  referenceImageAnalysis?: ReferenceImageAnalysis | null;
}): AssetSpec {
  const widthDelta = options.critique.metrics.widthRatioSignedDelta ?? 0;
  const heightDelta = options.critique.metrics.heightRatioSignedDelta ?? 0;
  const factorX = clamp(1 - widthDelta * 0.9, 0.82, 1.18);
  const factorY = clamp(1 - heightDelta * 0.9, 0.82, 1.18);

  const notes: string[] = [];
  if (Math.abs(widthDelta) > 0.02) {
    notes.push(`Visual repair adjusted overall width by ${(factorX * 100).toFixed(1)}% from reference silhouette critique.`);
  }
  if (Math.abs(heightDelta) > 0.02) {
    notes.push(`Visual repair adjusted overall height by ${(factorY * 100).toFixed(1)}% from reference silhouette critique.`);
  }

  return {
    ...options.spec,
    estimatedSize: [
      scaleAxis(options.spec.estimatedSize[0], factorX),
      scaleAxis(options.spec.estimatedSize[1], factorY),
      options.spec.estimatedSize[2],
    ],
    materialColorHints: {
      ...options.spec.materialColorHints,
      ...(options.referenceImageAnalysis?.materialColorHints ?? {}),
    },
    parts: options.spec.parts.map((part) => scalePart(part, factorX, factorY)),
    constraints: notes.length > 0 ? [...options.spec.constraints, ...notes] : options.spec.constraints,
  };
}
