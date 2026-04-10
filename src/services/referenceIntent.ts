import type {
  AssetSpec,
  ReferenceFeatureCode,
  ReferenceIntent,
} from "../contracts/schemas.js";

function lowerText(value: string | undefined | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function uniqueFeatures(features: ReferenceFeatureCode[]): ReferenceFeatureCode[] {
  return [...new Set(features)];
}

function collectSourceText(options: {
  prompt?: string | null;
  spec: AssetSpec;
}): string {
  return [
    lowerText(options.prompt),
    lowerText(options.spec.assetType),
    lowerText(options.spec.style),
    ...options.spec.parts.flatMap((part) => [
      lowerText(part.name),
      lowerText(part.material),
      lowerText(part.notes),
    ]),
    ...options.spec.constraints.map((constraint) => lowerText(constraint)),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasCue(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue));
}

function deriveChairIntent(options: {
  text: string;
  spec: AssetSpec;
}): Pick<ReferenceIntent, "requiredFeatures" | "preferredFeatures" | "sourceHints" | "notes"> {
  const requiredFeatures: ReferenceFeatureCode[] = ["four_legs"];
  const preferredFeatures: ReferenceFeatureCode[] = [];
  const sourceHints: string[] = [];
  const notes: string[] = [];
  const pluralCushionCue = hasCue(options.text, [
    "cushions",
    "with cushions",
    "seat and back cushions",
    "double cushion",
    "two cushions",
  ]);

  const seatUsesFabric =
    options.spec.parts.some((part) => part.name === "seat" && part.material === "fabric") ||
    pluralCushionCue ||
    hasCue(options.text, ["seat cushion", "cushion", "upholstered", "fabric seat"]);
  const backUsesFabric =
    options.spec.parts.some((part) => part.name === "backrest" && part.material === "fabric") ||
    pluralCushionCue ||
    hasCue(options.text, [
      "back cushion",
      "backrest cushion",
      "upholstered back",
      "pillow back",
      "fabric back",
    ]);

  if (hasCue(options.text, ["armchair", "arm rest", "armrest", "armrests", "arms"])) {
    requiredFeatures.push("armrests");
    preferredFeatures.push("inset_seat");
    sourceHints.push("Prompt/spec cues indicate side arm supports.");
  }

  if (hasCue(options.text, ["slatted", "slat", "vertical slat", "side slat", "open slatted"])) {
    requiredFeatures.push("side_slats", "open_sides");
    sourceHints.push("Reference cues indicate an open slatted side structure.");
  }

  if (seatUsesFabric) {
    requiredFeatures.push("seat_cushion");
    preferredFeatures.push("inset_seat");
    sourceHints.push("Seat material/cues indicate a separate cushion block.");
  }

  if (backUsesFabric) {
    requiredFeatures.push("back_cushion");
    preferredFeatures.push("back_above_armrests");
    sourceHints.push("Back material/cues indicate a separate back cushion.");
  }

  if (
    hasCue(options.text, [
      "front beam",
      "visible front beam",
      "front lower beam",
      "open frame",
      "wooden frame",
      "frame visible below the seat",
    ]) ||
    (requiredFeatures.includes("armrests") && requiredFeatures.includes("side_slats"))
  ) {
    requiredFeatures.push("visible_front_beam");
    notes.push("Chair frame should stay visually open with a visible lower front beam.");
  }

  if (
    hasCue(options.text, ["inside the frame", "inset seat", "inside frame"]) ||
    requiredFeatures.includes("armrests") ||
    requiredFeatures.includes("side_slats")
  ) {
    requiredFeatures.push("inset_seat");
  }

  if (
    hasCue(options.text, ["above the armrests", "rise above the armrests", "tall back"]) ||
    (requiredFeatures.includes("armrests") && requiredFeatures.includes("back_cushion"))
  ) {
    requiredFeatures.push("back_above_armrests");
  }

  return {
    requiredFeatures: uniqueFeatures(requiredFeatures),
    preferredFeatures: uniqueFeatures(preferredFeatures).filter(
      (feature) => !requiredFeatures.includes(feature),
    ),
    sourceHints,
    notes,
  };
}

function deriveBedIntent(options: {
  text: string;
  spec: AssetSpec;
}): Pick<ReferenceIntent, "requiredFeatures" | "preferredFeatures" | "sourceHints" | "notes"> {
  const requiredFeatures: ReferenceFeatureCode[] = [];
  const preferredFeatures: ReferenceFeatureCode[] = [];
  const sourceHints: string[] = [];
  const notes: string[] = [];

  if (hasCue(options.text, ["drawer", "drawers", "storage bed", "underbed storage", "storage base"])) {
    requiredFeatures.push("storage_base", "underbed_drawers");
    sourceHints.push("Prompt/spec cues indicate a closed storage base with integrated drawers.");
  }

  if (hasCue(options.text, ["footboard", "front board", "front rail slats"])) {
    requiredFeatures.push("footboard");
    sourceHints.push("Prompt/spec cues indicate a visible footboard structure.");
  }

  if (hasCue(options.text, ["pillow", "pillows"])) {
    preferredFeatures.push("pillows");
  }

  if (hasCue(options.text, ["duvet", "comforter", "blanket", "quilt", "bedding"])) {
    preferredFeatures.push("duvet");
  }

  if (hasCue(options.text, ["slatted headboard", "slatted bed", "spindle headboard"])) {
    notes.push("Headboard should read as an open slatted frame rather than a solid slab.");
  }

  return {
    requiredFeatures: uniqueFeatures(requiredFeatures),
    preferredFeatures: uniqueFeatures(preferredFeatures).filter(
      (feature) => !requiredFeatures.includes(feature),
    ),
    sourceHints,
    notes,
  };
}

export function deriveReferenceIntent(options: {
  prompt?: string | null;
  spec: AssetSpec;
}): ReferenceIntent {
  const text = collectSourceText(options);

  if (options.spec.assetType === "chair") {
    return {
      assetType: options.spec.assetType,
      ...deriveChairIntent({
        text,
        spec: options.spec,
      }),
    };
  }

  if (options.spec.assetType === "bed") {
    return {
      assetType: options.spec.assetType,
      ...deriveBedIntent({
        text,
        spec: options.spec,
      }),
    };
  }

  return {
    assetType: options.spec.assetType,
    requiredFeatures: [],
    preferredFeatures: [],
    sourceHints: [],
    notes: [],
  };
}
