import type {
  PreviewRenderResult,
  QualityFinding,
  QualityReport,
  ReferenceImageAnalysis,
  ReferenceImageInput,
  ReferencePreviewCritique,
} from "../contracts/schemas.js";
import { analyzeReferenceImage, segmentReferenceImage } from "./referenceImageAnalysis.js";

type SegmentedLike = ReturnType<typeof segmentReferenceImage>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function normalizeMask(segmented: SegmentedLike, size = 64): Uint8Array {
  const output = new Uint8Array(size * size);
  const bounds = segmented.foregroundBounds;

  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return output;
  }

  const scale = Math.min((size - 2) / bounds.width, (size - 2) / bounds.height);
  const offsetX = (size - bounds.width * scale) / 2;
  const offsetY = (size - bounds.height * scale) / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.floor((x - offsetX) / scale + bounds.x);
      const sourceY = Math.floor((y - offsetY) / scale + bounds.y);

      if (
        sourceX < bounds.x ||
        sourceY < bounds.y ||
        sourceX >= bounds.x + bounds.width ||
        sourceY >= bounds.y + bounds.height
      ) {
        continue;
      }

      const sourceIndex = sourceY * segmented.width + sourceX;
      if (segmented.mask[sourceIndex] === 0) {
        output[y * size + x] = 1;
      }
    }
  }

  return output;
}

function computeIoU(a: Uint8Array, b: Uint8Array): number | null {
  if (a.length !== b.length || a.length === 0) {
    return null;
  }

  let intersection = 0;
  let union = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] === 1;
    const right = b[index] === 1;

    if (left && right) {
      intersection += 1;
    }
    if (left || right) {
      union += 1;
    }
  }

  return union === 0 ? null : Number((intersection / union).toFixed(6));
}

function maskBandWidths(mask: Uint8Array, size: number, bands = 8): number[] {
  const widths: number[] = [];
  const rowsPerBand = Math.max(1, Math.floor(size / bands));

  for (let band = 0; band < bands; band += 1) {
    const startY = band * rowsPerBand;
    const endY = band === bands - 1 ? size : Math.min(size, startY + rowsPerBand);
    let minX = Infinity;
    let maxX = -Infinity;

    for (let y = startY; y < endY; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (mask[y * size + x] !== 1) {
          continue;
        }

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }

    widths.push(minX === Infinity ? 0 : (maxX - minX + 1) / size);
  }

  return widths;
}

function averageAbsoluteDelta(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) {
    return null;
  }

  let total = 0;

  for (let index = 0; index < a.length; index += 1) {
    total += Math.abs(a[index] - b[index]);
  }

  return Number((total / a.length).toFixed(6));
}

function normalizedBoundsStats(segmented: SegmentedLike) {
  const bounds = segmented.foregroundBounds;

  if (!bounds) {
    return {
      widthRatio: null,
      heightRatio: null,
      aspectRatio: null,
      centerX: null,
      centerY: null,
    };
  }

  return {
    widthRatio: Number((bounds.width / segmented.width).toFixed(6)),
    heightRatio: Number((bounds.height / segmented.height).toFixed(6)),
    aspectRatio: bounds.height > 0 ? Number((bounds.width / bounds.height).toFixed(6)) : null,
    centerX: Number(((bounds.x + bounds.width / 2) / segmented.width).toFixed(6)),
    centerY: Number(((bounds.y + bounds.height / 2) / segmented.height).toFixed(6)),
  };
}

function dominantPaletteDistance(reference: string[], preview: string[]): number | null {
  const left = reference.slice(0, 3).map(parseHex);
  const right = preview.slice(0, 3).map(parseHex);

  if (left.length === 0 || right.length === 0) {
    return null;
  }

  let total = 0;

  for (const color of left) {
    const distance = Math.min(...right.map((candidate) => colorDistance(color, candidate)));
    total += distance;
  }

  return Number((total / left.length).toFixed(4));
}

