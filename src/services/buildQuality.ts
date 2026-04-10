import type {
  BuildPlan,
  CubeResult,
  CubeSummary,
  PlannedCube,
  ProjectState,
  QualityFinding,
  QualityReport,
  TextureResult,
} from "../contracts/schemas.js";

function getTargetSceneCenter(formatId: string): [number, number, number] {
  const lower = formatId.toLowerCase();
  const useWorldOrigin = lower === "free" || lower === "generic" || lower === "generic_model";

  return useWorldOrigin ? [0, 0, 0] : [8, 0, 8];
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toBounds(cubes: Array<Pick<PlannedCube, "from" | "to"> | Pick<CubeResult, "from" | "to">>) {
  if (cubes.length === 0) {
    return {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
      size: [0, 0, 0] as [number, number, number],
      center: [0, 0, 0] as [number, number, number],
    };
  }

  const min = [Infinity, Infinity, Infinity] as [number, number, number];
  const max = [-Infinity, -Infinity, -Infinity] as [number, number, number];

  for (const cube of cubes) {
    min[0] = Math.min(min[0], cube.from[0], cube.to[0]);
    min[1] = Math.min(min[1], cube.from[1], cube.to[1]);
    min[2] = Math.min(min[2], cube.from[2], cube.to[2]);
    max[0] = Math.max(max[0], cube.from[0], cube.to[0]);
    max[1] = Math.max(max[1], cube.from[1], cube.to[1]);
    max[2] = Math.max(max[2], cube.from[2], cube.to[2]);
  }

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] as [number, number, number],
    center: [
      roundMetric((min[0] + max[0]) / 2),
      roundMetric((min[1] + max[1]) / 2),
      roundMetric((min[2] + max[2]) / 2),
    ] as [number, number, number],
  };
}

function collectUvStats(plan: BuildPlan) {
  const width = plan.textureWidth;
  const height = plan.textureHeight;
  const occupancy = new Uint8Array(width * height);
  const seenRects = new Set<string>();
  let overlapPixelCount = 0;
  let tinyFaceCount = 0;
  let packedFaceCount = 0;

  for (const cube of plan.cubes) {
    if (!cube.faces) {
      continue;
    }

    for (const face of Object.values(cube.faces)) {
      if (!face) {
        continue;
      }

      packedFaceCount += 1;
      const x1 = clamp(Math.floor(Math.min(face.uv[0], face.uv[2])), 0, width);
      const y1 = clamp(Math.floor(Math.min(face.uv[1], face.uv[3])), 0, height);
      const x2 = clamp(Math.ceil(Math.max(face.uv[0], face.uv[2])), 0, width);
      const y2 = clamp(Math.ceil(Math.max(face.uv[1], face.uv[3])), 0, height);
      const rectWidth = Math.max(0, x2 - x1);
      const rectHeight = Math.max(0, y2 - y1);
      const rectKey = `${x1}:${y1}:${x2}:${y2}`;

      if (Math.min(rectWidth, rectHeight) < 6) {
        tinyFaceCount += 1;
      }

      if (seenRects.has(rectKey)) {
        continue;
      }

      seenRects.add(rectKey);

      for (let y = y1; y < y2; y += 1) {
        for (let x = x1; x < x2; x += 1) {
          const index = y * width + x;

          if (occupancy[index] === 1) {
            overlapPixelCount += 1;
          } else {
            occupancy[index] = 1;
          }
        }
      }
    }
  }

  let usedPixels = 0;

  for (const pixel of occupancy) {
    if (pixel === 1) {
      usedPixels += 1;
    }
  }

  return {
    uvCoverageRatio: width * height > 0 ? usedPixels / (width * height) : null,
    overlapPixelCount,
    tinyFaceCount,
    packedFaceCount,
  };
}

function pushFinding(
  findings: QualityFinding[],
  finding: QualityFinding,
  score: { value: number },
): void {
  findings.push(finding);

  if (finding.severity === "error") {
    score.value -= 25;
  } else if (finding.severity === "warning") {
    score.value -= 10;
  }
}

