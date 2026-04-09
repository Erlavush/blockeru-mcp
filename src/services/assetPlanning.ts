import type {
  AssetPart,
  AssetSpec,
  BuildPlan,
  CubeFaceLayout,
  CubeFacesLayout,
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
  drawerCount: number;
  coffeeTable: boolean;
  tallHeadboard: boolean;
};

type CoordinateFrame = {
  centerX: number;
  centerZ: number;
  shiftX: number;
  shiftZ: number;
};

export type RepairPlanningHints = {
  compactMaterialSlots: boolean;
  shareRepeatedUvs: boolean;
  recenterScene: boolean;
  regroundAsset: boolean;
};

type MaterialSlotId = "primary" | "secondary" | "accent" | "neutral";

type MaterialSlotPlacement = {
  uvOffset: [number, number];
  uvSize: [number, number];
};

const MATERIAL_SLOT_GRID: Record<MaterialSlotId, [number, number]> = {
  primary: [0, 0],
  secondary: [1, 0],
  accent: [0, 1],
  neutral: [1, 1],
};

const FACE_DIRECTIONS = ["north", "south", "east", "west", "up", "down"] as const;
const MATERIAL_SLOT_ORDER: MaterialSlotId[] = ["primary", "secondary", "accent", "neutral"];
const DEFAULT_REPAIR_HINTS: RepairPlanningHints = {
  compactMaterialSlots: false,
  shareRepeatedUvs: false,
  recenterScene: false,
  regroundAsset: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundSize(value: number): number {
  return Math.max(1, Math.round(value));
}

function roundCoordinate(value: number): number {
  return Math.round(value);
}

function scaleVector(
  vector: readonly [number, number, number],
  directives: PromptDirectives,
): [number, number, number] {
  return [
    roundSize(vector[0] * directives.scaleX),
    roundSize(vector[1] * directives.scaleY),
    roundSize(vector[2] * directives.scaleZ),
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

function inferDrawerCount(prompt: string): number {
  if (
    prompt.includes("single drawer") ||
    prompt.includes("one drawer") ||
    prompt.includes("1 drawer")
  ) {
    return 1;
  }

  if (
    prompt.includes("two drawer") ||
    prompt.includes("2 drawer") ||
    prompt.includes("double drawer")
  ) {
    return 2;
  }

  if (
    prompt.includes("three drawer") ||
    prompt.includes("3 drawer") ||
    prompt.includes("triple drawer")
  ) {
    return 3;
  }

  if (prompt.includes("four drawer") || prompt.includes("4 drawer")) {
    return 4;
  }

  if (prompt.includes("drawer")) {
    return prompt.includes("nightstand") || prompt.includes("bedside") ? 2 : 3;
  }

  return 0;
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
    drawerCount: inferDrawerCount(lower),
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

function normalizeMaterialSlotId(value: string | undefined): MaterialSlotId {
  switch (value) {
    case "secondary":
    case "accent":
    case "neutral":
      return value;
    default:
      return "primary";
  }
}

function getDefaultSlotPlacement(
  slotId: MaterialSlotId,
  textureWidth: number,
  textureHeight: number,
): MaterialSlotPlacement {
  const gridPosition = MATERIAL_SLOT_GRID[slotId];
  const tileWidth = Math.floor(textureWidth / 2);
  const tileHeight = Math.floor(textureHeight / 2);

  return {
    uvOffset: [gridPosition[0] * tileWidth, gridPosition[1] * tileHeight],
    uvSize: [tileWidth, tileHeight],
  };
}

function getCompactSlotPlacements(
  slotIds: MaterialSlotId[],
  textureWidth: number,
  textureHeight: number,
): Map<MaterialSlotId, MaterialSlotPlacement> {
  const placements = new Map<MaterialSlotId, MaterialSlotPlacement>();

  if (slotIds.length <= 1) {
    placements.set(slotIds[0] ?? "primary", {
      uvOffset: [0, 0],
      uvSize: [textureWidth, textureHeight],
    });
    return placements;
  }

  if (slotIds.length === 2) {
    const tileWidth = Math.floor(textureWidth / 2);

    slotIds.forEach((slotId, index) => {
      placements.set(slotId, {
        uvOffset: [index * tileWidth, 0],
        uvSize: [tileWidth, textureHeight],
      });
    });

    return placements;
  }

  const tileWidth = Math.floor(textureWidth / 2);
  const tileHeight = Math.floor(textureHeight / 2);
  const positions: Array<[number, number]> = [
    [0, 0],
    [tileWidth, 0],
    [0, tileHeight],
    [tileWidth, tileHeight],
  ];

  slotIds.forEach((slotId, index) => {
    const position = positions[index] ?? [0, 0];
    placements.set(slotId, {
      uvOffset: position,
      uvSize: [tileWidth, tileHeight],
    });
  });

  return placements;
}

function makeSlot(
  slotId: MaterialSlotId,
  label: string,
  material: string,
  colorHint: string,
  placement: MaterialSlotPlacement,
): MaterialSlot {
  return {
    slotId,
    label,
    material,
    uvOffset: placement.uvOffset,
    uvSize: placement.uvSize,
    colorHint,
  };
}

function pickMaterialSlots(
  spec: AssetSpec,
  textureWidth: number,
  textureHeight: number,
  usedSlotIds: MaterialSlotId[],
  compactMaterialSlots: boolean,
): MaterialSlot[] {
  const primaryMaterial = spec.materials[0] ?? "wood";
  const secondaryMaterial = spec.materials[1] ?? primaryMaterial;
  const accentColor = spec.palette[0] ?? "natural";
  const resolvedSlotIds =
    usedSlotIds.length > 0 ? usedSlotIds : (["primary"] satisfies MaterialSlotId[]);
  const placements = compactMaterialSlots
    ? getCompactSlotPlacements(resolvedSlotIds, textureWidth, textureHeight)
    : new Map(
        MATERIAL_SLOT_ORDER.map((slotId) => [
          slotId,
          getDefaultSlotPlacement(slotId, textureWidth, textureHeight),
        ]),
      );

  return resolvedSlotIds.map((slotId) => {
    const placement =
      placements.get(slotId) ?? getDefaultSlotPlacement(slotId, textureWidth, textureHeight);

    switch (slotId) {
      case "secondary":
        return makeSlot(slotId, "Secondary", secondaryMaterial, accentColor, placement);
      case "accent":
        return makeSlot(slotId, "Accent", accentColor, accentColor, placement);
      case "neutral":
        return makeSlot(slotId, "Neutral", "neutral", "gray", placement);
      default:
        return makeSlot(slotId, "Primary", primaryMaterial, accentColor, placement);
    }
  });
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
      roundCoordinate((from[0] + to[0]) / 2),
      roundCoordinate((from[1] + to[1]) / 2),
      roundCoordinate((from[2] + to[2]) / 2),
    ],
    materialSlot,
    notes,
  };
}

function getCubeDimensions(cube: PlannedCube): {
  width: number;
  height: number;
  depth: number;
} {
  return {
    width: Math.max(1, roundSize(Math.abs(cube.to[0] - cube.from[0]))),
    height: Math.max(1, roundSize(Math.abs(cube.to[1] - cube.from[1]))),
    depth: Math.max(1, roundSize(Math.abs(cube.to[2] - cube.from[2]))),
  };
}

function toFaceRect(
  x: number,
  y: number,
  width: number,
  height: number,
): CubeFaceLayout {
  return {
    uv: [x, y, x + width, y + height],
  };
}

function tryPackScaledFaces(options: {
  baseRects: Array<{ face: (typeof FACE_DIRECTIONS)[number]; width: number; height: number }>;
  tileWidth: number;
  tileHeight: number;
  scale: number;
  padding: number;
  offset: readonly [number, number];
}): CubeFacesLayout | null {
  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowHeight = 0;
  const layout: Partial<Record<(typeof FACE_DIRECTIONS)[number], CubeFaceLayout>> = {};

  for (const rect of options.baseRects) {
    const width = Math.max(2, rect.width * options.scale);
    const height = Math.max(2, rect.height * options.scale);

    if (cursorX + width + options.padding > options.tileWidth) {
      cursorX = options.padding;
      cursorY += rowHeight + options.padding;
      rowHeight = 0;
    }

    if (cursorY + height + options.padding > options.tileHeight) {
      return null;
    }

    layout[rect.face] = toFaceRect(
      options.offset[0] + cursorX,
      options.offset[1] + cursorY,
      width,
      height,
    );

    cursorX += width + options.padding;
    rowHeight = Math.max(rowHeight, height);
  }

  return layout as CubeFacesLayout;
}

function getBaseFaceRects(cube: PlannedCube) {
  const { width, height, depth } = getCubeDimensions(cube);

  return [
    { face: "north" as const, width, height },
    { face: "south" as const, width, height },
    { face: "east" as const, width: depth, height },
    { face: "west" as const, width: depth, height },
    { face: "up" as const, width, height: depth },
    { face: "down" as const, width, height: depth },
  ].sort((left, right) => right.height * right.width - left.height * left.width);
}

function buildStandaloneFaceUvs(
  cube: PlannedCube,
  slot: MaterialSlot,
): CubeFacesLayout {
  const { width, height, depth } = getCubeDimensions(cube);
  const baseRects = getBaseFaceRects(cube);
  const tileWidth = Math.max(8, slot.uvSize[0]);
  const tileHeight = Math.max(8, slot.uvSize[1]);
  const padding = Math.max(2, Math.floor(Math.min(tileWidth, tileHeight) / 32));
  const maxBaseWidth = Math.max(...baseRects.map((rect) => rect.width));
  const maxBaseHeight = Math.max(...baseRects.map((rect) => rect.height));
  const maxScale = Math.max(
    1,
    Math.floor(
      Math.min(
        (tileWidth - padding * 4) / Math.max(1, maxBaseWidth),
        (tileHeight - padding * 4) / Math.max(1, maxBaseHeight),
      ),
    ),
  );

  for (let scale = maxScale; scale >= 1; scale -= 1) {
    const packed = tryPackScaledFaces({
      baseRects,
      tileWidth,
      tileHeight,
      scale,
      padding,
      offset: slot.uvOffset,
    });

    if (packed) {
      return packed;
    }
  }

  return {
    north: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, width), Math.max(2, height)),
    south: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, width), Math.max(2, height)),
    east: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, depth), Math.max(2, height)),
    west: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, depth), Math.max(2, height)),
    up: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, width), Math.max(2, depth)),
    down: toFaceRect(slot.uvOffset[0], slot.uvOffset[1], Math.max(2, width), Math.max(2, depth)),
  };
}

