import type {
  BuildAssetFromSpecInput,
  BuildAssetFromSpecResult,
  CubeResult,
  QualityReport,
  RepairAdjustment,
} from "../contracts/schemas.js";
import {
  planBuildFromAssetSpec,
  type RepairPlanningHints,
} from "./assetPlanning.js";
import { analyzeBuildQuality } from "./buildQuality.js";
import { generateMaterialAtlas } from "./proceduralTexture.js";
import type { BridgeClient } from "./bridgeClient.js";

async function prepareProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
}): Promise<"replace_current_project" | "new_project"> {
  let projectModeUsed: "replace_current_project" | "new_project" = options.input.projectMode;

  if (options.input.projectMode === "replace_current_project") {
    const currentProject = await options.bridge.getProjectState();
    const canReuseCurrentProject =
      currentProject.open &&
      (currentProject.formatId === null || currentProject.formatId === options.input.formatId);

    if (canReuseCurrentProject) {
      try {
        await options.bridge.clearProject({
          name: options.projectName,
          textureWidth: options.input.textureWidth,
          textureHeight: options.input.textureHeight,
          boxUv: options.input.boxUv,
        });

        return projectModeUsed;
      } catch (_error) {
        projectModeUsed = "new_project";
      }
    } else {
      projectModeUsed = "new_project";
    }
  }

  await options.bridge.createProject({
    name: options.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
  });

  return projectModeUsed;
}

function createInitialRepairHints(): RepairPlanningHints {
  return {
    compactMaterialSlots: false,
    shareRepeatedUvs: false,
    recenterScene: false,
    regroundAsset: false,
  };
}

function hasFinding(report: QualityReport, code: string): boolean {
  return report.findings.some((finding) => finding.code === code);
}

function proposeRepairAdjustments(
  report: QualityReport,
  repairHints: RepairPlanningHints,
): RepairAdjustment[] {
  const adjustments: RepairAdjustment[] = [];

  if (hasFinding(report, "uv_underutilized") && !repairHints.compactMaterialSlots) {
    adjustments.push({
      code: "compact_material_slots",
      description: "Collapse unused atlas regions so active material slots consume more texture area.",
    });
  }

  if (hasFinding(report, "tiny_uv_faces") && !repairHints.shareRepeatedUvs) {
    adjustments.push({
      code: "share_repeated_uvs",
      description: "Reuse UV islands for repeated cube dimensions so tiny faces can scale up.",
    });
  }

  if (hasFinding(report, "scene_center_offset") && !repairHints.recenterScene) {
    adjustments.push({
      code: "recenter_scene",
      description: "Rebuild the asset around the target Blockbench scene center.",
    });
  }

  if (hasFinding(report, "ground_contact_offset") && !repairHints.regroundAsset) {
    adjustments.push({
      code: "reground_asset",
      description: "Shift the generated asset so its lowest geometry sits on Y=0.",
    });
  }

  return adjustments;
}

function applyRepairAdjustments(
  repairHints: RepairPlanningHints,
  adjustments: RepairAdjustment[],
): RepairPlanningHints {
  const nextHints = { ...repairHints };

  for (const adjustment of adjustments) {
    switch (adjustment.code) {
      case "compact_material_slots":
        nextHints.compactMaterialSlots = true;
        break;
      case "share_repeated_uvs":
        nextHints.shareRepeatedUvs = true;
        break;
      case "recenter_scene":
        nextHints.recenterScene = true;
        break;
      case "reground_asset":
        nextHints.regroundAsset = true;
        break;
    }
  }

  return nextHints;
}

async function preparePassProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
  pass: number;
  projectModeUsed: "replace_current_project" | "new_project" | null;
}): Promise<"replace_current_project" | "new_project"> {
  if (options.pass === 1 || options.projectModeUsed === null) {
    return prepareProject({
      bridge: options.bridge,
      input: options.input,
      projectName: options.projectName,
    });
  }

  await options.bridge.clearProject({
    name: options.projectName,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
  });

  return options.projectModeUsed;
}

