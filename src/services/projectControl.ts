import type {
  EnsureProjectInput,
  EnsureProjectResult,
  ProjectContents,
  ProjectValidateInput,
  ProjectValidationResult,
  QualityFinding,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushFinding(
  findings: QualityFinding[],
  score: { value: number },
  finding: QualityFinding,
): void {
  findings.push(finding);

  if (finding.severity === "error") {
    score.value -= 25;
  } else if (finding.severity === "warning") {
    score.value -= 10;
  }
}

function summarizeBounds(contents: ProjectContents) {
  if (contents.cubes.length === 0) {
    return {
      min: null,
      max: null,
      size: null,
      center: null,
      groundY: null,
    };
  }

  const min = [Infinity, Infinity, Infinity] as [number, number, number];
  const max = [-Infinity, -Infinity, -Infinity] as [number, number, number];

  for (const cube of contents.cubes) {
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
    groundY: roundMetric(min[1]),
  };
}

function assertProjectRevision(options: {
  currentRevision: number | null;
  expectedRevision: number | undefined;
}): void {
  if (options.expectedRevision === undefined) {
    return;
  }

  if (options.currentRevision === null) {
    throw new Error("Project revision mismatch. No active project is available for the requested ifRevision.");
  }

  if (options.currentRevision !== options.expectedRevision) {
    throw new Error(
      `Project revision mismatch. Expected ${options.expectedRevision}, current ${options.currentRevision}.`,
    );
  }
}

export async function ensureProject(options: {
  bridge: BridgeClient;
  input: EnsureProjectInput;
}): Promise<EnsureProjectResult> {
  const current = await options.bridge.getProjectState();

  if (current.open) {
    assertProjectRevision({
      currentRevision: current.revision,
      expectedRevision: options.input.ifRevision,
    });
  }

  if (options.input.mode === "create_new") {
    const project = await options.bridge.createProject({
      name: options.input.name,
      formatId: options.input.formatId,
      textureWidth: options.input.textureWidth,
      textureHeight: options.input.textureHeight,
      boxUv: options.input.boxUv,
      ifRevision: current.revision ?? undefined,
    });

    return {
      action: "created",
      project,
    };
  }

  const canReuseCurrentProject =
    current.open && (current.formatId === null || current.formatId === options.input.formatId);

  if (options.input.mode === "replace_current_project" && canReuseCurrentProject) {
    const project = await options.bridge.clearProject({
      name: options.input.name,
      textureWidth: options.input.textureWidth,
      textureHeight: options.input.textureHeight,
      boxUv: options.input.boxUv,
      ifRevision: current.revision ?? undefined,
    });

    return {
      action: "cleared",
      project,
    };
  }

  if (options.input.mode === "reuse_or_create" && canReuseCurrentProject) {
    return {
      action: "reused",
      project: current,
    };
  }

  const project = await options.bridge.createProject({
    name: options.input.name,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
    ifRevision: current.open ? current.revision ?? undefined : undefined,
  });

  return {
    action: "created",
    project,
  };
}

export function validateProject(options: {
  contents: ProjectContents;
  input: ProjectValidateInput;
}): ProjectValidationResult {
  const findings: QualityFinding[] = [];
  const score = { value: 100 };
  const bounds = summarizeBounds(options.contents);
  const texturedCubeCount = options.contents.cubes.filter((cube) => cube.textureRef !== null).length;
  const untexturedCubeCount = options.contents.cubes.length - texturedCubeCount;
  const duplicateNames = new Set<string>();
  const seenNames = new Set<string>();

  for (const cube of options.contents.cubes) {
    if (seenNames.has(cube.name)) {
      duplicateNames.add(cube.name);
    } else {
      seenNames.add(cube.name);
    }
  }

  if (!options.contents.project.open) {
    pushFinding(findings, score, {
      code: "project_not_open",
      severity: "error",
      message: "No Blockbench project is currently open.",
      suggestedFix: "Create or ensure a Blockbench project before validating it.",
    });
  }

  if (!options.input.allowEmpty && options.contents.cubes.length === 0) {
    pushFinding(findings, score, {
      code: "empty_project",
      severity: "error",
      message: "The current Blockbench project does not contain any cubes.",
      suggestedFix: "Generate or add geometry before validating the project.",
    });
  }

  if (options.input.requireTextures && options.contents.textures.length === 0) {
    pushFinding(findings, score, {
      code: "missing_textures",
      severity: "warning",
      message: "The current project has no textures.",
      suggestedFix: "Create or import a texture and assign it to the generated elements.",
    });
  }

  if (options.input.requireTextures && untexturedCubeCount > 0) {
    pushFinding(findings, score, {
      code: "untextured_cubes",
      severity: "warning",
      message: `${untexturedCubeCount} cube(s) do not have an assigned texture.`,
      suggestedFix: "Assign a texture to every visible cube before export.",
    });
  }

  if (
    options.input.expectedTextureWidth !== undefined &&
    options.input.expectedTextureHeight !== undefined
  ) {
    const projectWidth = options.contents.project.textureWidth;
    const projectHeight = options.contents.project.textureHeight;

    if (
      projectWidth !== options.input.expectedTextureWidth ||
      projectHeight !== options.input.expectedTextureHeight
    ) {
      pushFinding(findings, score, {
        code: "project_texture_resolution_mismatch",
        severity: "warning",
        message: `Project texture resolution is ${projectWidth ?? "unknown"}x${projectHeight ?? "unknown"} instead of ${options.input.expectedTextureWidth}x${options.input.expectedTextureHeight}.`,
        suggestedFix: "Sync the Blockbench project texture resolution before generating or exporting the asset.",
      });
    }
  }

  if (bounds.center) {
    const centerOffsetX = Math.abs(bounds.center[0] - options.input.expectedCenter[0]);
    const centerOffsetZ = Math.abs(bounds.center[2] - options.input.expectedCenter[2]);

    if (centerOffsetX > 0.5 || centerOffsetZ > 0.5) {
      pushFinding(findings, score, {
        code: "scene_center_offset",
        severity: "warning",
        message: `Project bounds center is offset from the expected center by (${roundMetric(centerOffsetX)}, ${roundMetric(centerOffsetZ)}).`,
        suggestedFix: "Recenter the asset so it is aligned to the target Blockbench scene origin.",
      });
    }
  }

  if (bounds.groundY !== null && Math.abs(bounds.groundY) > 0.01) {
    pushFinding(findings, score, {
      code: "ground_contact_offset",
      severity: "warning",
      message: `Asset base sits at Y=${bounds.groundY} instead of Y=0.`,
      suggestedFix: "Lower or raise the asset so its lowest geometry sits on the ground plane.",
    });
  }

  if (duplicateNames.size > 0) {
    pushFinding(findings, score, {
      code: "duplicate_cube_names",
      severity: "info",
      message: `Duplicate cube names detected: ${Array.from(duplicateNames).sort().join(", ")}.`,
      suggestedFix: "Use stable unique names so later repair passes can target elements reliably.",
    });
  }

  const zeroSizedTexture = options.contents.textures.find(
    (texture) => texture.width <= 0 || texture.height <= 0,
  );

  if (zeroSizedTexture) {
    pushFinding(findings, score, {
      code: "zero_sized_texture",
      severity: "warning",
      message: `Texture "${zeroSizedTexture.name}" does not report a valid size.`,
      suggestedFix: "Reload or recreate the texture before relying on it for UV work.",
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
      cubeCount: options.contents.cubes.length,
      textureCount: options.contents.textures.length,
      texturedCubeCount,
      untexturedCubeCount,
      boundingBoxMin: bounds.min,
      boundingBoxMax: bounds.max,
      boundingBoxSize: bounds.size,
      boundingBoxCenter: bounds.center,
      groundY: bounds.groundY,
      centerOffsetX:
        bounds.center === null ? null : roundMetric(bounds.center[0] - options.input.expectedCenter[0]),
      centerOffsetZ:
        bounds.center === null ? null : roundMetric(bounds.center[2] - options.input.expectedCenter[2]),
      projectTextureSize:
        options.contents.project.textureWidth && options.contents.project.textureHeight
          ? [options.contents.project.textureWidth, options.contents.project.textureHeight]
          : null,
    },
  };
}