function tryPackSlotFaces(options: {
  cubes: PlannedCube[];
  slot: MaterialSlot;
  scale: number;
  padding: number;
}): Map<number, CubeFacesLayout> | null {
  const tileWidth = Math.max(8, options.slot.uvSize[0]);
  const tileHeight = Math.max(8, options.slot.uvSize[1]);
  const rects = options.cubes
    .flatMap((cube, cubeIndex) =>
      getBaseFaceRects(cube).map((rect) => ({
        cubeIndex,
        face: rect.face,
        width: rect.width,
        height: rect.height,
      })),
    )
    .sort((left, right) => right.height * right.width - left.height * left.width);
  let cursorX = options.padding;
  let cursorY = options.padding;
  let rowHeight = 0;
  const layouts = new Map<number, CubeFacesLayout>();

  for (const rect of rects) {
    const width = Math.max(2, rect.width * options.scale);
    const height = Math.max(2, rect.height * options.scale);

    if (cursorX + width + options.padding > tileWidth) {
      cursorX = options.padding;
      cursorY += rowHeight + options.padding;
      rowHeight = 0;
    }

    if (cursorY + height + options.padding > tileHeight) {
      return null;
    }

    const existing = layouts.get(rect.cubeIndex) ?? {};
    existing[rect.face] = toFaceRect(
      options.slot.uvOffset[0] + cursorX,
      options.slot.uvOffset[1] + cursorY,
      width,
      height,
    );
    layouts.set(rect.cubeIndex, existing);

    cursorX += width + options.padding;
    rowHeight = Math.max(rowHeight, height);
  }

  return layouts;
}

