import type {
  MultiViewCritique,
  MultiViewCritiqueView,
  MultiViewCritiqueViewKey,
  QualityFinding,
  QualityReport,
  ReferenceFeatureCode,
  ReferenceIntent,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";
import { segmentReferenceImage } from "./referenceImageAnalysis.js";

type ViewConfig = {
  view: MultiViewCritiqueViewKey;
  lockedAngle: number;
  projection: "orthographic" | "perspective";
  fov?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function countComponents(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  let components = 0;
  const minArea = Math.max(10, Math.floor(width * height * 0.0015));

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 0 || visited[index] === 1) {
      continue;
    }

    let area = 0;
    const queue = [index];
    visited[index] = 1;

    while (queue.length > 0) {
      const current = queue.pop();

      if (current === undefined) {
        continue;
      }

      area += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];

      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }

        const neighborIndex = ny * width + nx;
        if (mask[neighborIndex] !== 0 || visited[neighborIndex] === 1) {
          continue;
        }

        visited[neighborIndex] = 1;
        queue.push(neighborIndex);
      }
    }

    if (area >= minArea) {
      components += 1;
    }
  }

  return Math.max(1, components);
}

function bandFillRatio(options: {
  mask: Uint8Array;
  width: number;
  height: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}): number {
  const spanX = Math.max(0, options.endX - options.startX);
  const spanY = Math.max(0, options.endY - options.startY);

  if (spanX === 0 || spanY === 0) {
    return 0;
  }

  let filled = 0;
  const total = spanX * spanY;

  for (let y = options.startY; y < options.endY; y += 1) {
    for (let x = options.startX; x < options.endX; x += 1) {
      if (options.mask[y * options.width + x] === 0) {
        filled += 1;
      }
    }
  }

  return roundMetric(filled / total);
}

function analyzePreviewView(dataUrl: string, view: MultiViewCritiqueViewKey): MultiViewCritiqueView {
  const segmented = segmentReferenceImage({
    referenceImage: {
      dataUrl,
      backgroundMode: "auto",
      backgroundTolerance: 32,
      cropPadding: 0,
    },
  });
  const bounds = segmented.foregroundBounds;

  if (!bounds) {
    return {
      view,
      metrics: {
        foregroundCoverage: 0,
        componentCount: 1,
        lowerBandFillRatio: 0,
        middleBandFillRatio: 0,
        lowerCoreFillRatio: 0,
        boundsWidthRatio: null,
        boundsHeightRatio: null,
      },
    };
  }

  const lowerBandStartY = Math.floor(bounds.y + bounds.height * 0.58);
  const middleBandStartY = Math.floor(bounds.y + bounds.height * 0.35);
  const middleBandEndY = Math.ceil(bounds.y + bounds.height * 0.7);
  const coreStartX = Math.floor(bounds.x + bounds.width * 0.2);
  const coreEndX = Math.ceil(bounds.x + bounds.width * 0.8);

  return {
    view,
    metrics: {
      foregroundCoverage: roundMetric(segmented.foregroundCoverage),
      componentCount: countComponents(segmented.mask, segmented.width, segmented.height),
      lowerBandFillRatio: bandFillRatio({
        mask: segmented.mask,
        width: segmented.width,
        height: segmented.height,
        startX: bounds.x,
        endX: bounds.x + bounds.width,
        startY: lowerBandStartY,
        endY: bounds.y + bounds.height,
      }),
      middleBandFillRatio: bandFillRatio({
        mask: segmented.mask,
        width: segmented.width,
        height: segmented.height,
        startX: bounds.x,
        endX: bounds.x + bounds.width,
        startY: middleBandStartY,
        endY: middleBandEndY,
      }),
      lowerCoreFillRatio: bandFillRatio({
        mask: segmented.mask,
        width: segmented.width,
        height: segmented.height,
        startX: coreStartX,
        endX: coreEndX,
        startY: lowerBandStartY,
        endY: bounds.y + bounds.height,
      }),
      boundsWidthRatio: roundMetric(bounds.width / segmented.width),
      boundsHeightRatio: roundMetric(bounds.height / segmented.height),
    },
  };
}

