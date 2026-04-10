import type {
  CubeSummary,
  ProjectContents,
  ProjectStructureBedSummary,
  ProjectStructureChairSummary,
  ProjectStructureSummary,
  ReferenceFeatureCode,
} from "../contracts/schemas.js";

type StructureCube = Pick<CubeSummary, "name" | "from" | "to">;
type AxisIndex = 0 | 1 | 2;

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function stripScopePrefix(name: string): string {
  const separatorIndex = name.indexOf("::");
  return separatorIndex >= 0 ? name.slice(separatorIndex + 2) : name;
}

function getBounds(cubes: StructureCube[]) {
  if (cubes.length === 0) {
    return {
      min: null,
      max: null,
      size: null,
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
  };
}

function filterCubes(options: {
  contents: ProjectContents;
  managedScope?: string;
  managedOnly: boolean;
}): CubeSummary[] {
  if (!options.managedScope) {
    return options.contents.cubes;
  }

  const prefix = `${options.managedScope}::`;

  if (options.managedOnly) {
    return options.contents.cubes.filter((cube) => cube.name.startsWith(prefix));
  }

  return options.contents.cubes;
}

function cubeSize(cube: StructureCube): [number, number, number] {
  return [
    Math.abs(cube.to[0] - cube.from[0]),
    Math.abs(cube.to[1] - cube.from[1]),
    Math.abs(cube.to[2] - cube.from[2]),
  ];
}

function cubeMin(cube: StructureCube, axis: AxisIndex): number {
  return Math.min(cube.from[axis], cube.to[axis]);
}

function cubeMax(cube: StructureCube, axis: AxisIndex): number {
  return Math.max(cube.from[axis], cube.to[axis]);
}

function cubeMaxY(cube: StructureCube): number {
  return cubeMax(cube, 1);
}

function cubeMinY(cube: StructureCube): number {
  return cubeMin(cube, 1);
}

function cubeCenterX(cube: StructureCube): number {
  return (cube.from[0] + cube.to[0]) / 2;
}

function cubeCenterZ(cube: StructureCube): number {
  return (cube.from[2] + cube.to[2]) / 2;
}

function overlapRange(
  minA: number,
  maxA: number,
  minB: number,
  maxB: number,
): number {
  return Math.max(0, Math.min(maxA, maxB) - Math.max(minA, minB));
}

function overlapAreaOnAxes(
  left: StructureCube,
  right: StructureCube,
  axisA: AxisIndex,
  axisB: AxisIndex,
): number {
  return (
    overlapRange(cubeMin(left, axisA), cubeMax(left, axisA), cubeMin(right, axisA), cubeMax(right, axisA)) *
    overlapRange(cubeMin(left, axisB), cubeMax(left, axisB), cubeMin(right, axisB), cubeMax(right, axisB))
  );
}

function nameHas(name: string, cues: string[]): boolean {
  return cues.some((cue) => name.includes(cue));
}

function namedCount(
  cubes: StructureCube[],
  label: string,
  predicate: (normalizedName: string, cube: StructureCube) => boolean,
): [string, number] {
  return [
    label,
    cubes.filter((cube) => predicate(stripScopePrefix(cube.name).toLowerCase(), cube)).length,
  ];
}

function surfaceCoverageRatio(options: {
  cubes: StructureCube[];
  surfaceAxis: AxisIndex;
  surfaceValue: number;
  axisA: AxisIndex;
  axisB: AxisIndex;
  rangeA: [number, number];
  rangeB: [number, number];
  resolutionA?: number;
  resolutionB?: number;
  tolerance?: number;
}): number | null {
  const spanA = options.rangeA[1] - options.rangeA[0];
  const spanB = options.rangeB[1] - options.rangeB[0];

  if (spanA <= 0 || spanB <= 0) {
    return null;
  }

  const resolutionA = options.resolutionA ?? 20;
  const resolutionB = options.resolutionB ?? 20;
  const tolerance = options.tolerance ?? 0.9;
  let covered = 0;
  const total = resolutionA * resolutionB;

  for (let indexA = 0; indexA < resolutionA; indexA += 1) {
    const sampleA = options.rangeA[0] + ((indexA + 0.5) / resolutionA) * spanA;

    for (let indexB = 0; indexB < resolutionB; indexB += 1) {
      const sampleB = options.rangeB[0] + ((indexB + 0.5) / resolutionB) * spanB;
      const hit = options.cubes.some((cube) => {
        const touchesSurface =
          Math.abs(cubeMin(cube, options.surfaceAxis) - options.surfaceValue) <= tolerance ||
          Math.abs(cubeMax(cube, options.surfaceAxis) - options.surfaceValue) <= tolerance;

        if (!touchesSurface) {
          return false;
        }

        return (
          sampleA >= cubeMin(cube, options.axisA) &&
          sampleA <= cubeMax(cube, options.axisA) &&
          sampleB >= cubeMin(cube, options.axisB) &&
          sampleB <= cubeMax(cube, options.axisB)
        );
      });

      if (hit) {
        covered += 1;
      }
    }
  }

  return roundMetric(covered / total);
}

function footprintCoverageRatio(options: {
  cubes: StructureCube[];
  xRange: [number, number];
  zRange: [number, number];
  yRange: [number, number];
  resolutionX?: number;
  resolutionZ?: number;
}): number | null {
  const spanX = options.xRange[1] - options.xRange[0];
  const spanZ = options.zRange[1] - options.zRange[0];

  if (spanX <= 0 || spanZ <= 0 || options.yRange[1] <= options.yRange[0]) {
    return null;
  }

  const resolutionX = options.resolutionX ?? 24;
  const resolutionZ = options.resolutionZ ?? 24;
  let covered = 0;
  const total = resolutionX * resolutionZ;

  for (let ix = 0; ix < resolutionX; ix += 1) {
    const sampleX = options.xRange[0] + ((ix + 0.5) / resolutionX) * spanX;

    for (let iz = 0; iz < resolutionZ; iz += 1) {
      const sampleZ = options.zRange[0] + ((iz + 0.5) / resolutionZ) * spanZ;
      const hit = options.cubes.some((cube) => {
        const intersectsY =
          cubeMaxY(cube) > options.yRange[0] && cubeMinY(cube) < options.yRange[1];

        if (!intersectsY) {
          return false;
        }

        return (
          sampleX >= cubeMin(cube, 0) &&
          sampleX <= cubeMax(cube, 0) &&
          sampleZ >= cubeMin(cube, 2) &&
          sampleZ <= cubeMax(cube, 2)
        );
      });

      if (hit) {
        covered += 1;
      }
    }
  }

  return roundMetric(covered / total);
}

function cubesTouchOrSupport(left: StructureCube, right: StructureCube): boolean {
  const epsilon = 1.05;
  const overlapXY = overlapAreaOnAxes(left, right, 0, 1);
  const overlapXZ = overlapAreaOnAxes(left, right, 0, 2);
  const overlapYZ = overlapAreaOnAxes(left, right, 1, 2);

  if (
    Math.abs(cubeMax(left, 1) - cubeMin(right, 1)) <= epsilon &&
    overlapXZ > 0.05
  ) {
    return true;
  }

  if (
    Math.abs(cubeMax(right, 1) - cubeMin(left, 1)) <= epsilon &&
    overlapXZ > 0.05
  ) {
    return true;
  }

  if (
    Math.abs(cubeMax(left, 0) - cubeMin(right, 0)) <= epsilon &&
    overlapYZ > 0.05
  ) {
    return true;
  }

  if (
    Math.abs(cubeMax(right, 0) - cubeMin(left, 0)) <= epsilon &&
    overlapYZ > 0.05
  ) {
    return true;
  }

  if (
    Math.abs(cubeMax(left, 2) - cubeMin(right, 2)) <= epsilon &&
    overlapXY > 0.05
  ) {
    return true;
  }

  if (
    Math.abs(cubeMax(right, 2) - cubeMin(left, 2)) <= epsilon &&
    overlapXY > 0.05
  ) {
    return true;
  }

  return false;
}

function countFloatingCubes(cubes: StructureCube[], groundY: number): number {
  if (cubes.length === 0) {
    return 0;
  }

  const grounded = new Set<number>();

  for (let index = 0; index < cubes.length; index += 1) {
    if (cubeMinY(cubes[index]) <= groundY + 0.05) {
      grounded.add(index);
    }
  }

  const queue = [...grounded];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined) {
      continue;
    }

    for (let index = 0; index < cubes.length; index += 1) {
      if (grounded.has(index)) {
        continue;
      }

      if (cubesTouchOrSupport(cubes[current], cubes[index])) {
        grounded.add(index);
        queue.push(index);
      }
    }
  }

  return cubes.length - grounded.size;
}