function clampScore(score: number): number {
  return clamp(Math.round(score), 0, 100);
}

function buildFindings(metrics: ReferencePreviewCritique["metrics"]): QualityFinding[] {
  const findings: QualityFinding[] = [];

  if (metrics.silhouetteIoU !== null && metrics.silhouetteIoU < 0.35) {
    findings.push({
      code: "reference_preview_silhouette_mismatch",
      severity: "error",
      message: `Preview silhouette overlap against the reference is only ${Math.round(
        metrics.silhouetteIoU * 100,
      )}%.`,
      suggestedFix: "Re-measure the reference silhouette and adjust the major part proportions before rebuilding.",
    });
  } else if (metrics.silhouetteIoU !== null && metrics.silhouetteIoU < 0.55) {
    findings.push({
      code: "reference_preview_silhouette_mismatch",
      severity: "warning",
      message: `Preview silhouette overlap against the reference is only ${Math.round(
        metrics.silhouetteIoU * 100,
      )}%.`,
      suggestedFix: "Adjust the overall frame and major silhouette proportions to track the reference more closely.",
    });
  }

  if (
    (metrics.widthRatioDelta !== null && metrics.widthRatioDelta > 0.12) ||
    (metrics.heightRatioDelta !== null && metrics.heightRatioDelta > 0.12)
  ) {
    findings.push({
      code: "reference_preview_proportion_mismatch",
      severity: "warning",
      message: "Preview bounding-box proportions diverge noticeably from the reference silhouette.",
      suggestedFix: "Scale the estimated width and height from the measured reference silhouette before rebuilding.",
    });
  }

  if (metrics.bandProfileError !== null && metrics.bandProfileError > 0.16) {
    findings.push({
      code: "reference_preview_band_profile_mismatch",
      severity: "warning",
      message: "Preview silhouette width distribution by height band does not match the reference.",
      suggestedFix: "Adjust upper and middle structure widths so the back, arms, and seat read closer to the reference profile.",
    });
  }

  if (metrics.dominantColorDistance !== null && metrics.dominantColorDistance > 52) {
    findings.push({
      code: "reference_preview_palette_mismatch",
      severity: "warning",
      message: "Preview palette still differs significantly from the reference image.",
      suggestedFix: "Use sampled reference palette colors as the material base colors before regenerating the texture atlas.",
    });
  }

  return findings;
}

