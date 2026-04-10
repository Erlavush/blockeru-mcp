import type {
  BuildAssetFromSpecInput,
  BuildAssetFromSpecResult,
  BuildMutationPlan,
  CubeResult,
  ProjectContents,
  ProjectState,
  QualityReport,
  RepairAdjustment,
} from "../contracts/schemas.js";
import {
  planBuildFromAssetSpec,
  type RepairPlanningHints,
} from "./assetPlanning.js";
import { analyzeBuildQuality } from "./buildQuality.js";
import { deriveReferenceIntent } from "./referenceIntent.js";
import {
  critiqueProjectAgainstIntent,
  mergeSemanticCritiqueIntoQualityReport,
} from "./semanticCritique.js";
import {
  captureAndCritiqueMultiViewPreviews,
  mergeMultiViewCritiqueIntoQualityReport,
} from "./multiViewPreviewCritique.js";
import {
  applyProjectMutationPlan,
  buildMutationSummary,
  filterManagedProjectCubes,
  planProjectMutation,
} from "./projectMutation.js";
import { generateMaterialAtlas } from "./proceduralTexture.js";
import {
  applyManagedTextureMutation,
  cleanupManagedTextures,
  planManagedTextureMutation,
} from "./textureMutation.js";
import type { BridgeClient } from "./bridgeClient.js";

type PreparedProject = {
  projectModeUsed: "replace_current_project" | "new_project";
  project: ProjectState;
  contents: ProjectContents;
};

async function readProjectContents(bridge: BridgeClient): Promise<ProjectContents> {
  return bridge.getProjectContents();
}

async function createFreshProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
  currentProject: ProjectState;
}): Promise<PreparedProject> {
  const project = await options.bridge.createProject({
    name: options.projectName,
    formatId: options.input.formatId,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
    ifRevision: options.currentProject.open ? options.currentProject.revision ?? undefined : undefined,
  });

  return {
    projectModeUsed: "new_project",
    project,
    contents: await readProjectContents(options.bridge),
  };
}

async function prepareInitialProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
}): Promise<PreparedProject> {
  const currentProject = await options.bridge.getProjectState();

  if (options.input.projectMode === "new_project") {
    return createFreshProject({
      bridge: options.bridge,
      input: options.input,
      projectName: options.projectName,
      currentProject,
    });
  }

  const canReuseCurrentProject =
    currentProject.open &&
    (currentProject.formatId === null || currentProject.formatId === options.input.formatId);

  if (canReuseCurrentProject) {
    return {
      projectModeUsed: "replace_current_project",
      project: currentProject,
      contents: await readProjectContents(options.bridge),
    };
  }

  return createFreshProject({
    bridge: options.bridge,
    input: options.input,
    projectName: options.projectName,
    currentProject,
  });
}

async function preparePassProject(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
  pass: number;
  projectModeUsed: "replace_current_project" | "new_project" | null;
}): Promise<PreparedProject> {
  if (options.pass === 1 || options.projectModeUsed === null) {
    return prepareInitialProject({
      bridge: options.bridge,
      input: options.input,
      projectName: options.projectName,
    });
  }

  const currentProject = await options.bridge.getProjectState();
  const canReuseCurrentProject =
    currentProject.open &&
    (currentProject.formatId === null || currentProject.formatId === options.input.formatId);

  if (canReuseCurrentProject) {
    return {
      projectModeUsed: options.projectModeUsed,
      project: currentProject,
      contents: await readProjectContents(options.bridge),
    };
  }

  return createFreshProject({
    bridge: options.bridge,
    input: options.input,
    projectName: options.projectName,
    currentProject,
  });
}

async function clearProjectForRebuild(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
  projectName: string;
  project: ProjectState;
  projectModeUsed: "replace_current_project" | "new_project";
}): Promise<PreparedProject> {
  const project = await options.bridge.clearProject({
    name: options.projectName,
    textureWidth: options.input.textureWidth,
    textureHeight: options.input.textureHeight,
    boxUv: options.input.boxUv,
    ifRevision: options.project.revision ?? undefined,
  });

  return {
    projectModeUsed: options.projectModeUsed,
    project,
    contents: await readProjectContents(options.bridge),
  };
}