function detectChairSummary(cubes: StructureCube[]): ProjectStructureChairSummary | null {
  if (cubes.length === 0) {
    return null;
  }

  const bounds = getBounds(cubes);
  if (!bounds.min || !bounds.max || !bounds.size) {
    return null;
  }

  const normalized = cubes.map((cube) => ({
    cube,
    name: stripScopePrefix(cube.name).toLowerCase(),
  }));
  const seatBaseCubes = normalized.filter(({ name }) => nameHas(name, ["seat"]) && !name.includes("cushion"));
  const seatCushionCubes = normalized.filter(({ name }) =>
    nameHas(name, ["seat_cushion", "seat-cushion"]) || (name.includes("cushion") && name.includes("seat")),
  );
  const backCubes = normalized.filter(({ name }) =>
    (name.includes("back") && !name.includes("cushion")) || name.includes("backrest"),
  );
  const backCushionCubes = normalized.filter(({ name }) =>
    nameHas(name, ["back_cushion", "back-cushion"]) ||
    (name.includes("back") && name.includes("cushion")),
  );
  const armrestCubes = normalized.filter(({ name, cube }) => {
    if (nameHas(name, ["armrest", "arm_rest"])) {
      return true;
    }

    const [sizeX, sizeY, sizeZ] = cubeSize(cube);
    const highEnough = cubeMinY(cube) >= bounds.min[1] + bounds.size[1] * 0.35;
    const sideBand =
      cubeCenterX(cube) <= bounds.min[0] + 2 || cubeCenterX(cube) >= bounds.max[0] - 2;
    return highEnough && sideBand && sizeY <= 3 && sizeZ >= bounds.size[2] * 0.35 && sizeX <= 3;
  });
  const legCubes = normalized.filter(({ name, cube }) => {
    if (name.includes("leg")) {
      return true;
    }

    const [sizeX, sizeY, sizeZ] = cubeSize(cube);
    return cubeMinY(cube) === bounds.min[1] && sizeY >= bounds.size[1] * 0.2 && sizeX <= 3 && sizeZ <= 3;
  });
  const supportCubes = normalized.filter(({ name }) =>
    nameHas(name, ["support", "post", "upright"]),
  );
  const frontBeamCubes = normalized.filter(({ name, cube }) => {
    if (name.includes("front_beam")) {
      return true;
    }

    const [sizeX, sizeY, sizeZ] = cubeSize(cube);
    const low = cubeMinY(cube) <= bounds.min[1] + bounds.size[1] * 0.35;
    const wide = sizeX >= bounds.size[0] * 0.35;
    const shallow = sizeY <= 3 && sizeZ <= 3;
    const atFront = cubeCenterZ(cube) <= bounds.min[2] + 2 || cubeCenterZ(cube) >= bounds.max[2] - 2;
    return low && wide && shallow && atFront;
  });
  const sideSlatCubes = normalized.filter(({ name, cube }) => {
    if (name.includes("slat")) {
      return true;
    }

    const [sizeX, sizeY, sizeZ] = cubeSize(cube);
    const tall = sizeY >= bounds.size[1] * 0.25;
    const thin = Math.min(sizeX, sizeZ) <= 2;
    const notGrounded = cubeMinY(cube) > bounds.min[1] + 1;
    const sideBand =
      cubeCenterX(cube) <= bounds.min[0] + 3 || cubeCenterX(cube) >= bounds.max[0] - 3;
    const notCorner =
      cubeCenterZ(cube) > bounds.min[2] + 1.5 && cubeCenterZ(cube) < bounds.max[2] - 1.5;
    return tall && thin && notGrounded && sideBand && notCorner;
  });
  const sidePanelCubes = normalized.filter(({ name, cube }) => {
    if (name.includes("side_panel")) {
      return true;
    }

    const [sizeX, sizeY, sizeZ] = cubeSize(cube);
    const tall = sizeY >= bounds.size[1] * 0.35;
    const sideBand =
      cubeCenterX(cube) <= bounds.min[0] + 2 || cubeCenterX(cube) >= bounds.max[0] - 2;
    return tall && sideBand && sizeZ >= bounds.size[2] * 0.45;
  });

  const seatCandidate = seatCushionCubes[0]?.cube ?? seatBaseCubes[0]?.cube ?? null;
  const seatInsetX =
    seatCandidate === null
      ? null
      : roundMetric(
          Math.min(
            Math.abs(Math.min(seatCandidate.from[0], seatCandidate.to[0]) - bounds.min[0]),
            Math.abs(bounds.max[0] - Math.max(seatCandidate.from[0], seatCandidate.to[0])),
          ),
        );
  const seatInsetZ =
    seatCandidate === null
      ? null
      : roundMetric(
          Math.min(
            Math.abs(Math.min(seatCandidate.from[2], seatCandidate.to[2]) - bounds.min[2]),
            Math.abs(bounds.max[2] - Math.max(seatCandidate.from[2], seatCandidate.to[2])),
          ),
        );
  const armrestTopY =
    armrestCubes.length === 0 ? null : Math.max(...armrestCubes.map(({ cube }) => cubeMaxY(cube)));
  const backTopY =
    [...backCubes, ...backCushionCubes].length === 0
      ? null
      : Math.max(...[...backCubes, ...backCushionCubes].map(({ cube }) => cubeMaxY(cube)));

  return {
    legCount: legCubes.length,
    armrestCount: armrestCubes.length,
    sideSlatCount: sideSlatCubes.length,
    supportCount: supportCubes.length,
    frontBeamCount: frontBeamCubes.length,
    sidePanelCount: sidePanelCubes.length,
    seatBaseCount: seatBaseCubes.length,
    seatCushionCount: seatCushionCubes.length,
    backBaseCount: backCubes.length,
    backCushionCount: backCushionCubes.length,
    seatInsetX,
    seatInsetZ,
    armrestTopY: armrestTopY === null ? null : roundMetric(armrestTopY),
    backTopY: backTopY === null ? null : roundMetric(backTopY),
    backAboveArmrests:
      armrestTopY === null || backTopY === null ? null : roundMetric(backTopY) > roundMetric(armrestTopY),
    frontBeamVisible: frontBeamCubes.length > 0 ? true : false,
    openSides:
      sideSlatCubes.length > 0 ? true : sidePanelCubes.length > 0 ? false : null,
  };
}