export async function buildBlockbenchAssetFromSpec(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
}): Promise<BuildAssetFromSpecResult> {
  const planningPrompt =
    options.input.prompt?.trim() || options.input.projectName || options.input.spec.assetType;
  const repairLoopEnabled = options.input.repairLoop.enabled;
  const maxPasses = repairLoopEnabled ? options.input.repairLoop.maxPasses : 1;
  let repairHints = createInitialRepairHints();
  let projectModeUsed: "replace_current_project" | "new_project" | null = null;
  const repairPasses: BuildAssetFromSpecResult["repairHistory"]["passes"] = [];
  const appliedAdjustments: RepairAdjustment[] = [];
  let finalSpec = {
    ...options.input.spec,
    estimatedSize: options.input.spec.estimatedSize,
    targetFormat: options.input.formatId,
  };
  let finalPlan = planBuildFromAssetSpec({
    prompt: planningPrompt,
    spec: options.input.spec,
    projectName: options.input.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
    repairHints,
  });
  let finalTexture = null;
  let finalCreatedCubes: CubeResult[] = [];
  let finalProject = await options.bridge.getProjectState();
  let finalPreview = null;
  let finalQualityReport: QualityReport = analyzeBuildQuality({
    plan: finalPlan,
    project: finalProject,
    texture: null,
    createdCubes: [],
    previewRendered: false,
  });

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const plan = planBuildFromAssetSpec({
      prompt: planningPrompt,
      spec: options.input.spec,
      projectName: options.input.projectName,
      formatId: options.input.formatId,
      textureWidth: options.input.textureWidth,
      textureHeight: options.input.textureHeight,
      boxUv: options.input.boxUv,
      repairHints,
    });

    const spec = {
      ...options.input.spec,
      estimatedSize: plan.estimatedSize,
      targetFormat: options.input.formatId,
    };

    projectModeUsed = await preparePassProject({
      bridge: options.bridge,
      input: options.input,
      projectName: plan.projectName,
      pass,
      projectModeUsed,
    });

    let texture = null;

    if (options.input.createTexture) {
      const atlas = generateMaterialAtlas(spec, plan);
      texture = await options.bridge.createTexture({
        name: atlas.name,
        dataUrl: atlas.dataUrl,
        applyToAll: false,
        setAsDefault: true,
      });

      if (texture.width === 0 || texture.height === 0) {
        texture = {
          ...texture,
          width: plan.textureWidth,
          height: plan.textureHeight,
        };
      }
    }

    const createdCubes: CubeResult[] = [];

    for (const cube of plan.cubes) {
      createdCubes.push(
        await options.bridge.addCube({
          name: cube.name,
          from: cube.from,
          to: cube.to,
          origin: cube.origin,
          uvOffset: cube.uvOffset,
          faces: cube.faces,
          boxUv: plan.boxUv,
          textureRef: texture?.uuid,
        }),
      );
    }

    const project = await options.bridge.getProjectState();
    const preview = options.input.renderPreview
      ? await options.bridge.renderPreview({ mimeType: "image/png" })
      : null;
    const qualityReport = analyzeBuildQuality({
      plan,
      project,
      texture,
      createdCubes,
      previewRendered: preview !== null,
    });
    const adjustments =
      repairLoopEnabled && pass < maxPasses
        ? proposeRepairAdjustments(qualityReport, repairHints)
        : [];

    repairPasses.push({
      pass,
      qualityReport,
      adjustments,
    });

    finalSpec = spec;
    finalPlan = plan;
    finalTexture = texture;
    finalCreatedCubes = createdCubes;
    finalProject = project;
    finalPreview = preview;
    finalQualityReport = qualityReport;

    if (adjustments.length === 0) {
      break;
    }

    repairHints = applyRepairAdjustments(repairHints, adjustments);
    appliedAdjustments.push(...adjustments);
  }

  return {
    source: "spec",
    prompt: options.input.prompt ?? null,
    projectModeUsed: projectModeUsed ?? options.input.projectMode,
    spec: finalSpec,
    plan: finalPlan,
    project: finalProject,
    texture: finalTexture,
    createdCubes: finalCreatedCubes,
    qualityReport: finalQualityReport,
    repairHistory: {
      enabled: repairLoopEnabled,
      totalPasses: repairPasses.length,
      passes: repairPasses,
      appliedAdjustments,
    },
    preview: finalPreview,
  };
}
