import type {
  AssetPart,
  AssetSpec,
  BuildPlan,
  MaterialSlot,
  PlannedCube,
} from "../contracts/schemas.js";

type PromptDirectives = {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  roundTop: boolean;
  hasCushion: boolean;
  shelfCount: number;
  coffeeTable: boolean;
  tallHeadboard: boolean;
};

const MATERIAL_OFFSETS: Record<string, [number, number]> = {
  primary: [0, 0],
  secondary: [128, 0],
  accent: [0, 128],
  neutral: [128, 128],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundUnit(value: number): number {
  return Math.max(1, Math.round(value));
}

function scaleVector(
  vector: readonly [number, number, number],
  directives: PromptDirectives,
): [number, number, number] {
  return [
    roundUnit(vector[0] * directives.scaleX),
    roundUnit(vector[1] * directives.scaleY),
    roundUnit(vector[2] * directives.scaleZ),
  ];
}

function detectScale(prompt: string, keyword: string, amount: number): number {
  return prompt.includes(keyword) ? amount : 1;
}

function inferShelfCount(prompt: string): number {
  if (prompt.includes("four shelf") || prompt.includes("4 shelf")) {
    return 4;
  }

  if (prompt.includes("three shelf") || prompt.includes("3 shelf")) {
    return 3;
  }

  if (prompt.includes("two shelf") || prompt.includes("2 shelf")) {
    return 2;
  }

  return 3;
}

function parsePromptDirectives(prompt: string): PromptDirectives {
  const lower = prompt.toLowerCase();

  const sizeScale =
    detectScale(lower, "small", 0.85) *
    detectScale(lower, "large", 1.2) *
    detectScale(lower, "big", 1.2);

  return {
    scaleX:
      sizeScale *
      detectScale(lower, "wide", 1.2) *
      detectScale(lower, "narrow", 0.85) *
      detectScale(lower, "slim", 0.85),
    scaleY:
      sizeScale *
      detectScale(lower, "tall", 1.2) *
      detectScale(lower, "short", 0.85) *
      detectScale(lower, "low", 0.85),
    scaleZ:
      sizeScale *
      detectScale(lower, "deep", 1.15) *
      detectScale(lower, "long", 1.2) *
      detectScale(lower, "shallow", 0.85),
    roundTop: lower.includes("round") || lower.includes("circular"),
    hasCushion:
      lower.includes("cushion") ||
      lower.includes("pillow") ||
      lower.includes("upholstered"),
    shelfCount: inferShelfCount(lower),
    coffeeTable: lower.includes("coffee table"),
    tallHeadboard: lower.includes("tall headboard"),
  };
}

function sanitizeProjectName(prompt: string, fallback: string): string {
  const cleaned = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return cleaned || fallback;
}

function makeSlot(slotId: string, label: string, material: string, colorHint: string): MaterialSlot {
  return {
    slotId,
    label,
    material,
    uvOffset: MATERIAL_OFFSETS[slotId] ?? [128, 128],
    colorHint,
  };
}

function pickMaterialSlots(spec: AssetSpec): MaterialSlot[] {
  const primaryMaterial = spec.materials[0] ?? "wood";
  const secondaryMaterial = spec.materials[1] ?? primaryMaterial;
  const accentColor = spec.palette[0] ?? "natural";

  return [
    makeSlot("primary", "Primary", primaryMaterial, accentColor),
    makeSlot("secondary", "Secondary", secondaryMaterial, accentColor),
    makeSlot("accent", "Accent", accentColor, accentColor),
    makeSlot("neutral", "Neutral", "neutral", "gray"),
  ];
}

function cubeFromBounds(
  name: string,
  from: [number, number, number],
  to: [number, number, number],
  materialSlot: string,
  notes?: string,
): PlannedCube {
  return {
    name,
    from,
    to,
    origin: [
      roundUnit((from[0] + to[0]) / 2),
      roundUnit((from[1] + to[1]) / 2),
      roundUnit((from[2] + to[2]) / 2),
    ],
    uvOffset: MATERIAL_OFFSETS[materialSlot] ?? MATERIAL_OFFSETS.primary,
    materialSlot,
    notes,
  };
}

function centeredBounds(
  width: number,
  height: number,
  depth: number,
  centerX: number,
  baseY: number,
  centerZ: number,
): { from: [number, number, number]; to: [number, number, number] } {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return {
    from: [roundUnit(centerX - halfWidth), roundUnit(baseY), roundUnit(centerZ - halfDepth)],
    to: [roundUnit(centerX + halfWidth), roundUnit(baseY + height), roundUnit(centerZ + halfDepth)],
  };
}

function findPart(spec: AssetSpec, name: string): AssetPart | undefined {
  return spec.parts.find((part) => part.name === name);
}

function getMaterialSlotForPart(part: AssetPart | undefined, spec: AssetSpec): string {
  const material = part?.material ?? spec.materials[0] ?? "wood";

  if (material === spec.materials[0]) {
    return "primary";
  }

  if (material === spec.materials[1]) {
    return "secondary";
  }

  if (spec.palette.includes(material)) {
    return "accent";
  }

  if (material === "metal" || material === "glass" || material === "stone" || material === "fabric") {
    return "secondary";
  }

  return "primary";
}

function planChair(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const seat = findPart(spec, "seat");
  const backrest = findPart(spec, "backrest");
  const legs = findPart(spec, "legs");
  const width = roundUnit(spec.estimatedSize[0]);
  const height = roundUnit(spec.estimatedSize[1]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const seatHeight = roundUnit((seat?.size[1] ?? 2) * Math.max(0.9, directives.scaleY));
  const backrestHeight = roundUnit((backrest?.size[1] ?? 10) * Math.max(0.9, directives.scaleY));
  const legHeight = Math.max(4, height - seatHeight - backrestHeight);
  const centerX = 8;
  const centerZ = 8;
  const cubes: PlannedCube[] = [];
  const seatBounds = centeredBounds(width - 2, seatHeight, depth - 2, centerX, legHeight, centerZ);

  cubes.push(
    cubeFromBounds(
      "seat",
      seatBounds.from,
      seatBounds.to,
      getMaterialSlotForPart(seat, spec),
      "Main seating slab.",
    ),
  );

  const backThickness = clamp(roundUnit((backrest?.size[2] ?? 2) * directives.scaleZ), 2, 4);
  cubes.push(
    cubeFromBounds(
      "backrest",
      [seatBounds.from[0], seatBounds.to[1] - 1, roundUnit(centerZ + depth / 2 - backThickness)],
      [seatBounds.to[0], height, roundUnit(centerZ + depth / 2)],
      getMaterialSlotForPart(backrest, spec),
      "Rear panel aligned to the back edge.",
    ),
  );

  const legThickness = clamp(roundUnit((legs?.size[0] ?? 2) * directives.scaleX), 1, 3);
  const halfWidth = roundUnit(width / 2) - legThickness;
  const halfDepth = roundUnit(depth / 2) - legThickness;
  const legSlot = getMaterialSlotForPart(legs, spec);
  const legPositions: Array<[number, number]> = [
    [8 - halfWidth, 8 - halfDepth],
    [8 + halfWidth - legThickness, 8 - halfDepth],
    [8 - halfWidth, 8 + halfDepth - legThickness],
    [8 + halfWidth - legThickness, 8 + halfDepth - legThickness],
  ];

  legPositions.forEach(([x, z], index) => {
    cubes.push(
      cubeFromBounds(
        `leg_${index + 1}`,
        [x, 0, z],
        [x + legThickness, legHeight, z + legThickness],
        legSlot,
        "Mirrored support leg.",
      ),
    );
  });

  if (directives.hasCushion) {
    cubes.push(
      cubeFromBounds(
        "seat_cushion",
        [seatBounds.from[0] + 1, seatBounds.to[1] - 1, seatBounds.from[2] + 1],
        [seatBounds.to[0] - 1, seatBounds.to[1] + 2, seatBounds.to[2] - 1],
        "secondary",
        "Raised cushion block for upholstered prompts.",
      ),
    );
  }

  return cubes;
}

function planTable(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const top = findPart(spec, "top");
  const legs = findPart(spec, "legs");
  const width = roundUnit(spec.estimatedSize[0]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const targetHeight = directives.coffeeTable
    ? roundUnit(spec.estimatedSize[1] * 0.7)
    : roundUnit(spec.estimatedSize[1]);
  const topThickness = clamp(top?.size[1] ?? 2, 2, 4);
  const legHeight = Math.max(5, targetHeight - topThickness);
  const cubes: PlannedCube[] = [];
  const topSlot = getMaterialSlotForPart(top, spec);

  if (directives.roundTop) {
    cubes.push(
      cubeFromBounds(
        "top_core",
        [2, legHeight, 2],
        [14, legHeight + topThickness, 14],
        topSlot,
        "Core slab for the round tabletop silhouette.",
      ),
    );
    cubes.push(cubeFromBounds("top_x", [0, legHeight, 4], [16, legHeight + topThickness, 12], topSlot));
    cubes.push(cubeFromBounds("top_z", [4, legHeight, 0], [12, legHeight + topThickness, 16], topSlot));
  } else {
    cubes.push(
      cubeFromBounds(
        "table_top",
        [roundUnit(8 - width / 2), legHeight, roundUnit(8 - depth / 2)],
        [roundUnit(8 + width / 2), legHeight + topThickness, roundUnit(8 + depth / 2)],
        topSlot,
        "Primary tabletop slab.",
      ),
    );
  }

  const legThickness = clamp(roundUnit((legs?.size[0] ?? 2) * directives.scaleX), 1, 3);
  const halfWidth = roundUnit(width / 2) - legThickness;
  const halfDepth = roundUnit(depth / 2) - legThickness;
  const legSlot = getMaterialSlotForPart(legs, spec);
  const legPositions: Array<[number, number]> = [
    [8 - halfWidth, 8 - halfDepth],
    [8 + halfWidth - legThickness, 8 - halfDepth],
    [8 - halfWidth, 8 + halfDepth - legThickness],
    [8 + halfWidth - legThickness, 8 + halfDepth - legThickness],
  ];

  legPositions.forEach(([x, z], index) => {
    cubes.push(cubeFromBounds(`table_leg_${index + 1}`, [x, 0, z], [x + legThickness, legHeight, z + legThickness], legSlot));
  });

  return cubes;
}

function planLamp(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const base = findPart(spec, "base");
  const stem = findPart(spec, "stem");
  const shade = findPart(spec, "shade");
  const totalHeight = roundUnit(spec.estimatedSize[1] * directives.scaleY);
  const baseHeight = clamp(base?.size[1] ?? 2, 2, 4);
  const stemHeight = clamp(roundUnit((stem?.size[1] ?? 12) * directives.scaleY), 8, 16);
  const shadeHeight = Math.max(4, totalHeight - baseHeight - stemHeight);
  const cubes: PlannedCube[] = [];

  cubes.push(
    cubeFromBounds("lamp_base", [5, 0, 5], [11, baseHeight, 11], getMaterialSlotForPart(base, spec)),
  );
  cubes.push(
    cubeFromBounds("lamp_stem", [7, baseHeight, 7], [9, baseHeight + stemHeight, 9], getMaterialSlotForPart(stem, spec)),
  );

  if (directives.roundTop) {
    cubes.push(
      cubeFromBounds(
        "lamp_shade_mid",
        [3, baseHeight + stemHeight, 3],
        [13, baseHeight + stemHeight + shadeHeight, 13],
        getMaterialSlotForPart(shade, spec),
      ),
    );
    cubes.push(
      cubeFromBounds(
        "lamp_shade_upper",
        [4, baseHeight + stemHeight + 1, 4],
        [12, baseHeight + stemHeight + shadeHeight - 1, 12],
        getMaterialSlotForPart(shade, spec),
      ),
    );
  } else {
    cubes.push(
      cubeFromBounds(
        "lamp_shade",
        [3, baseHeight + stemHeight, 3],
        [13, baseHeight + stemHeight + shadeHeight, 13],
        getMaterialSlotForPart(shade, spec),
      ),
    );
  }

  return cubes;
}

function planShelf(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const sidePanels = findPart(spec, "side_panels");
  const shelves = findPart(spec, "shelves");
  const width = roundUnit(spec.estimatedSize[0]);
  const height = roundUnit(spec.estimatedSize[1]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const sideThickness = clamp(sidePanels?.size[0] ?? 2, 1, 3);
  const shelfThickness = clamp(shelves?.size[1] ?? 2, 1, 3);
  const cubes: PlannedCube[] = [];
  const sideSlot = getMaterialSlotForPart(sidePanels, spec);
  const shelfSlot = getMaterialSlotForPart(shelves, spec);

  cubes.push(cubeFromBounds("side_left", [roundUnit(8 - width / 2), 0, roundUnit(8 - depth / 2)], [roundUnit(8 - width / 2) + sideThickness, height, roundUnit(8 + depth / 2)], sideSlot));
  cubes.push(cubeFromBounds("side_right", [roundUnit(8 + width / 2) - sideThickness, 0, roundUnit(8 - depth / 2)], [roundUnit(8 + width / 2), height, roundUnit(8 + depth / 2)], sideSlot));

  const usableWidthFrom = roundUnit(8 - width / 2) + sideThickness;
  const usableWidthTo = roundUnit(8 + width / 2) - sideThickness;
  const shelfCount = clamp(directives.shelfCount, 2, 4);
  const verticalGap = roundUnit((height - shelfThickness) / shelfCount);

  for (let index = 0; index < shelfCount; index += 1) {
    const baseY = index * verticalGap;
    cubes.push(
      cubeFromBounds(
        `shelf_${index + 1}`,
        [usableWidthFrom, baseY, roundUnit(8 - depth / 2)],
        [usableWidthTo, baseY + shelfThickness, roundUnit(8 + depth / 2)],
        shelfSlot,
      ),
    );
  }

  return cubes;
}

function planCabinet(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const body = findPart(spec, "body");
  const doors = findPart(spec, "doors");
  const handles = findPart(spec, "handles");
  const width = roundUnit(spec.estimatedSize[0]);
  const height = roundUnit(spec.estimatedSize[1]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const cubes: PlannedCube[] = [];
  const bodyFrom = [roundUnit(8 - width / 2), 0, roundUnit(8 - depth / 2)] as [number, number, number];
  const bodyTo = [roundUnit(8 + width / 2), height, roundUnit(8 + depth / 2)] as [number, number, number];

  cubes.push(cubeFromBounds("cabinet_body", bodyFrom, bodyTo, getMaterialSlotForPart(body, spec)));

  const doorThickness = 1;
  const frontZ = bodyTo[2];
  const halfDoorWidth = Math.max(3, roundUnit(width / 2) - 1);

  cubes.push(
    cubeFromBounds(
      "door_left",
      [bodyFrom[0] + 1, 2, frontZ - doorThickness],
      [bodyFrom[0] + halfDoorWidth, height - 2, frontZ],
      getMaterialSlotForPart(doors, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "door_right",
      [bodyTo[0] - halfDoorWidth, 2, frontZ - doorThickness],
      [bodyTo[0] - 1, height - 2, frontZ],
      getMaterialSlotForPart(doors, spec),
    ),
  );

  cubes.push(
    cubeFromBounds(
      "handle_left",
      [roundUnit(8 - 1), roundUnit(height / 2) - 2, frontZ],
      [roundUnit(8), roundUnit(height / 2) + 2, frontZ + 1],
      getMaterialSlotForPart(handles, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "handle_right",
      [roundUnit(8), roundUnit(height / 2) - 2, frontZ],
      [roundUnit(8 + 1), roundUnit(height / 2) + 2, frontZ + 1],
      getMaterialSlotForPart(handles, spec),
    ),
  );

  return cubes;
}

function planBed(spec: AssetSpec, directives: PromptDirectives): PlannedCube[] {
  const frame = findPart(spec, "frame");
  const mattress = findPart(spec, "mattress");
  const headboard = findPart(spec, "headboard");
  const width = roundUnit(spec.estimatedSize[0]);
  const height = roundUnit(spec.estimatedSize[1]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const frameHeight = clamp(frame?.size[1] ?? 6, 4, 8);
  const mattressHeight = clamp(mattress?.size[1] ?? 4, 3, 6);
  const headboardHeight = directives.tallHeadboard ? clamp(height, 10, 18) : clamp(headboard?.size[1] ?? 8, 6, 12);
  const cubes: PlannedCube[] = [];

  cubes.push(
    cubeFromBounds(
      "bed_frame",
      [roundUnit(8 - width / 2), 0, roundUnit(8 - depth / 2)],
      [roundUnit(8 + width / 2), frameHeight, roundUnit(8 + depth / 2)],
      getMaterialSlotForPart(frame, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "mattress",
      [roundUnit(8 - width / 2) + 1, frameHeight, roundUnit(8 - depth / 2) + 1],
      [roundUnit(8 + width / 2) - 1, frameHeight + mattressHeight, roundUnit(8 + depth / 2) - 1],
      getMaterialSlotForPart(mattress, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "headboard",
      [roundUnit(8 - width / 2), frameHeight, roundUnit(8 + depth / 2) - 2],
      [roundUnit(8 + width / 2), frameHeight + headboardHeight, roundUnit(8 + depth / 2)],
      getMaterialSlotForPart(headboard, spec),
    ),
  );

  return cubes;
}

function planGeneric(spec: AssetSpec): PlannedCube[] {
  const width = roundUnit(spec.estimatedSize[0]);
  const height = roundUnit(spec.estimatedSize[1]);
  const depth = roundUnit(spec.estimatedSize[2]);
  const part = spec.parts[0];

  return [
    cubeFromBounds(
      part?.name ?? "main_body",
      [roundUnit(8 - width / 2), 0, roundUnit(8 - depth / 2)],
      [roundUnit(8 + width / 2), height, roundUnit(8 + depth / 2)],
      getMaterialSlotForPart(part, spec),
      "Fallback silhouette cube.",
    ),
  ];
}

function selectPlanner(spec: AssetSpec): (spec: AssetSpec, directives: PromptDirectives) => PlannedCube[] {
  switch (spec.assetType) {
    case "chair":
      return planChair;
    case "table":
      return planTable;
    case "lamp":
      return planLamp;
    case "shelf":
      return planShelf;
    case "cabinet":
      return planCabinet;
    case "bed":
      return planBed;
    default:
      return (incomingSpec) => planGeneric(incomingSpec);
  }
}

export function planBuildFromAssetSpec(options: {
  prompt: string;
  spec: AssetSpec;
  projectName?: string;
  formatId: string;
  textureWidth: number;
  textureHeight: number;
  boxUv: boolean;
}): BuildPlan {
  const directives = parsePromptDirectives(options.prompt);
  const scaledSize = scaleVector(options.spec.estimatedSize, directives);
  const spec: AssetSpec = {
    ...options.spec,
    estimatedSize: scaledSize,
  };
  const planner = selectPlanner(spec);
  const cubes = planner(spec, directives);
  const materialSlots = pickMaterialSlots(spec);
  const projectName = options.projectName ?? sanitizeProjectName(options.prompt, spec.assetType);

  return {
    projectName,
    formatId: options.formatId,
    textureWidth: options.textureWidth,
    textureHeight: options.textureHeight,
    boxUv: options.boxUv,
    symmetry: spec.symmetry,
    estimatedSize: spec.estimatedSize,
    materialSlots,
    cubes,
    notes: [
      "Generated by the deterministic text planner.",
      "Coordinates are centered around the Blockbench scene origin at x=8, z=8.",
      "Material slots are mapped onto a procedural 2x2 atlas.",
    ],
  };
}