function detectedFeaturesFromChair(summary: ProjectStructureChairSummary): ReferenceFeatureCode[] {
  const features: ReferenceFeatureCode[] = [];

  if (summary.legCount >= 4) {
    features.push("four_legs");
  }

  if (summary.armrestCount >= 2) {
    features.push("armrests");
  }

  if (summary.sideSlatCount >= 2) {
    features.push("side_slats", "open_sides");
  } else if (summary.openSides === true) {
    features.push("open_sides");
  }

  if (summary.seatCushionCount >= 1) {
    features.push("seat_cushion");
  }

  if (summary.backCushionCount >= 1) {
    features.push("back_cushion");
  }

  if (summary.frontBeamVisible) {
    features.push("visible_front_beam");
  }

  if (
    summary.seatInsetX !== null &&
    summary.seatInsetZ !== null &&
    summary.seatInsetX >= 1 &&
    summary.seatInsetZ >= 1
  ) {
    features.push("inset_seat");
  }

  if (summary.backAboveArmrests) {
    features.push("back_above_armrests");
  }

  return [...new Set(features)];
}

function detectBedSummary(cubes: StructureCube[]): ProjectStructureBedSummary | null {
  if (cubes.length === 0) {
    return null;
  }

  const bounds = getBounds(cubes);
  if (!bounds.min || !bounds.max || !bounds.size) {
    return null;
  }

  const normalized = cubes.map((cube) => ({
    cube,
    name: stripScopePrefix(cube.name).toLowerCase(),
  }));
  const lowerBodyTop = bounds.min[1] + Math.max(2, bounds.size[1] * 0.45);
  const sideRangeY: [number, number] = [bounds.min[1], lowerBodyTop];
  const sideRangeZ: [number, number] = [bounds.min[2], bounds.max[2]];
  const frontRangeX: [number, number] = [bounds.min[0], bounds.max[0]];
  const frontRangeY: [number, number] = [bounds.min[1], lowerBodyTop];
  const lowerBandY: [number, number] = [bounds.min[1], bounds.min[1] + Math.max(1.25, bounds.size[1] * 0.18)];

  const frameCubes = normalized.filter(({ name }) =>
    nameHas(name, ["frame", "rail", "post", "board", "panel", "support"]),
  );
  const mattressCubes = normalized.filter(
    ({ name }) => name.includes("mattress") && !name.includes("support"),
  );
  const headboardCubes = normalized.filter(({ name }) => name.includes("headboard"));
  const footboardCubes = normalized.filter(({ name }) =>
    name.includes("footboard") || name.includes("foot_board"),
  );
  const drawerCubes = normalized.filter(({ name }) => name.includes("drawer") && !name.includes("handle"));
  const drawerHandleCubes = normalized.filter(({ name }) => name.includes("handle"));
  const pillowCubes = normalized.filter(({ name }) => name.includes("pillow"));
  const beddingCubes = normalized.filter(({ name }) =>
    nameHas(name, ["duvet", "blanket", "comforter", "quilt", "bedding"]),
  );
  const postCubes = normalized.filter(({ name }) => name.includes("post"));
  const railCubes = normalized.filter(({ name }) =>
    name.includes("rail") || name.includes("slat") || name.includes("support"),
  );

  const drawerFrontOnlyCount = drawerCubes.filter(({ cube }) => {
    const [sizeX, , sizeZ] = cubeSize(cube);
    return Math.min(sizeX, sizeZ) <= Math.max(1.5, Math.min(bounds.size[0], bounds.size[2]) * 0.08);
  }).length;
  const drawerBodyCount = Math.max(0, drawerCubes.length - drawerFrontOnlyCount);
  const leftSideClosureRatio = surfaceCoverageRatio({
    cubes,
    surfaceAxis: 0,
    surfaceValue: bounds.min[0],
    axisA: 1,
    axisB: 2,
    rangeA: sideRangeY,
    rangeB: sideRangeZ,
  });
  const rightSideClosureRatio = surfaceCoverageRatio({
    cubes,
    surfaceAxis: 0,
    surfaceValue: bounds.max[0],
    axisA: 1,
    axisB: 2,
    rangeA: sideRangeY,
    rangeB: sideRangeZ,
  });
  const frontClosureRatio = surfaceCoverageRatio({
    cubes,
    surfaceAxis: 2,
    surfaceValue: bounds.min[2],
    axisA: 0,
    axisB: 1,
    rangeA: frontRangeX,
    rangeB: frontRangeY,
  });
  const backClosureRatio = surfaceCoverageRatio({
    cubes,
    surfaceAxis: 2,
    surfaceValue: bounds.max[2],
    axisA: 0,
    axisB: 1,
    rangeA: frontRangeX,
    rangeB: frontRangeY,
  });
  const lowerBodyCoverageRatio = footprintCoverageRatio({
    cubes,
    xRange: [bounds.min[0], bounds.max[0]],
    zRange: [bounds.min[2], bounds.max[2]],
    yRange: [bounds.min[1], lowerBodyTop],
  });
  const undersideCoverageRatio = footprintCoverageRatio({
    cubes,
    xRange: [bounds.min[0], bounds.max[0]],
    zRange: [bounds.min[2], bounds.max[2]],
    yRange: lowerBandY,
  });
  const mattressSupportRatio =
    mattressCubes.length === 0
      ? null
      : footprintCoverageRatio({
          cubes: cubes.filter((cube) => {
            if (mattressCubes.some(({ cube: mattressCube }) => mattressCube === cube)) {
              return false;
            }

            return cubeMaxY(cube) <= cubeMinY(mattressCubes[0].cube) + 0.75;
          }),
          xRange: [cubeMin(mattressCubes[0].cube, 0), cubeMax(mattressCubes[0].cube, 0)],
          zRange: [cubeMin(mattressCubes[0].cube, 2), cubeMax(mattressCubes[0].cube, 2)],
          yRange: [cubeMinY(mattressCubes[0].cube) - 2, cubeMinY(mattressCubes[0].cube) + 0.5],
        });
  const floatingCubeCount = countFloatingCubes(cubes, bounds.min[1]);
  const sidesClosed =
    leftSideClosureRatio === null || rightSideClosureRatio === null
      ? null
      : leftSideClosureRatio >= 0.38 && rightSideClosureRatio >= 0.38;
  const undersideClosedNormalized =
    undersideCoverageRatio === null ? null : undersideCoverageRatio >= 0.35;
  const storageBaseClosed =
    sidesClosed === null || undersideClosedNormalized === null || lowerBodyCoverageRatio === null
      ? null
      : sidesClosed && undersideClosedNormalized && lowerBodyCoverageRatio >= 0.45;

  return {
    frameCount: frameCubes.length,
    mattressCount: mattressCubes.length,
    headboardCount: headboardCubes.length,
    footboardCount: footboardCubes.length,
    drawerCount: drawerCubes.length,
    drawerBodyCount,
    drawerFrontOnlyCount,
    drawerHandleCount: drawerHandleCubes.length,
    pillowCount: pillowCubes.length,
    beddingCount: beddingCubes.length,
    postCount: postCubes.length,
    railCount: railCubes.length,
    mattressSupportRatio,
    leftSideClosureRatio,
    rightSideClosureRatio,
    frontClosureRatio,
    backClosureRatio,
    lowerBodyCoverageRatio,
    undersideCoverageRatio,
    floatingCubeCount,
    storageBaseClosed,
    sidesClosed,
    undersideClosed: undersideClosedNormalized,
  };
}