export function critiquePreviewAgainstReference(options: {
  referenceImage: ReferenceImageInput;
  preview: PreviewRenderResult;
  referenceAnalysis?: ReferenceImageAnalysis | null;
}): {
  analysis: ReferenceImageAnalysis;
  critique: ReferencePreviewCritique;
} {
  const referenceAnalysis =
    options.referenceAnalysis ??
    analyzeReferenceImage({
      referenceImage: options.referenceImage,
    });
  const referenceSegmented = segmentReferenceImage({
    referenceImage: options.referenceImage,
  });
  const previewSegmented = segmentReferenceImage({
    referenceImage: {
      dataUrl: options.preview.dataUrl,
      backgroundMode: "auto",
      backgroundTolerance: 36,
      cropPadding: 0,
    },
  });
  const normalizedReferenceMask = normalizeMask(referenceSegmented);
  const normalizedPreviewMask = normalizeMask(previewSegmented);
  const referenceStats = normalizedBoundsStats(referenceSegmented);
  const previewStats = normalizedBoundsStats(previewSegmented);
  const referenceBands = maskBandWidths(normalizedReferenceMask, 64);
  const previewBands = maskBandWidths(normalizedPreviewMask, 64);
  const metrics: ReferencePreviewCritique["metrics"] = {
    silhouetteIoU: computeIoU(normalizedReferenceMask, normalizedPreviewMask),
    aspectRatioDelta:
      referenceStats.aspectRatio !== null && previewStats.aspectRatio !== null
        ? Number((Math.abs(referenceStats.aspectRatio - previewStats.aspectRatio) / Math.max(0.0001, referenceStats.aspectRatio)).toFixed(6))
        : null,
    aspectRatioSignedDelta:
      referenceStats.aspectRatio !== null && previewStats.aspectRatio !== null
        ? Number((((previewStats.aspectRatio - referenceStats.aspectRatio) / Math.max(0.0001, referenceStats.aspectRatio))).toFixed(6))
        : null,
    widthRatioDelta:
      referenceStats.widthRatio !== null && previewStats.widthRatio !== null
        ? Number((Math.abs(referenceStats.widthRatio - previewStats.widthRatio)).toFixed(6))
        : null,
    widthRatioSignedDelta:
      referenceStats.widthRatio !== null && previewStats.widthRatio !== null
        ? Number((previewStats.widthRatio - referenceStats.widthRatio).toFixed(6))
        : null,
    heightRatioDelta:
      referenceStats.heightRatio !== null && previewStats.heightRatio !== null
        ? Number((Math.abs(referenceStats.heightRatio - previewStats.heightRatio)).toFixed(6))
        : null,
    heightRatioSignedDelta:
      referenceStats.heightRatio !== null && previewStats.heightRatio !== null
        ? Number((previewStats.heightRatio - referenceStats.heightRatio).toFixed(6))
        : null,
    fillRatioDelta: Number(
      Math.abs(referenceSegmented.foregroundCoverage - previewSegmented.foregroundCoverage).toFixed(6),
    ),
    fillRatioSignedDelta: Number(
      (previewSegmented.foregroundCoverage - referenceSegmented.foregroundCoverage).toFixed(6),
    ),
    centerOffsetX:
      referenceStats.centerX !== null && previewStats.centerX !== null
        ? Number((Math.abs(referenceStats.centerX - previewStats.centerX)).toFixed(6))
        : null,
    centerSignedOffsetX:
      referenceStats.centerX !== null && previewStats.centerX !== null
        ? Number((previewStats.centerX - referenceStats.centerX).toFixed(6))
        : null,
    centerOffsetY:
      referenceStats.centerY !== null && previewStats.centerY !== null
        ? Number((Math.abs(referenceStats.centerY - previewStats.centerY)).toFixed(6))
        : null,
    centerSignedOffsetY:
      referenceStats.centerY !== null && previewStats.centerY !== null
        ? Number((previewStats.centerY - referenceStats.centerY).toFixed(6))
        : null,
    bandProfileError: averageAbsoluteDelta(referenceBands, previewBands),
    dominantColorDistance: dominantPaletteDistance(
      referenceAnalysis.dominantColors,
      previewSegmented.dominantColors,
    ),
  };
  const findings = buildFindings(metrics);
  let score = 100;

  for (const finding of findings) {
    score -= finding.severity === "error" ? 25 : 10;
  }

  const status =
    findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.some((finding) => finding.severity === "warning")
        ? "warn"
        : "pass";

  return {
    analysis: referenceAnalysis,
    critique: {
      status,
      score: clampScore(score),
      metrics,
      findings,
    },
  };
}

export function mergeReferencePreviewCritiqueIntoQualityReport(options: {
  qualityReport: QualityReport;
  critique: ReferencePreviewCritique | null;
}): QualityReport {
  if (!options.critique) {
    return options.qualityReport;
  }

  const findings = [...options.qualityReport.findings, ...options.critique.findings];
  const penalty = options.critique.findings.reduce(
    (sum, finding) => sum + (finding.severity === "error" ? 25 : finding.severity === "warning" ? 10 : 0),
    0,
  );
  const status =
    findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.some((finding) => finding.severity === "warning")
        ? "warn"
        : "pass";

  return {
    ...options.qualityReport,
    status,
    score: clampScore(options.qualityReport.score - penalty),
    findings,
  };
}