function hasFeature(intent: ReferenceIntent, feature: ReferenceFeatureCode): boolean {
  return intent.requiredFeatures.includes(feature) || intent.preferredFeatures.includes(feature);
}

function buildFindings(intent: ReferenceIntent, views: MultiViewCritiqueView[]): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const viewMap = new Map(views.map((view) => [view.view, view]));
  const sideRelevant = intent.assetType === "bed" || hasFeature(intent, "storage_base");

  const pushGapFinding = (
    code: string,
    message: string,
    suggestedFix: string,
    view: MultiViewCritiqueView | undefined,
    threshold: number,
  ) => {
    if (!view || view.metrics.lowerCoreFillRatio >= threshold) {
      return;
    }

    findings.push({
      code,
      severity: "warning",
      message,
      suggestedFix,
    });
  };

  if (sideRelevant) {
    pushGapFinding(
      "multi_view_left_side_open",
      "Left orthographic view still shows an overly hollow lower body silhouette.",
      "Add side closure or deepen drawer/carcass geometry so the left side reads as a solid storage base.",
      viewMap.get("left"),
      0.34,
    );
    pushGapFinding(
      "multi_view_right_side_open",
      "Right orthographic view still shows an overly hollow lower body silhouette.",
      "Add side closure or deepen drawer/carcass geometry so the right side reads as a solid storage base.",
      viewMap.get("right"),
      0.34,
    );
    pushGapFinding(
      "multi_view_front_open",
      "Front orthographic view still shows too much open lower-body space.",
      "Close the front storage base and embed drawers into a real carcass so the front silhouette reads complete.",
      viewMap.get("front"),
      0.28,
    );
    pushGapFinding(
      "multi_view_back_open",
      "Back orthographic view still shows too much open lower-body space.",
      "Close the rear lower bed structure so the storage base stays coherent from the back.",
      viewMap.get("back"),
      0.22,
    );
  }

  const fragmentedViews = views.filter((view) => view.metrics.componentCount > 2);
  if (fragmentedViews.length > 0) {
    findings.push({
      code: "multi_view_fragmented_structure",
      severity: fragmentedViews.length >= 2 ? "error" : "warning",
      message: `Multi-view preview found fragmented silhouettes in ${fragmentedViews.length} view(s), which usually indicates unsupported or disconnected geometry.`,
      suggestedFix: "Reconnect floating parts to the grounded structure or add the missing support/carcass geometry before finalizing the build.",
    });
  }

  return findings;
}

function clampScore(score: number): number {
  return clamp(Math.round(score), 0, 100);
}

export async function captureAndCritiqueMultiViewPreviews(options: {
  bridge: BridgeClient;
  intent: ReferenceIntent;
}): Promise<MultiViewCritique> {
  const configs: ViewConfig[] = [
    { view: "front", lockedAngle: 0, projection: "orthographic" },
    { view: "right", lockedAngle: 90, projection: "orthographic" },
    { view: "back", lockedAngle: 180, projection: "orthographic" },
    { view: "left", lockedAngle: 270, projection: "orthographic" },
    { view: "three_quarter_front", lockedAngle: 45, projection: "perspective", fov: 35 },
    { view: "three_quarter_back", lockedAngle: 225, projection: "perspective", fov: 35 },
  ];
  const views: MultiViewCritiqueView[] = [];

  for (const config of configs) {
    const preview = await options.bridge.renderPreview({
      mimeType: "image/png",
      viewPreset: "preserve",
      projection: config.projection,
      lockedAngle: config.lockedAngle,
      fov: config.fov,
    });
    views.push(analyzePreviewView(preview.dataUrl, config.view));
  }

  const findings = buildFindings(options.intent, views);
  let score = 100;

  for (const finding of findings) {
    score -= finding.severity === "error" ? 25 : finding.severity === "warning" ? 10 : 0;
  }

  const status =
    findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.some((finding) => finding.severity === "warning")
        ? "warn"
        : "pass";

  return {
    status,
    score: clampScore(score),
    views,
    findings,
  };
}

export function mergeMultiViewCritiqueIntoQualityReport(options: {
  qualityReport: QualityReport;
  critique: MultiViewCritique | null;
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