function createInitialRepairHints(): RepairPlanningHints {
  return {
    compactMaterialSlots: false,
    shareRepeatedUvs: false,
    recenterScene: false,
    regroundAsset: false,
    addArmrests: false,
    addSideSlats: false,
    addFrontBeam: false,
    addSeatCushion: false,
    addBackCushion: false,
    insetSeat: false,
    raiseBack: false,
    completeBedFrame: false,
    closeBedSides: false,
    closeBedUnderside: false,
    embedDrawers: false,
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

  if (hasFinding(report, "missing_armrests") && !repairHints.addArmrests) {
    adjustments.push({
      code: "add_armrests",
      description: "Add missing armrests and supporting frame elements.",
    });
  }

  if (
    (hasFinding(report, "missing_side_slats") || hasFinding(report, "solid_side_structure")) &&
    !repairHints.addSideSlats
  ) {
    adjustments.push({
      code: "add_side_slats",
      description: "Open the chair sides with thin vertical slats.",
    });
  }

  if (hasFinding(report, "front_beam_hidden") && !repairHints.addFrontBeam) {
    adjustments.push({
      code: "add_front_beam",
      description: "Expose a lower front beam beneath the seat.",
    });
  }

  if (hasFinding(report, "missing_seat_cushion") && !repairHints.addSeatCushion) {
    adjustments.push({
      code: "add_seat_cushion",
      description: "Add a distinct inset seat cushion block.",
    });
  }

  if (hasFinding(report, "missing_back_cushion") && !repairHints.addBackCushion) {
    adjustments.push({
      code: "add_back_cushion",
      description: "Add a separate back cushion block.",
    });
  }

  if (hasFinding(report, "seat_not_inset") && !repairHints.insetSeat) {
    adjustments.push({
      code: "inset_seat",
      description: "Inset the seat inside the outer frame silhouette.",
    });
  }

  if (hasFinding(report, "back_not_above_armrests") && !repairHints.raiseBack) {
    adjustments.push({
      code: "raise_back",
      description: "Raise the back so it extends above the armrest plane.",
    });
  }

  if (
    (hasFinding(report, "missing_footboard") ||
      hasFinding(report, "mattress_unsupported") ||
      hasFinding(report, "floating_geometry_detected") ||
      hasFinding(report, "multi_view_fragmented_structure")) &&
    !repairHints.completeBedFrame
  ) {
    adjustments.push({
      code: "complete_bed_frame",
      description: "Complete the hidden bed frame, support deck, posts, and rear/front closure.",
    });
  }

  if (
    (hasFinding(report, "left_side_open_gap") ||
      hasFinding(report, "right_side_open_gap") ||
      hasFinding(report, "storage_base_open") ||
      hasFinding(report, "multi_view_left_side_open") ||
      hasFinding(report, "multi_view_right_side_open")) &&
    !repairHints.closeBedSides
  ) {
    adjustments.push({
      code: "close_bed_sides",
      description: "Close the lower left and right bed sides so the storage base stops reading as hollow.",
    });
  }

  if (
    (hasFinding(report, "open_bed_underside") ||
      hasFinding(report, "low_lower_body_coverage") ||
      hasFinding(report, "multi_view_front_open") ||
      hasFinding(report, "multi_view_back_open")) &&
    !repairHints.closeBedUnderside
  ) {
    adjustments.push({
      code: "close_bed_underside",
      description: "Add underside/base closure so the lower volume reads as a complete bed body.",
    });
  }

  if (hasFinding(report, "drawer_fronts_not_embedded") && !repairHints.embedDrawers) {
    adjustments.push({
      code: "embed_drawers",
      description: "Deepen thin drawer fronts into embedded drawer bodies.",
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
      case "add_armrests":
        nextHints.addArmrests = true;
        break;
      case "add_side_slats":
        nextHints.addSideSlats = true;
        break;
      case "add_front_beam":
        nextHints.addFrontBeam = true;
        break;
      case "add_seat_cushion":
        nextHints.addSeatCushion = true;
        break;
      case "add_back_cushion":
        nextHints.addBackCushion = true;
        break;
      case "inset_seat":
        nextHints.insetSeat = true;
        break;
      case "raise_back":
        nextHints.raiseBack = true;
        break;
      case "complete_bed_frame":
        nextHints.completeBedFrame = true;
        break;
      case "close_bed_sides":
        nextHints.closeBedSides = true;
        break;
      case "close_bed_underside":
        nextHints.closeBedUnderside = true;
        break;
      case "embed_drawers":
        nextHints.embedDrawers = true;
        break;
    }
  }

  return nextHints;
}

function mergeMutationPlan(options: {
  strategyPlan: BuildMutationPlan;
  executionPlan: BuildMutationPlan;
}): BuildMutationPlan {
  return {
    ...options.executionPlan,
    strategy: options.strategyPlan.strategy,
    safety: options.strategyPlan.safety,
  };
}

export async function buildBlockbenchAssetFromSpec(options: {
  bridge: BridgeClient;
  input: BuildAssetFromSpecInput;
}): Promise<BuildAssetFromSpecResult> {
  const planningPrompt =
    options.input.prompt?.trim() || options.input.projectName || options.input.spec.assetType;
  const semanticIntent = deriveReferenceIntent({
    prompt: planningPrompt,
    spec: options.input.spec,
  });
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
  let finalStructureSummary: BuildAssetFromSpecResult["structureSummary"] = {
    managedScope: finalPlan.mutationScope,
    totalCubeCount: 0,
    analyzedCubeCount: 0,
    textureCount: 0,
    boundsMin: null,
    boundsMax: null,
    boundsSize: null,
    namedPartCounts: {},
    detectedFeatures: [],
    chair: null,
    bed: null,
  };
  let finalSemanticCritique: BuildAssetFromSpecResult["semanticCritique"] = {
    status: "pass",
    score: 100,
    intent: semanticIntent,
    structure: finalStructureSummary,
    findings: [],
  };
  let finalMultiViewCritique: BuildAssetFromSpecResult["multiViewCritique"] = null;
  let finalMutationPlan: BuildMutationPlan = {
    strategy: "patch",
    scope: finalPlan.mutationScope,
    targetProjectName: finalPlan.projectName,
    targetTextureName: finalPlan.managedTextureName,
    safety: {
      patchEligible: true,
      managedCubeCount: 0,
      foreignCubeCount: 0,
      duplicateCurrentCubeNames: [],
      duplicatePlannedCubeNames: [],
      fallbackReason: null,
    },
    operations: [],
  };
  let finalMutationSummary: BuildAssetFromSpecResult["mutationSummary"] = {
    strategy: "patch",
    scope: finalPlan.mutationScope,
    addedCubeCount: 0,
    updatedCubeCount: 0,
    deletedCubeCount: 0,
    retainedCubeCount: 0,
    textureCreated: false,
    textureAction: "none",
    deletedTextureCount: 0,
    managedTextureUuid: null,
    finalRevision: null,
  };
  let finalTexture = null;
  let finalCreatedCubes: CubeResult[] = [];
  let finalResolvedCubes: BuildAssetFromSpecResult["resolvedCubes"] = [];
  let finalResolvedTextures: BuildAssetFromSpecResult["resolvedTextures"] = [];
  let finalProject = await options.bridge.getProjectState();
  let finalPreview = null;
  let finalQualityReport: QualityReport = analyzeBuildQuality({
    plan: finalPlan,
    project: finalProject,
    texture: null,
    createdCubes: [],
    resolvedCubes: [],
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

    let preparedProject = await preparePassProject({
      bridge: options.bridge,
      input: options.input,
      projectName: plan.projectName,
      pass,
      projectModeUsed,
    });
    projectModeUsed = preparedProject.projectModeUsed;

    const strategyDecision = planProjectMutation({
      contents: preparedProject.contents,
      plan,
      desiredTextureRef: null,
    });

    if (
      strategyDecision.mutationPlan.strategy === "rebuild" &&
      preparedProject.contents.cubes.length > 0
    ) {
      preparedProject = await clearProjectForRebuild({
        bridge: options.bridge,
        input: options.input,
        projectName: plan.projectName,
        project: preparedProject.project,
        projectModeUsed: preparedProject.projectModeUsed,
      });
    }

    let currentRevision = preparedProject.project.revision;
    const managedTexturePlan = planManagedTextureMutation({
      contents: preparedProject.contents,
      plan,
      createTexture: options.input.createTexture,
    });
    const atlas = options.input.createTexture ? generateMaterialAtlas(spec, plan) : null;
    const textureMutation = await applyManagedTextureMutation({
      bridge: options.bridge,
      atlas,
      executionPlan: managedTexturePlan,
      plan,
      currentRevision,
    });
    let texture = textureMutation.texture;
    currentRevision = textureMutation.finalRevision;

    if (texture && (texture.width === 0 || texture.height === 0)) {
      texture = {
        ...texture,
        width: plan.textureWidth,
        height: plan.textureHeight,
      };
    }

    const desiredTextureRef = options.input.createTexture ? texture?.uuid ?? null : null;
    const executionPlan = planProjectMutation({
      contents: preparedProject.contents,
      plan,
      desiredTextureRef,
    });
    const executionResult = await applyProjectMutationPlan({
      bridge: options.bridge,
      plan,
      executionPlan,
      desiredTextureRef,
      currentRevision,
    });
    const textureCleanup = await cleanupManagedTextures({
      bridge: options.bridge,
      staleTextures: managedTexturePlan.staleTextures,
      currentRevision: executionResult.finalRevision,
    });
    const executionResultWithTextureCleanup = {
      ...executionResult,
      finalRevision: textureCleanup.finalRevision,
    };
    const project = await options.bridge.getProjectState();
    const contents = await readProjectContents(options.bridge);
    const resolvedCubes = filterManagedProjectCubes(contents, plan.mutationScope);
    const resolvedTextures = contents.textures;
    const preview = options.input.renderPreview
      ? await options.bridge.renderPreview({
          mimeType: "image/png",
          viewPreset: "preserve",
          projection: "preserve",
        })
      : null;
    const mutationPlan = mergeMutationPlan({
      strategyPlan: strategyDecision.mutationPlan,
      executionPlan: executionPlan.mutationPlan,
    });
    const mutationSummary = buildMutationSummary({
      mutationPlan,
      executionResult: executionResultWithTextureCleanup,
      textureCreated: textureMutation.action === "created",
      textureAction: textureMutation.action,
      deletedTextureCount: textureCleanup.deletedTextures.length,
      managedTextureUuid: texture?.uuid ?? null,
    });
    const baseQualityReport = analyzeBuildQuality({
      plan,
      project,
      texture,
      createdCubes: executionResult.createdCubes,
      resolvedCubes,
      previewRendered: preview !== null,
    });
    const semanticCritique = critiqueProjectAgainstIntent({
      contents,
      managedScope: plan.mutationScope,
      managedOnly: true,
      prompt: planningPrompt,
      spec,
    });
    const multiViewCritique =
      options.input.renderPreview
        ? await captureAndCritiqueMultiViewPreviews({
            bridge: options.bridge,
            intent: semanticCritique.intent,
          })
        : null;
    const qualityWithSemantic = mergeSemanticCritiqueIntoQualityReport({
      qualityReport: baseQualityReport,
      semanticCritique,
    });
    const qualityReport = mergeMultiViewCritiqueIntoQualityReport({
      qualityReport: qualityWithSemantic,
      critique: multiViewCritique,
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
    finalStructureSummary = semanticCritique.structure;
    finalSemanticCritique = semanticCritique;
    finalMultiViewCritique = multiViewCritique;
    finalMutationPlan = mutationPlan;
    finalMutationSummary = mutationSummary;
    finalTexture = texture;
    finalCreatedCubes = executionResult.createdCubes;
    finalResolvedCubes = resolvedCubes;
    finalResolvedTextures = resolvedTextures;
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
    semanticIntent: finalSemanticCritique.intent,
    plan: finalPlan,
    mutationPlan: finalMutationPlan,
    mutationSummary: finalMutationSummary,
    project: finalProject,
    texture: finalTexture,
    createdCubes: finalCreatedCubes,
    resolvedCubes: finalResolvedCubes,
    resolvedTextures: finalResolvedTextures,
    structureSummary: finalStructureSummary,
    semanticCritique: finalSemanticCritique,
    multiViewCritique: finalMultiViewCritique,
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