export function analyzeBuildQuality(options: {
  plan: BuildPlan;
  project: ProjectState;
  texture: TextureResult | null;
  createdCubes: CubeResult[];
  resolvedCubes?: CubeSummary[];
  previewRendered: boolean;
}): QualityReport {
  const findings: QualityFinding[] = [];
  const score = { value: 100 };
  const targetCenter = getTargetSceneCenter(options.plan.formatId);
  const builtBounds = toBounds(
    options.resolvedCubes && options.resolvedCubes.length > 0
      ? options.resolvedCubes
      : options.createdCubes.length > 0
        ? options.createdCubes
        : options.plan.cubes,
  );
  const centerOffsetX = Math.abs(builtBounds.center[0] - targetCenter[0]);
  const centerOffsetZ = Math.abs(builtBounds.center[2] - targetCenter[2]);
  const uvStats = collectUvStats(options.plan);
  const requestedTextureSize: [number, number] = [
    options.plan.textureWidth,
    options.plan.textureHeight,
  ];
  const projectTextureSize =
    options.project.textureWidth && options.project.textureHeight
      ? ([options.project.textureWidth, options.project.textureHeight] as [number, number])
      : null;
  const generatedTextureSize =
    options.texture && options.texture.width > 0 && options.texture.height > 0
      ? ([options.texture.width, options.texture.height] as [number, number])
      : null;

  if (
    !projectTextureSize ||
    projectTextureSize[0] !== requestedTextureSize[0] ||
    projectTextureSize[1] !== requestedTextureSize[1]
  ) {
    pushFinding(
      findings,
      {
        code: "project_texture_resolution_mismatch",
        severity: "error",
        message: `Project texture resolution is ${projectTextureSize ? `${projectTextureSize[0]}x${projectTextureSize[1]}` : "unknown"} but the build requested ${requestedTextureSize[0]}x${requestedTextureSize[1]}.`,
        suggestedFix: "Reload the Blockbench bridge plugin and re-run the build so project UV resolution is synchronized before cubes are added.",
      },
      score,
    );
  }

  if (
    generatedTextureSize &&
    (generatedTextureSize[0] !== requestedTextureSize[0] ||
      generatedTextureSize[1] !== requestedTextureSize[1])
  ) {
    pushFinding(
      findings,
      {
        code: "generated_texture_size_mismatch",
        severity: "warning",
        message: `Generated texture size is ${generatedTextureSize[0]}x${generatedTextureSize[1]} but the build requested ${requestedTextureSize[0]}x${requestedTextureSize[1]}.`,
        suggestedFix: "Regenerate the texture after the project resolution is corrected.",
      },
      score,
    );
  }

  if (centerOffsetX > 0.5 || centerOffsetZ > 0.5) {
    pushFinding(
      findings,
      {
        code: "scene_center_offset",
        severity: "warning",
        message: `Built asset center is offset from the target scene center by (${roundMetric(centerOffsetX)}, ${roundMetric(centerOffsetZ)}).`,
        suggestedFix: "Recompute cube coordinates around the target scene origin before building.",
      },
      score,
    );
  }

  if (Math.abs(builtBounds.min[1]) > 0.01) {
    pushFinding(
      findings,
      {
        code: "ground_contact_offset",
        severity: "warning",
        message: `Asset base sits at Y=${roundMetric(builtBounds.min[1])} instead of Y=0.`,
        suggestedFix: "Shift the whole build vertically so the lowest cube starts at ground level.",
      },
      score,
    );
  }

  if (!options.texture) {
    pushFinding(
      findings,
      {
        code: "missing_texture",
        severity: "warning",
        message: "No texture was created for this asset build.",
        suggestedFix: "Enable texture creation or add a texture assignment pass before export.",
      },
      score,
    );
  }

  if (options.project.textureCount > 1) {
    pushFinding(
      findings,
      {
        code: "multiple_project_textures",
        severity: "warning",
        message: `Project currently contains ${options.project.textureCount} textures instead of a single managed atlas.`,
        suggestedFix: "Delete stale generated textures or update the existing managed atlas in place during repair passes.",
      },
      score,
    );
  }

  if (options.plan.boxUv) {
    pushFinding(
      findings,
      {
        code: "box_uv_enabled",
        severity: "warning",
        message: "Build used Blockbench box UV, which tends to underuse large atlases for detailed assets.",
        suggestedFix: "Use packed per-face UV layout for higher texture density.",
      },
      score,
    );
  }

  if (uvStats.uvCoverageRatio !== null && uvStats.uvCoverageRatio < 0.12) {
    pushFinding(
      findings,
      {
        code: "uv_underutilized",
        severity: "warning",
        message: `Only ${Math.round(uvStats.uvCoverageRatio * 100)}% of the texture sheet is being used.`,
        suggestedFix: "Pack UV islands more aggressively or reduce atlas size if the asset is intentionally simple.",
      },
      score,
    );
  }

  if (uvStats.overlapPixelCount > 0) {
    pushFinding(
      findings,
      {
        code: "uv_overlap_detected",
        severity: "warning",
        message: `${uvStats.overlapPixelCount} texture pixels are shared by multiple UV islands.`,
        suggestedFix: "Use slot-aware atlas packing so cubes in the same material bucket do not overlap unnecessarily.",
      },
      score,
    );
  }

  if (
    requestedTextureSize[0] >= 128 &&
    requestedTextureSize[1] >= 128 &&
    uvStats.tinyFaceCount > 0
  ) {
    pushFinding(
      findings,
      {
        code: "tiny_uv_faces",
        severity: "warning",
        message: `${uvStats.tinyFaceCount} faces still map to very small UV islands.`,
        suggestedFix: "Increase face packing scale or reduce the number of unique islands in the same material slot.",
      },
      score,
    );
  }

  if (!options.previewRendered) {
    findings.push({
      code: "preview_not_rendered",
      severity: "info",
      message: "No preview was rendered for this build, so visual verification has not run yet.",
      suggestedFix: "Enable preview rendering after each generation pass.",
    });
  }

  const status =
    findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.some((finding) => finding.severity === "warning")
        ? "warn"
        : "pass";

  return {
    status,
    score: clamp(Math.round(score.value), 0, 100),
    findings,
    metrics: {
      boundingBoxMin: builtBounds.min,
      boundingBoxMax: builtBounds.max,
      boundingBoxSize: builtBounds.size,
      boundingBoxCenter: builtBounds.center,
      targetCenter,
      groundY: builtBounds.min[1],
      requestedTextureSize,
      projectTextureSize,
      generatedTextureSize,
      uvCoverageRatio:
        uvStats.uvCoverageRatio === null ? null : roundMetric(uvStats.uvCoverageRatio),
      overlapPixelCount: uvStats.overlapPixelCount,
      tinyFaceCount: uvStats.tinyFaceCount,
      packedFaceCount: uvStats.packedFaceCount,
    },
  };
}