function buildPackedFacesForSlot(options: {
  cubes: PlannedCube[];
  slot: MaterialSlot;
  shareRepeatedUvs: boolean;
}): Map<number, CubeFacesLayout> {
  const tileWidth = Math.max(8, options.slot.uvSize[0]);
  const tileHeight = Math.max(8, options.slot.uvSize[1]);
  const padding = Math.max(2, Math.floor(Math.min(tileWidth, tileHeight) / 32));
  const groupedCubes = new Map<string, number[]>();

  options.cubes.forEach((cube, cubeIndex) => {
    const dimensions = getCubeDimensions(cube);
    const signature = options.shareRepeatedUvs
      ? `${dimensions.width}x${dimensions.height}x${dimensions.depth}`
      : `${cubeIndex}`;
    const bucket = groupedCubes.get(signature) ?? [];
    bucket.push(cubeIndex);
    groupedCubes.set(signature, bucket);
  });

  const representativeEntries = [...groupedCubes.values()].map((indices) => indices[0]);
  const representativeCubes = representativeEntries.map((cubeIndex) => options.cubes[cubeIndex]);
  const allBaseRects = representativeCubes.flatMap((cube) => getBaseFaceRects(cube));
  const totalBaseArea = allBaseRects.reduce(
    (sum, rect) => sum + Math.max(1, rect.width) * Math.max(1, rect.height),
    0,
  );
  const maxBaseWidth = Math.max(1, ...allBaseRects.map((rect) => rect.width));
  const maxBaseHeight = Math.max(1, ...allBaseRects.map((rect) => rect.height));
  const maxScaleByArea = Math.max(
    1,
    Math.floor(
      Math.sqrt(
        Math.max(1, (tileWidth - padding * 2) * (tileHeight - padding * 2)) /
          Math.max(1, totalBaseArea),
      ),
    ),
  );
  const maxScaleByDimension = Math.max(
    1,
    Math.floor(
      Math.min(
        (tileWidth - padding * 2) / maxBaseWidth,
        (tileHeight - padding * 2) / maxBaseHeight,
      ),
    ),
  );
  const maxScale = Math.max(1, Math.min(maxScaleByArea, maxScaleByDimension, 8));

  for (let scale = maxScale; scale >= 1; scale -= 1) {
    const packed = tryPackSlotFaces({
      cubes: representativeCubes,
      slot: options.slot,
      scale,
      padding,
    });

    if (packed) {
      const sharedLayouts = new Map<number, CubeFacesLayout>();

      representativeEntries.forEach((cubeIndex, representativeIndex) => {
        const layout = packed.get(representativeIndex);
        if (!layout) {
          return;
        }

        const dimensions = getCubeDimensions(options.cubes[cubeIndex]);
        const signature = options.shareRepeatedUvs
          ? `${dimensions.width}x${dimensions.height}x${dimensions.depth}`
          : `${cubeIndex}`;
        const memberIndices = groupedCubes.get(signature) ?? [cubeIndex];

        memberIndices.forEach((memberIndex) => {
          sharedLayouts.set(memberIndex, layout);
        });
      });

      return sharedLayouts;
    }
  }

  const fallback = new Map<number, CubeFacesLayout>();

  options.cubes.forEach((cube, cubeIndex) => {
    fallback.set(
      cubeIndex,
      buildStandaloneFaceUvs(cube, options.slot),
    );
  });

  return fallback;
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
    from: [
      roundCoordinate(centerX - halfWidth),
      roundCoordinate(baseY),
      roundCoordinate(centerZ - halfDepth),
    ],
    to: [
      roundCoordinate(centerX + halfWidth),
      roundCoordinate(baseY + height),
      roundCoordinate(centerZ + halfDepth),
    ],
  };
}

