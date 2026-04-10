import type {
  AssetSpec,
  ProjectContents,
  ProjectStructureSummary,
  QualityFinding,
  QualityReport,
  ReferenceFeatureCode,
  ReferenceIntent,
  SemanticCritique,
} from "../contracts/schemas.js";
import { describeProjectStructure } from "./projectIntrospection.js";
import { deriveReferenceIntent } from "./referenceIntent.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pushFinding(findings: QualityFinding[], score: { value: number }, finding: QualityFinding): void {
  findings.push(finding);

  if (finding.severity === "error") {
    score.value -= 25;
  } else if (finding.severity === "warning") {
    score.value -= 10;
  }
}

function hasFeature(intent: ReferenceIntent, feature: ReferenceFeatureCode): boolean {
  return intent.requiredFeatures.includes(feature) || intent.preferredFeatures.includes(feature);
}

function critiqueChairStructure(options: {
  intent: ReferenceIntent;
  structure: ProjectStructureSummary;
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const chair = options.structure.chair;

  if (!chair) {
    findings.push({
      code: "chair_structure_unresolved",
      severity: "warning",
      message: "Project structure does not expose enough chair-like cues for semantic validation.",
      suggestedFix: "Use stable part names or add clearer seat/back/frame structure so semantic repair can target the asset.",
    });
    return findings;
  }

  if (hasFeature(options.intent, "four_legs") && chair.legCount < 4) {
    findings.push({
      code: "missing_legs",
      severity: "warning",
      message: `Reference intent expects four visible legs, but only ${chair.legCount} leg-like elements were detected.`,
      suggestedFix: "Add or restore missing support legs at the chair corners.",
    });
  }

  if (hasFeature(options.intent, "armrests") && chair.armrestCount < 2) {
    findings.push({
      code: "missing_armrests",
      severity: "warning",
      message: "Reference intent expects armrests, but side armrest elements were not detected on both sides.",
      suggestedFix: "Add left and right top armrests plus supporting uprights or extend the frame to carry them.",
    });
  }

  if (hasFeature(options.intent, "side_slats") && chair.sideSlatCount < 2) {
    findings.push({
      code: "missing_side_slats",
      severity: "warning",
      message: "Reference intent expects open slatted sides, but too few side slats were detected.",
      suggestedFix: "Add thin vertical side slats between the front and rear side supports.",
    });
  }

  if (hasFeature(options.intent, "open_sides") && chair.openSides === false) {
    findings.push({
      code: "solid_side_structure",
      severity: "warning",
      message: "Reference intent expects open side structure, but the current side geometry reads as a solid wall.",
      suggestedFix: "Replace large side panels with separated slats or posts so the side silhouette stays open.",
    });
  }

  if (hasFeature(options.intent, "seat_cushion") && chair.seatCushionCount < 1) {
    findings.push({
      code: "missing_seat_cushion",
      severity: "warning",
      message: "Reference intent expects a separate seat cushion, but no seat cushion block was detected.",
      suggestedFix: "Add an inset seat cushion block above the frame seat base.",
    });
  }

  if (hasFeature(options.intent, "back_cushion") && chair.backCushionCount < 1) {
    findings.push({
      code: "missing_back_cushion",
      severity: "warning",
      message: "Reference intent expects a separate back cushion, but no back cushion block was detected.",
      suggestedFix: "Add a padded back block behind the seat and above the armrest line.",
    });
  }

  if (
    hasFeature(options.intent, "inset_seat") &&
    (chair.seatInsetX === null || chair.seatInsetZ === null || chair.seatInsetX < 1 || chair.seatInsetZ < 1)
  ) {
    findings.push({
      code: "seat_not_inset",
      severity: "warning",
      message: "Reference intent expects the seat to sit inside the frame, but the seat does not appear inset from the outer structure.",
      suggestedFix: "Shrink or reposition the seat and seat cushion so the outer frame remains visible around them.",
    });
  }

  if (hasFeature(options.intent, "visible_front_beam") && chair.frontBeamVisible !== true) {
    findings.push({
      code: "front_beam_hidden",
      severity: "warning",
      message: "Reference intent expects a visible lower front beam, but no front beam was detected under the seat.",
      suggestedFix: "Add a lower front beam between the front supports and keep it visible beneath the seat cushion.",
    });
  }

  if (hasFeature(options.intent, "back_above_armrests") && chair.backAboveArmrests !== true) {
    findings.push({
      code: "back_not_above_armrests",
      severity: "warning",
      message: "Reference intent expects the back element to rise above the armrests, but that relationship was not detected.",
      suggestedFix: "Raise the back or back cushion so it clearly extends above the armrest top plane.",
    });
  }

  return findings;
}

function critiqueBedStructure(options: {
  intent: ReferenceIntent;
  structure: ProjectStructureSummary;
}): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const bed = options.structure.bed;

  if (!bed) {
    findings.push({
      code: "bed_structure_unresolved",
      severity: "warning",
      message: "Project structure does not expose enough bed-like cues for semantic validation.",
      suggestedFix: "Use stable names for frame, mattress, headboard, drawers, and bedding so bed repair can target the asset.",
    });
    return findings;
  }

  if (bed.mattressCount < 1) {
    findings.push({
      code: "missing_mattress",
      severity: "warning",
      message: "Bed structure is missing a distinct mattress block.",
      suggestedFix: "Add a separate mattress volume inside the frame before repairing bedding.",
    });
  }

  if (hasFeature(options.intent, "footboard") && bed.footboardCount < 1) {
    findings.push({
      code: "missing_footboard",
      severity: "warning",
      message: "Reference intent expects a visible footboard, but no front bed board was detected.",
      suggestedFix: "Add a front footboard or front rail structure to close the bed silhouette.",
    });
  }

  if (hasFeature(options.intent, "underbed_drawers") && bed.drawerCount < 1) {
    findings.push({
      code: "missing_underbed_drawers",
      severity: "warning",
      message: "Reference intent expects underbed drawers, but no drawer-like elements were detected.",
      suggestedFix: "Add integrated drawer bodies and fronts inside the storage base.",
    });
  }

  if (hasFeature(options.intent, "pillows") && bed.pillowCount < 1) {
    findings.push({
      code: "missing_pillows",
      severity: "warning",
      message: "Reference intent expects pillows, but no pillow-like blocks were detected.",
      suggestedFix: "Add separate pillow volumes at the head of the bed.",
    });
  }

  if (hasFeature(options.intent, "duvet") && bed.beddingCount < 1) {
    findings.push({
      code: "missing_duvet",
      severity: "warning",
      message: "Reference intent expects a duvet or blanket layer, but no bedding cover was detected.",
      suggestedFix: "Add a top bedding layer over the mattress with visible edge thickness.",
    });
  }

  if (bed.leftSideClosureRatio !== null && bed.leftSideClosureRatio < 0.28) {
    findings.push({
      code: "left_side_open_gap",
      severity: "warning",
      message: `Left lower bed side closure is only ${Math.round(bed.leftSideClosureRatio * 100)}%, so the side reads as overly open.`,
      suggestedFix: "Add or thicken lower left side panels, rails, or drawer bodies so the storage base reads as a closed volume.",
    });
  }

  if (bed.rightSideClosureRatio !== null && bed.rightSideClosureRatio < 0.28) {
    findings.push({
      code: "right_side_open_gap",
      severity: "warning",
      message: `Right lower bed side closure is only ${Math.round(bed.rightSideClosureRatio * 100)}%, so the side reads as overly open.`,
      suggestedFix: "Add or thicken lower right side panels, rails, or drawer bodies so the storage base reads as a closed volume.",
    });
  }

  if (hasFeature(options.intent, "storage_base") && bed.storageBaseClosed !== true) {
    findings.push({
      code: "storage_base_open",
      severity: "warning",
      message: "Reference intent expects a closed storage base, but the current lower bed volume is still too open.",
      suggestedFix: "Close the side panels, reinforce the lower body, and add underside closure before finalizing drawers and bedding.",
    });
  }

  if (bed.undersideCoverageRatio !== null && bed.undersideCoverageRatio < 0.32) {
    findings.push({
      code: "open_bed_underside",
      severity: "warning",
      message: `Lower underside coverage is only ${Math.round(bed.undersideCoverageRatio * 100)}%, leaving large visible gaps beneath the bed.`,
      suggestedFix: "Add a lower base panel, plinth, or support deck so the underside no longer reads as open air.",
    });
  }

  if (bed.lowerBodyCoverageRatio !== null && bed.lowerBodyCoverageRatio < 0.32) {
    findings.push({
      code: "low_lower_body_coverage",
      severity: "warning",
      message: "The lower bed body occupies too little of its footprint, so the storage volume reads incomplete from side and front views.",
      suggestedFix: "Add continuous carcass panels or drawer bodies through the lower bed volume.",
    });
  }

  if (bed.drawerFrontOnlyCount > 0 && bed.drawerBodyCount === 0) {
    findings.push({
      code: "drawer_fronts_not_embedded",
      severity: "warning",
      message: "Drawer-like elements look like thin fronts without supporting bodies behind them.",
      suggestedFix: "Extend drawer fronts into real drawer bodies or surround them with a closed carcass.",
    });
  }

  if (bed.mattressSupportRatio !== null && bed.mattressSupportRatio < 0.45) {
    findings.push({
      code: "mattress_unsupported",
      severity: "warning",
      message: `Only ${Math.round(bed.mattressSupportRatio * 100)}% of the mattress footprint appears structurally supported.`,
      suggestedFix: "Add a support deck or rails directly beneath the mattress so upper bedding no longer feels floating.",
    });
  }

  if (bed.floatingCubeCount > 0) {
    findings.push({
      code: "floating_geometry_detected",
      severity: "warning",
      message: `${bed.floatingCubeCount} cube-like elements are not connected back to the grounded structure.`,
      suggestedFix: "Reconnect unsupported cubes to the main frame or add missing support geometry between them and the grounded bed base.",
    });
  }

  return findings;
}