function detectedFeaturesFromBed(summary: ProjectStructureBedSummary): ReferenceFeatureCode[] {
  const features: ReferenceFeatureCode[] = [];

  if (summary.storageBaseClosed) {
    features.push("storage_base");
  }

  if (summary.drawerCount > 0) {
    features.push("underbed_drawers");
  }

  if (summary.footboardCount > 0) {
    features.push("footboard");
  }

  if (summary.pillowCount > 0) {
    features.push("pillows");
  }

  if (summary.beddingCount > 0) {
    features.push("duvet");
  }

  return [...new Set(features)];
}

export function describeProjectStructure(options: {
  contents: ProjectContents;
  managedScope?: string;
  managedOnly?: boolean;
}): ProjectStructureSummary {
  const cubes = filterCubes({
    contents: options.contents,
    managedScope: options.managedScope,
    managedOnly: options.managedOnly ?? false,
  });
  const bounds = getBounds(cubes);
  const namedPartCounts = Object.fromEntries([
    namedCount(cubes, "legs", (name) => name.includes("leg")),
    namedCount(cubes, "armrests", (name) => name.includes("armrest") || name.includes("arm_rest")),
    namedCount(cubes, "slats", (name) => name.includes("slat")),
    namedCount(cubes, "beams", (name) => name.includes("beam")),
    namedCount(cubes, "cushions", (name) => name.includes("cushion")),
    namedCount(cubes, "supports", (name) => name.includes("support") || name.includes("post")),
    namedCount(cubes, "backs", (name) => name.includes("back")),
    namedCount(cubes, "seats", (name) => name.includes("seat")),
    namedCount(cubes, "drawers", (name) => name.includes("drawer")),
    namedCount(cubes, "mattresses", (name) => name.includes("mattress")),
    namedCount(cubes, "pillows", (name) => name.includes("pillow")),
  ]);
  const chair = describeProjectStructureLooksLikeChair(cubes) ? detectChairSummary(cubes) : null;
  const bed = describeProjectStructureLooksLikeBed(cubes) ? detectBedSummary(cubes) : null;
  const detectedFeatures = [
    ...(chair ? detectedFeaturesFromChair(chair) : []),
    ...(bed ? detectedFeaturesFromBed(bed) : []),
  ];

  return {
    managedScope: options.managedScope ?? null,
    totalCubeCount: options.contents.cubes.length,
    analyzedCubeCount: cubes.length,
    textureCount: options.contents.textures.length,
    boundsMin: bounds.min,
    boundsMax: bounds.max,
    boundsSize: bounds.size,
    namedPartCounts,
    detectedFeatures: [...new Set(detectedFeatures)],
    chair,
    bed,
  };
}

function describeProjectStructureLooksLikeChair(cubes: StructureCube[]): boolean {
  return cubes.some((cube) => {
    const name = stripScopePrefix(cube.name).toLowerCase();
    return (
      name.includes("seat") ||
      name.includes("back") ||
      name.includes("leg") ||
      name.includes("armrest")
    );
  });
}

function describeProjectStructureLooksLikeBed(cubes: StructureCube[]): boolean {
  return cubes.some((cube) => {
    const name = stripScopePrefix(cube.name).toLowerCase();
    return (
      name.includes("mattress") ||
      name.includes("headboard") ||
      name.includes("footboard") ||
      name.includes("pillow") ||
      name.includes("duvet") ||
      name.includes("bed")
    );
  });
}