function getCoordinateFrame(formatId: string): CoordinateFrame {
  const lower = formatId.toLowerCase();
  const useWorldOrigin = lower === "free" || lower === "generic" || lower === "generic_model";
  const centerX = useWorldOrigin ? 0 : 8;
  const centerZ = useWorldOrigin ? 0 : 8;

  return {
    centerX,
    centerZ,
    shiftX: centerX - 8,
    shiftZ: centerZ - 8,
  };
}

function translatePoint(
  point: [number, number, number],
  frame: CoordinateFrame,
): [number, number, number] {
  return [point[0] + frame.shiftX, point[1], point[2] + frame.shiftZ];
}

function translateCube(cube: PlannedCube, frame: CoordinateFrame): PlannedCube {
  return {
    ...cube,
    from: translatePoint(cube.from, frame),
    to: translatePoint(cube.to, frame),
    origin: translatePoint(cube.origin, frame),
  };
}

function translateCubeBy(
  cube: PlannedCube,
  offset: readonly [number, number, number],
): PlannedCube {
  return {
    ...cube,
    from: [cube.from[0] + offset[0], cube.from[1] + offset[1], cube.from[2] + offset[2]],
    to: [cube.to[0] + offset[0], cube.to[1] + offset[1], cube.to[2] + offset[2]],
    origin: [
      cube.origin[0] + offset[0],
      cube.origin[1] + offset[1],
      cube.origin[2] + offset[2],
    ],
  };
}