export function critiqueProjectAgainstIntent(options: {
  contents: ProjectContents;
  managedScope?: string;
  managedOnly?: boolean;
  prompt?: string | null;
  spec: AssetSpec;
}): SemanticCritique {
  const intent = deriveReferenceIntent({
    prompt: options.prompt,
    spec: options.spec,
  });
  const structure = describeProjectStructure({
    contents: options.contents,
    managedScope: options.managedScope,
    managedOnly: options.managedOnly,
  });
  const findings: QualityFinding[] = [];
  const score = { value: 100 };

  if (intent.assetType === "chair") {
    for (const finding of critiqueChairStructure({ intent, structure })) {
      pushFinding(findings, score, finding);
    }
  }

  if (intent.assetType === "bed") {
    for (const finding of critiqueBedStructure({ intent, structure })) {
      pushFinding(findings, score, finding);
    }
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
    intent,
    structure,
    findings,
  };
}

export function mergeSemanticCritiqueIntoQualityReport(options: {
  qualityReport: QualityReport;
  semanticCritique: SemanticCritique;
}): QualityReport {
  const findings = [...options.qualityReport.findings, ...options.semanticCritique.findings];
  const totalPenalty = options.semanticCritique.findings.reduce((sum, finding) => {
    if (finding.severity === "error") {
      return sum + 25;
    }

    if (finding.severity === "warning") {
      return sum + 10;
    }

    return sum;
  }, 0);
  const score = clamp(options.qualityReport.score - totalPenalty, 0, 100);
  const status =
    findings.some((finding) => finding.severity === "error")
      ? "fail"
      : findings.some((finding) => finding.severity === "warning")
        ? "warn"
        : "pass";

  return {
    ...options.qualityReport,
    status,
    score,
    findings,
  };
}