function getCubeBounds(cubes: PlannedCube[]) {
  if (cubes.length === 0) {
    return {
      min: [0, 0, 0] as [number, number, number],
      max: [0, 0, 0] as [number, number, number],
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
    center: [
      roundCoordinate((min[0] + max[0]) / 2),
      roundCoordinate((min[1] + max[1]) / 2),
      roundCoordinate((min[2] + max[2]) / 2),
    ] as [number, number, number],
  };
}

function normalizeScenePlacement(
  cubes: PlannedCube[],
  formatId: string,
  repairHints: RepairPlanningHints,
): PlannedCube[] {
  if (!repairHints.recenterScene && !repairHints.regroundAsset) {
    return cubes;
  }

  const bounds = getCubeBounds(cubes);
  const frame = getCoordinateFrame(formatId);
  const offset: [number, number, number] = [0, 0, 0];

  if (repairHints.recenterScene) {
    offset[0] = roundCoordinate(frame.centerX - bounds.center[0]);
    offset[2] = roundCoordinate(frame.centerZ - bounds.center[2]);
  }

  if (repairHints.regroundAsset) {
    offset[1] = roundCoordinate(-bounds.min[1]);
  }

  if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) {
    return cubes;
  }

  return cubes.map((cube) => translateCubeBy(cube, offset));
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

function planChair(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const seat = findPart(spec, "seat");
  const backrest = findPart(spec, "backrest");
  const legs = findPart(spec, "legs");
  const width = roundSize(spec.estimatedSize[0]);
  const height = roundSize(spec.estimatedSize[1]);
  const depth = roundSize(spec.estimatedSize[2]);
  const seatHeight = roundSize((seat?.size[1] ?? 2) * Math.max(0.9, directives.scaleY));
  const backrestHeight = roundSize((backrest?.size[1] ?? 10) * Math.max(0.9, directives.scaleY));
  const legHeight = Math.max(4, height - seatHeight - backrestHeight);
  const centerX = frame.centerX;
  const centerZ = frame.centerZ;
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

  const backThickness = clamp(roundSize((backrest?.size[2] ?? 2) * directives.scaleZ), 2, 4);
  cubes.push(
    cubeFromBounds(
      "backrest",
      [seatBounds.from[0], seatBounds.to[1] - 1, roundCoordinate(centerZ + depth / 2 - backThickness)],
      [seatBounds.to[0], height, roundCoordinate(centerZ + depth / 2)],
      getMaterialSlotForPart(backrest, spec),
      "Rear panel aligned to the back edge.",
    ),
  );

  const legThickness = clamp(roundSize((legs?.size[0] ?? 2) * directives.scaleX), 1, 3);
  const halfWidth = roundCoordinate(width / 2) - legThickness;
  const halfDepth = roundCoordinate(depth / 2) - legThickness;
  const legSlot = getMaterialSlotForPart(legs, spec);
  const legPositions: Array<[number, number]> = [
    [centerX - halfWidth, centerZ - halfDepth],
    [centerX + halfWidth - legThickness, centerZ - halfDepth],
    [centerX - halfWidth, centerZ + halfDepth - legThickness],
    [centerX + halfWidth - legThickness, centerZ + halfDepth - legThickness],
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

function planTable(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const top = findPart(spec, "top");
  const legs = findPart(spec, "legs");
  const width = roundSize(spec.estimatedSize[0]);
  const depth = roundSize(spec.estimatedSize[2]);
  const targetHeight = directives.coffeeTable
    ? roundSize(spec.estimatedSize[1] * 0.7)
    : roundSize(spec.estimatedSize[1]);
  const topThickness = clamp(top?.size[1] ?? 2, 2, 4);
  const legHeight = Math.max(5, targetHeight - topThickness);
  const cubes: PlannedCube[] = [];
  const topSlot = getMaterialSlotForPart(top, spec);

  if (directives.roundTop) {
    cubes.push(
      cubeFromBounds(
        "top_core",
        [frame.centerX - 6, legHeight, frame.centerZ - 6],
        [frame.centerX + 6, legHeight + topThickness, frame.centerZ + 6],
        topSlot,
        "Core slab for the round tabletop silhouette.",
      ),
    );
    cubes.push(
      cubeFromBounds(
        "top_x",
        [frame.centerX - 8, legHeight, frame.centerZ - 4],
        [frame.centerX + 8, legHeight + topThickness, frame.centerZ + 4],
        topSlot,
      ),
    );
    cubes.push(
      cubeFromBounds(
        "top_z",
        [frame.centerX - 4, legHeight, frame.centerZ - 8],
        [frame.centerX + 4, legHeight + topThickness, frame.centerZ + 8],
        topSlot,
      ),
    );
  } else {
    cubes.push(
      cubeFromBounds(
        "table_top",
        [roundCoordinate(frame.centerX - width / 2), legHeight, roundCoordinate(frame.centerZ - depth / 2)],
        [roundCoordinate(frame.centerX + width / 2), legHeight + topThickness, roundCoordinate(frame.centerZ + depth / 2)],
        topSlot,
        "Primary tabletop slab.",
      ),
    );
  }

  const legThickness = clamp(roundSize((legs?.size[0] ?? 2) * directives.scaleX), 1, 3);
  const halfWidth = roundCoordinate(width / 2) - legThickness;
  const halfDepth = roundCoordinate(depth / 2) - legThickness;
  const legSlot = getMaterialSlotForPart(legs, spec);
  const legPositions: Array<[number, number]> = [
    [frame.centerX - halfWidth, frame.centerZ - halfDepth],
    [frame.centerX + halfWidth - legThickness, frame.centerZ - halfDepth],
    [frame.centerX - halfWidth, frame.centerZ + halfDepth - legThickness],
    [frame.centerX + halfWidth - legThickness, frame.centerZ + halfDepth - legThickness],
  ];

  legPositions.forEach(([x, z], index) => {
    cubes.push(
      cubeFromBounds(
        `table_leg_${index + 1}`,
        [x, 0, z],
        [x + legThickness, legHeight, z + legThickness],
        legSlot,
      ),
    );
  });

  return cubes;
}

function planLamp(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const base = findPart(spec, "base");
  const stem = findPart(spec, "stem");
  const shade = findPart(spec, "shade");
  const totalHeight = roundSize(spec.estimatedSize[1] * directives.scaleY);
  const baseHeight = clamp(base?.size[1] ?? 2, 2, 4);
  const stemHeight = clamp(roundSize((stem?.size[1] ?? 12) * directives.scaleY), 8, 16);
  const shadeHeight = Math.max(4, totalHeight - baseHeight - stemHeight);
  const cubes: PlannedCube[] = [];

  cubes.push(
    cubeFromBounds(
      "lamp_base",
      [frame.centerX - 3, 0, frame.centerZ - 3],
      [frame.centerX + 3, baseHeight, frame.centerZ + 3],
      getMaterialSlotForPart(base, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "lamp_stem",
      [frame.centerX - 1, baseHeight, frame.centerZ - 1],
      [frame.centerX + 1, baseHeight + stemHeight, frame.centerZ + 1],
      getMaterialSlotForPart(stem, spec),
    ),
  );

  if (directives.roundTop) {
    cubes.push(
      cubeFromBounds(
        "lamp_shade_mid",
        [frame.centerX - 5, baseHeight + stemHeight, frame.centerZ - 5],
        [frame.centerX + 5, baseHeight + stemHeight + shadeHeight, frame.centerZ + 5],
        getMaterialSlotForPart(shade, spec),
      ),
    );
    cubes.push(
      cubeFromBounds(
        "lamp_shade_upper",
        [frame.centerX - 4, baseHeight + stemHeight + 1, frame.centerZ - 4],
        [frame.centerX + 4, baseHeight + stemHeight + shadeHeight - 1, frame.centerZ + 4],
        getMaterialSlotForPart(shade, spec),
      ),
    );
  } else {
    cubes.push(
      cubeFromBounds(
        "lamp_shade",
        [frame.centerX - 5, baseHeight + stemHeight, frame.centerZ - 5],
        [frame.centerX + 5, baseHeight + stemHeight + shadeHeight, frame.centerZ + 5],
        getMaterialSlotForPart(shade, spec),
      ),
    );
  }

  return cubes;
}

function planShelf(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const sidePanels = findPart(spec, "side_panels");
  const shelves = findPart(spec, "shelves");
  const width = roundSize(spec.estimatedSize[0]);
  const height = roundSize(spec.estimatedSize[1]);
  const depth = roundSize(spec.estimatedSize[2]);
  const sideThickness = clamp(sidePanels?.size[0] ?? 2, 1, 3);
  const shelfThickness = clamp(shelves?.size[1] ?? 2, 1, 3);
  const cubes: PlannedCube[] = [];
  const sideSlot = getMaterialSlotForPart(sidePanels, spec);
  const shelfSlot = getMaterialSlotForPart(shelves, spec);

  cubes.push(
    cubeFromBounds(
      "side_left",
      [roundCoordinate(frame.centerX - width / 2), 0, roundCoordinate(frame.centerZ - depth / 2)],
      [roundCoordinate(frame.centerX - width / 2) + sideThickness, height, roundCoordinate(frame.centerZ + depth / 2)],
      sideSlot,
    ),
  );
  cubes.push(
    cubeFromBounds(
      "side_right",
      [roundCoordinate(frame.centerX + width / 2) - sideThickness, 0, roundCoordinate(frame.centerZ - depth / 2)],
      [roundCoordinate(frame.centerX + width / 2), height, roundCoordinate(frame.centerZ + depth / 2)],
      sideSlot,
    ),
  );

  const usableWidthFrom = roundCoordinate(frame.centerX - width / 2) + sideThickness;
  const usableWidthTo = roundCoordinate(frame.centerX + width / 2) - sideThickness;
  const shelfCount = clamp(directives.shelfCount, 2, 4);
  const verticalGap = roundCoordinate((height - shelfThickness) / shelfCount);

  for (let index = 0; index < shelfCount; index += 1) {
    const baseY = index * verticalGap;
    cubes.push(
      cubeFromBounds(
        `shelf_${index + 1}`,
        [usableWidthFrom, baseY, roundCoordinate(frame.centerZ - depth / 2)],
        [usableWidthTo, baseY + shelfThickness, roundCoordinate(frame.centerZ + depth / 2)],
        shelfSlot,
      ),
    );
  }

  return cubes;
}

function planCabinet(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const body = findPart(spec, "body");
  const doors = findPart(spec, "doors");
  const handles = findPart(spec, "handles");
  const width = roundSize(spec.estimatedSize[0]);
  const height = roundSize(spec.estimatedSize[1]);
  const depth = roundSize(spec.estimatedSize[2]);
  const cubes: PlannedCube[] = [];
  const bodySlot = getMaterialSlotForPart(body, spec);
  const frontSlot = getMaterialSlotForPart(doors, spec);
  const bodyFrom = [
    roundCoordinate(frame.centerX - width / 2),
    0,
    roundCoordinate(frame.centerZ - depth / 2),
  ] as [number, number, number];
  const bodyTo = [
    roundCoordinate(frame.centerX + width / 2),
    height,
    roundCoordinate(frame.centerZ + depth / 2),
  ] as [number, number, number];
  const shellThickness = clamp(Math.max(1, roundCoordinate(Math.min(width, depth) / 8)), 1, 2);
  const frontReveal = 1;
  const frontThickness = 2;
  const handleDepth = 2;
  const carcassFrontZ = bodyTo[2] - frontReveal;
  const frontStartZ = carcassFrontZ;
  const frontEndZ = carcassFrontZ + frontThickness;
  const innerLeft = bodyFrom[0] + shellThickness;
  const innerRight = bodyTo[0] - shellThickness;
  const innerBottom = shellThickness;
  const innerTop = height - shellThickness;
  const innerBackZ = bodyFrom[2] + shellThickness;
  const handleSlot = getMaterialSlotForPart(handles, spec);

  cubes.push(
    cubeFromBounds(
      "cabinet_back",
      bodyFrom,
      [bodyTo[0], height, innerBackZ],
      bodySlot,
      "Back panel of the cabinet carcass.",
    ),
  );
  cubes.push(
    cubeFromBounds(
      "cabinet_side_left",
      [bodyFrom[0], 0, innerBackZ],
      [innerLeft, height, carcassFrontZ],
      bodySlot,
      "Left side panel of the cabinet carcass.",
    ),
  );
  cubes.push(
    cubeFromBounds(
      "cabinet_side_right",
      [innerRight, 0, innerBackZ],
      [bodyTo[0], height, carcassFrontZ],
      bodySlot,
      "Right side panel of the cabinet carcass.",
    ),
  );
  cubes.push(
    cubeFromBounds(
      "cabinet_bottom",
      [innerLeft, 0, innerBackZ],
      [innerRight, innerBottom, carcassFrontZ],
      bodySlot,
      "Bottom shelf of the cabinet carcass.",
    ),
  );
  cubes.push(
    cubeFromBounds(
      "cabinet_top",
      [innerLeft, innerTop, innerBackZ],
      [innerRight, height, carcassFrontZ],
      bodySlot,
      "Top shelf of the cabinet carcass.",
    ),
  );

  if (directives.drawerCount > 0) {
    const drawerCount = clamp(directives.drawerCount, 1, 4);
    const gap = 1;
    const frontInsetX = 1;
    const frontInsetY = 1;
    const availableHeight = Math.max(
      6,
      innerTop - innerBottom - frontInsetY * 2 - gap * (drawerCount - 1),
    );
    const drawerHeight = Math.max(3, roundCoordinate(availableHeight / drawerCount));
    const left = innerLeft + frontInsetX;
    const right = innerRight - frontInsetX;

    for (let index = 0; index < drawerCount; index += 1) {
      const fromY = innerBottom + frontInsetY + index * (drawerHeight + gap);
      const toY = Math.min(innerTop - frontInsetY, fromY + drawerHeight);
      const drawerName = `drawer_${index + 1}`;
      const centerY = roundCoordinate((fromY + toY) / 2);

      cubes.push(
        cubeFromBounds(
          drawerName,
          [left, fromY, frontStartZ],
          [right, toY, frontEndZ],
          frontSlot,
          "Drawer front panel with a slight proud offset from the cabinet carcass.",
        ),
      );
      cubes.push(
        cubeFromBounds(
          `${drawerName}_handle`,
          [roundCoordinate(frame.centerX - 1), centerY - 1, frontEndZ],
          [roundCoordinate(frame.centerX + 1), centerY + 1, frontEndZ + handleDepth],
          handleSlot,
          "Drawer pull protruding in front of the drawer face.",
        ),
      );
    }
  } else {
    const doorGap = 1;
    const doorInset = 1;
    const doorMidX = frame.centerX;

    cubes.push(
      cubeFromBounds(
        "door_left",
        [innerLeft + doorInset, innerBottom + doorInset, frontStartZ],
        [doorMidX - doorGap, innerTop - doorInset, frontEndZ],
        frontSlot,
        "Left cabinet door front with proud offset from the carcass.",
      ),
    );
    cubes.push(
      cubeFromBounds(
        "door_right",
        [doorMidX + doorGap, innerBottom + doorInset, frontStartZ],
        [innerRight - doorInset, innerTop - doorInset, frontEndZ],
        frontSlot,
        "Right cabinet door front with proud offset from the carcass.",
      ),
    );

    cubes.push(
      cubeFromBounds(
        "handle_left",
        [doorMidX - 2, roundCoordinate(height / 2) - 2, frontEndZ],
        [doorMidX - 1, roundCoordinate(height / 2) + 2, frontEndZ + handleDepth],
        handleSlot,
        "Left door handle protruding beyond the door face.",
      ),
    );
    cubes.push(
      cubeFromBounds(
        "handle_right",
        [doorMidX + 1, roundCoordinate(height / 2) - 2, frontEndZ],
        [doorMidX + 2, roundCoordinate(height / 2) + 2, frontEndZ + handleDepth],
        handleSlot,
        "Right door handle protruding beyond the door face.",
      ),
    );
  }

  return cubes;
}

function planBed(spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame): PlannedCube[] {
  const bedFrame = findPart(spec, "frame");
  const mattress = findPart(spec, "mattress");
  const headboard = findPart(spec, "headboard");
  const width = roundSize(spec.estimatedSize[0]);
  const height = roundSize(spec.estimatedSize[1]);
  const depth = roundSize(spec.estimatedSize[2]);
  const frameHeight = clamp(bedFrame?.size[1] ?? 6, 4, 8);
  const mattressHeight = clamp(mattress?.size[1] ?? 4, 3, 6);
  const headboardHeight = directives.tallHeadboard
    ? clamp(height, 10, 18)
    : clamp(headboard?.size[1] ?? 8, 6, 12);
  const cubes: PlannedCube[] = [];

  cubes.push(
    cubeFromBounds(
      "bed_frame",
      [roundCoordinate(frame.centerX - width / 2), 0, roundCoordinate(frame.centerZ - depth / 2)],
      [roundCoordinate(frame.centerX + width / 2), frameHeight, roundCoordinate(frame.centerZ + depth / 2)],
      getMaterialSlotForPart(bedFrame, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "mattress",
      [roundCoordinate(frame.centerX - width / 2) + 1, frameHeight, roundCoordinate(frame.centerZ - depth / 2) + 1],
      [roundCoordinate(frame.centerX + width / 2) - 1, frameHeight + mattressHeight, roundCoordinate(frame.centerZ + depth / 2) - 1],
      getMaterialSlotForPart(mattress, spec),
    ),
  );
  cubes.push(
    cubeFromBounds(
      "headboard",
      [roundCoordinate(frame.centerX - width / 2), frameHeight, roundCoordinate(frame.centerZ + depth / 2) - 2],
      [roundCoordinate(frame.centerX + width / 2), frameHeight + headboardHeight, roundCoordinate(frame.centerZ + depth / 2)],
      getMaterialSlotForPart(headboard, spec),
    ),
  );

  return cubes;
}

function planGeneric(spec: AssetSpec): PlannedCube[] {
  const width = roundSize(spec.estimatedSize[0]);
  const height = roundSize(spec.estimatedSize[1]);
  const depth = roundSize(spec.estimatedSize[2]);
  const part = spec.parts[0];

  return [
    cubeFromBounds(
      part?.name ?? "main_body",
      [roundCoordinate(8 - width / 2), 0, roundCoordinate(8 - depth / 2)],
      [roundCoordinate(8 + width / 2), height, roundCoordinate(8 + depth / 2)],
      getMaterialSlotForPart(part, spec),
      "Fallback silhouette cube.",
    ),
  ];
}

function selectPlanner(
  spec: AssetSpec,
): (spec: AssetSpec, directives: PromptDirectives, frame: CoordinateFrame) => PlannedCube[] {
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
      return (incomingSpec, _directives, frame) =>
        planGeneric(incomingSpec).map((cube) => translateCube(cube, frame));
  }
}

function listUsedSlotIds(cubes: PlannedCube[]): MaterialSlotId[] {
  const seen = new Set<MaterialSlotId>();

  for (const cube of cubes) {
    seen.add(normalizeMaterialSlotId(cube.materialSlot));
  }

  return MATERIAL_SLOT_ORDER.filter((slotId) => seen.has(slotId));
}

export function planBuildFromAssetSpec(options: {
  prompt: string;
  spec: AssetSpec;
  projectName?: string;
  formatId: string;
  textureWidth: number;
  textureHeight: number;
  boxUv: boolean;
  repairHints?: Partial<RepairPlanningHints>;
}): BuildPlan {
  const repairHints: RepairPlanningHints = {
    ...DEFAULT_REPAIR_HINTS,
    ...options.repairHints,
  };
  const directives = parsePromptDirectives(options.prompt);
  const scaledSize = scaleVector(options.spec.estimatedSize, directives);
  const spec: AssetSpec = {
    ...options.spec,
    estimatedSize: scaledSize,
  };
  const frame = getCoordinateFrame(options.formatId);
  const planner = selectPlanner(spec);
  const draftCubes = normalizeScenePlacement(
    planner(spec, directives, frame),
    options.formatId,
    repairHints,
  );
  const materialSlots = pickMaterialSlots(
    spec,
    options.textureWidth,
    options.textureHeight,
    listUsedSlotIds(draftCubes),
    repairHints.compactMaterialSlots,
  );
  const slotById = new Map(materialSlots.map((slot) => [slot.slotId, slot]));
  const cubes: PlannedCube[] = draftCubes.map((cube) => {
    const slot = slotById.get(normalizeMaterialSlotId(cube.materialSlot)) ?? materialSlots[0];

    return {
      ...cube,
      uvOffset: slot?.uvOffset,
      faces: undefined,
    };
  });

  if (!options.boxUv) {
    const cubesBySlot = new Map<string, Array<{ cubeIndex: number; cube: PlannedCube }>>();

    cubes.forEach((cube, cubeIndex) => {
      const slotId = cube.materialSlot ?? materialSlots[0]?.slotId;
      if (!slotId) {
        return;
      }

      const bucket = cubesBySlot.get(slotId) ?? [];
      bucket.push({ cubeIndex, cube });
      cubesBySlot.set(slotId, bucket);
    });

    cubesBySlot.forEach((entries, slotId) => {
      const slot = slotById.get(slotId);
      if (!slot) {
        return;
      }

      const layouts = buildPackedFacesForSlot({
        cubes: entries.map((entry) => entry.cube),
        slot,
        shareRepeatedUvs: repairHints.shareRepeatedUvs,
      });

      entries.forEach((entry, localIndex) => {
        cubes[entry.cubeIndex] = {
          ...cubes[entry.cubeIndex],
          faces: layouts.get(localIndex),
        };
      });
    });
  }
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
      `Coordinates are centered around the Blockbench scene origin for format "${options.formatId}".`,
      options.boxUv
        ? "Material slots are mapped onto the procedural atlas with Blockbench box UV."
        : "Material slots are mapped onto the procedural atlas with expanded per-face UV packing.",
      repairHints.compactMaterialSlots
        ? "Repair pass compacted material slots to use more of the atlas."
        : "Baseline pass keeps the default material slot layout for repair-loop comparison.",
      repairHints.shareRepeatedUvs
        ? "Repair pass shares UV islands across repeated identical cube dimensions."
        : "Repeated cube dimensions currently keep unique UV islands.",
      repairHints.recenterScene || repairHints.regroundAsset
        ? "Repair pass normalized scene placement against the target Blockbench origin."
        : "Scene placement uses the planner's raw coordinates.",
    ],
  };
}
