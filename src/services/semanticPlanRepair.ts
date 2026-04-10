import type { PlannedCube } from "../contracts/schemas.js";
import type { RepairPlanningHints } from "./assetPlanning.js";

function stripScopePrefix(name: string): string {
  const separatorIndex = name.indexOf("::");
  return separatorIndex >= 0 ? name.slice(separatorIndex + 2) : name;
}

function cubeNameMatches(cube: PlannedCube, cues: string[]): boolean {
  const normalized = stripScopePrefix(cube.name).toLowerCase();
  return cues.some((cue) => normalized.includes(cue));
}

function cubeBounds(cubes: PlannedCube[]) {
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

  return { min, max };
}

function cubeSize(cube: PlannedCube): [number, number, number] {
  return [
    Math.abs(cube.to[0] - cube.from[0]),
    Math.abs(cube.to[1] - cube.from[1]),
    Math.abs(cube.to[2] - cube.from[2]),
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
      Math.round((from[0] + to[0]) / 2),
      Math.round((from[1] + to[1]) / 2),
      Math.round((from[2] + to[2]) / 2),
    ],
    materialSlot,
    notes,
  };
}

function updateCubeBounds(
  cube: PlannedCube,
  next: Partial<Pick<PlannedCube, "from" | "to">>,
): PlannedCube {
  const from = next.from ?? cube.from;
  const to = next.to ?? cube.to;

  return {
    ...cube,
    from,
    to,
    origin: [
      Math.round((from[0] + to[0]) / 2),
      Math.round((from[1] + to[1]) / 2),
      Math.round((from[2] + to[2]) / 2),
    ],
  };
}

function findFirst(cubes: PlannedCube[], cues: string[], excludeCues: string[] = []): PlannedCube | null {
  return (
    cubes.find((cube) => {
      const normalized = stripScopePrefix(cube.name).toLowerCase();
      return (
        cues.some((cue) => normalized.includes(cue)) &&
        !excludeCues.some((cue) => normalized.includes(cue))
      );
    }) ?? null
  );
}

function maxY(cubes: PlannedCube[]): number {
  return Math.max(...cubes.map((cube) => Math.max(cube.from[1], cube.to[1])));
}

function minY(cubes: PlannedCube[]): number {
  return Math.min(...cubes.map((cube) => Math.min(cube.from[1], cube.to[1])));
}

function applySeatInset(cubes: PlannedCube[]): PlannedCube[] {
  return cubes.map((cube) => {
    if (!cubeNameMatches(cube, ["seat"])) {
      return cube;
    }

    const normalized = stripScopePrefix(cube.name).toLowerCase();
    const inset = normalized.includes("cushion") ? 1 : 1;
    const nextFrom: [number, number, number] = [...cube.from] as [number, number, number];
    const nextTo: [number, number, number] = [...cube.to] as [number, number, number];

    if (Math.abs(nextTo[0] - nextFrom[0]) > 4) {
      nextFrom[0] += inset;
      nextTo[0] -= inset;
    }

    if (Math.abs(nextTo[2] - nextFrom[2]) > 4) {
      nextFrom[2] += inset;
      nextTo[2] -= inset;
    }

    return updateCubeBounds(cube, {
      from: nextFrom,
      to: nextTo,
    });
  });
}

function addArmrestsAndSupports(cubes: PlannedCube[]): PlannedCube[] {
  if (cubes.some((cube) => cubeNameMatches(cube, ["armrest"]))) {
    return cubes;
  }

  const seat = findFirst(cubes, ["seat"], ["cushion"]);
  const back = findFirst(cubes, ["back"], ["cushion"]);
  const legs = cubes.filter((cube) => cubeNameMatches(cube, ["leg"]));
  if (!seat || !back || legs.length === 0) {
    return cubes;
  }

  const bounds = cubeBounds(cubes);
  const seatTop = Math.max(seat.from[1], seat.to[1]);
  const legTop = maxY(legs);
  const armHeight = 2;
  const armBaseY = Math.max(seatTop + 2, legTop + 2);
  const armDepthStart = Math.min(seat.from[2], seat.to[2]);
  const armDepthEnd = Math.max(seat.from[2], seat.to[2]);
  const armWidth = 2;
  const leftX = bounds.min[0];
  const rightX = bounds.max[0] - armWidth;
  const supportBottom = legTop;

  return [
    ...cubes,
    cubeFromBounds(
      "armrest_left",
      [leftX, armBaseY, armDepthStart],
      [leftX + armWidth, armBaseY + armHeight, armDepthEnd],
      "primary",
      "Semantic repair added left armrest from reference intent.",
    ),
    cubeFromBounds(
      "armrest_right",
      [rightX, armBaseY, armDepthStart],
      [rightX + armWidth, armBaseY + armHeight, armDepthEnd],
      "primary",
      "Semantic repair added right armrest from reference intent.",
    ),
    cubeFromBounds(
      "arm_support_left_front",
      [leftX, supportBottom, bounds.min[2]],
      [leftX + armWidth, armBaseY, bounds.min[2] + armWidth],
      "primary",
    ),
    cubeFromBounds(
      "arm_support_left_rear",
      [leftX, supportBottom, bounds.max[2] - armWidth],
      [leftX + armWidth, armBaseY, bounds.max[2]],
      "primary",
    ),
    cubeFromBounds(
      "arm_support_right_front",
      [rightX, supportBottom, bounds.min[2]],
      [rightX + armWidth, armBaseY, bounds.min[2] + armWidth],
      "primary",
    ),
    cubeFromBounds(
      "arm_support_right_rear",
      [rightX, supportBottom, bounds.max[2] - armWidth],
      [rightX + armWidth, armBaseY, bounds.max[2]],
      "primary",
    ),
  ];
}

function addFrontBeam(cubes: PlannedCube[]): PlannedCube[] {
  if (cubes.some((cube) => cubeNameMatches(cube, ["front_beam"]))) {
    return cubes;
  }

  const seat = findFirst(cubes, ["seat"]);
  const legs = cubes.filter((cube) => cubeNameMatches(cube, ["leg"]));
  if (!seat || legs.length < 2) {
    return cubes;
  }

  const bounds = cubeBounds(cubes);
  const frontZ = bounds.min[2];
  const seatBottom = Math.min(seat.from[1], seat.to[1]);
  const beamTop = Math.max(minY(legs) + 4, seatBottom - 1);
  const beamHeight = 2;
  const inset = 1;

  return [
    ...cubes,
    cubeFromBounds(
      "front_beam",
      [bounds.min[0] + inset, beamTop - beamHeight, frontZ],
      [bounds.max[0] - inset, beamTop, frontZ + 2],
      "primary",
      "Semantic repair added visible lower front beam.",
    ),
  ];
}

function addSideSlats(cubes: PlannedCube[]): PlannedCube[] {
  const existingSlats = cubes.filter((cube) => cubeNameMatches(cube, ["slat"]));
  if (existingSlats.length >= 4) {
    return cubes;
  }

  const bounds = cubeBounds(cubes);
  const seat = findFirst(cubes, ["seat"]);
  if (!seat) {
    return cubes;
  }

  const armrest = findFirst(cubes, ["armrest"]);
  const slatBottom = Math.max(bounds.min[1] + 2, Math.min(seat.from[1], seat.to[1]) - 2);
  const slatTop = armrest ? Math.min(armrest.from[1], armrest.to[1]) : Math.max(seat.from[1], seat.to[1]) + 4;
  const positions = [0.28, 0.5, 0.72];
  const leftX = bounds.min[0] + 1;
  const rightX = bounds.max[0] - 2;

  const newSlats = positions.flatMap((ratio, index) => {
    const z = Math.round(bounds.min[2] + ratio * (bounds.max[2] - bounds.min[2]) - 0.5);
    return [
      cubeFromBounds(
        `side_slat_left_${index + 1}`,
        [leftX, slatBottom, z],
        [leftX + 1, slatTop, z + 1],
        "primary",
        "Semantic repair added thin left side slat.",
      ),
      cubeFromBounds(
        `side_slat_right_${index + 1}`,
        [rightX, slatBottom, z],
        [rightX + 1, slatTop, z + 1],
        "primary",
        "Semantic repair added thin right side slat.",
      ),
    ];
  });

  return [...cubes, ...newSlats];
}

function addBackCushion(cubes: PlannedCube[]): PlannedCube[] {
  if (cubes.some((cube) => cubeNameMatches(cube, ["back_cushion"]))) {
    return cubes;
  }

  const seat = findFirst(cubes, ["seat"]);
  const back = findFirst(cubes, ["back"], ["cushion"]);
  if (!seat || !back) {
    return cubes;
  }

  const seatTop = Math.max(seat.from[1], seat.to[1]);
  const backMinX = Math.min(back.from[0], back.to[0]) + 1;
  const backMaxX = Math.max(back.from[0], back.to[0]) - 1;
  const backMaxZ = Math.max(back.from[2], back.to[2]);
  const backThickness = 3;
  const targetTopY = Math.max(Math.max(back.from[1], back.to[1]), seatTop + 8);

  return [
    ...cubes,
    cubeFromBounds(
      "back_cushion",
      [backMinX, seatTop, backMaxZ - backThickness],
      [backMaxX, targetTopY, backMaxZ],
      "secondary",
      "Semantic repair added separate back cushion block.",
    ),
  ];
}

function addSeatCushion(cubes: PlannedCube[]): PlannedCube[] {
  if (cubes.some((cube) => cubeNameMatches(cube, ["seat_cushion"]))) {
    return cubes;
  }

  const seat = findFirst(cubes, ["seat"]);
  if (!seat) {
    return cubes;
  }

  const xMin = Math.min(seat.from[0], seat.to[0]) + 1;
  const xMax = Math.max(seat.from[0], seat.to[0]) - 1;
  const zMin = Math.min(seat.from[2], seat.to[2]) + 1;
  const zMax = Math.max(seat.from[2], seat.to[2]) - 1;
  const seatTop = Math.max(seat.from[1], seat.to[1]);

  if (xMax - xMin < 2 || zMax - zMin < 2) {
    return cubes;
  }

  return [
    ...cubes,
    cubeFromBounds(
      "seat_cushion",
      [xMin, seatTop - 1, zMin],
      [xMax, seatTop + 2, zMax],
      "secondary",
      "Semantic repair added separate seat cushion block.",
    ),
  ];
}

function raiseBack(cubes: PlannedCube[]): PlannedCube[] {
  const armrests = cubes.filter((cube) => cubeNameMatches(cube, ["armrest"]));
  const back = findFirst(cubes, ["back_cushion"]) ?? findFirst(cubes, ["back"], ["support"]);

  if (!back || armrests.length === 0) {
    return cubes;
  }

  const armTop = maxY(armrests);
  const backTop = Math.max(back.from[1], back.to[1]);

  if (backTop > armTop + 1) {
    return cubes;
  }

  return cubes.map((cube) => {
    if (cube.name !== back.name) {
      return cube;
    }

    const nextTo: [number, number, number] = [...cube.to] as [number, number, number];
    const from = [...cube.from] as [number, number, number];
    const nextHeight = armTop + 3;

    if (nextTo[1] >= from[1]) {
      nextTo[1] = nextHeight;
    } else {
      from[1] = nextHeight;
    }

    return updateCubeBounds(cube, {
      from,
      to: nextTo,
    });
  });
}

function bedBounds(cubes: PlannedCube[]) {
  const bounds = cubeBounds(cubes);
  const frame = findFirst(cubes, ["bed_frame", "frame"]);
  const mattress = findFirst(cubes, ["mattress"]);
  const primarySlot =
    frame?.materialSlot ??
    findFirst(cubes, ["headboard", "footboard", "rail", "drawer", "post"])?.materialSlot ??
    "primary";
  const mattressBottom = mattress ? Math.min(mattress.from[1], mattress.to[1]) : bounds.min[1] + 6;
  const lowerTop = Math.max(bounds.min[1] + 4, mattressBottom - 1);

  return {
    bounds,
    frame,
    mattress,
    primarySlot,
    mattressBottom,
    lowerTop,
  };
}

function completeBedFrame(cubes: PlannedCube[]): PlannedCube[] {
  const { bounds, primarySlot, mattressBottom, lowerTop } = bedBounds(cubes);
  const xMin = bounds.min[0];
  const xMax = bounds.max[0];
  const zMin = bounds.min[2];
  const zMax = bounds.max[2];
  const groundY = bounds.min[1];
  const sideThickness = 1;
  const postThickness = 1;
  const supportTop = Math.max(groundY + 4, mattressBottom - 0.4);
  const next = [...cubes];

  if (!findFirst(cubes, ["mattress_support", "support_deck", "support_panel"])) {
    next.push(
      cubeFromBounds(
        "mattress_support",
        [xMin + 1, supportTop - 0.8, zMin + 1],
        [xMax - 1, supportTop, zMax - 1],
        primarySlot,
        "Bed repair added a continuous support deck beneath the mattress.",
      ),
    );
  }

  if (!findFirst(cubes, ["footboard", "front_board", "front_rail"])) {
    next.push(
      cubeFromBounds(
        "footboard",
        [xMin, groundY + 2, zMin],
        [xMax, lowerTop + 1, zMin + 1],
        primarySlot,
        "Bed repair added a front footboard to close the front silhouette.",
      ),
    );
  }

  if (!findFirst(cubes, ["rear_base_panel", "back_base_panel"])) {
    next.push(
      cubeFromBounds(
        "rear_base_panel",
        [xMin + 1, groundY + 1, zMax - 1],
        [xMax - 1, lowerTop, zMax],
        primarySlot,
        "Bed repair added a rear lower panel to stop the base reading as hollow from the back.",
      ),
    );
  }

  if (!findFirst(cubes, ["left_side_rail"])) {
    next.push(
      cubeFromBounds(
        "left_side_rail",
        [xMin, lowerTop - 1, zMin + 1],
        [xMin + sideThickness, lowerTop, zMax - 1],
        primarySlot,
        "Bed repair added a left upper side rail.",
      ),
    );
  }

  if (!findFirst(cubes, ["right_side_rail"])) {
    next.push(
      cubeFromBounds(
        "right_side_rail",
        [xMax - sideThickness, lowerTop - 1, zMin + 1],
        [xMax, lowerTop, zMax - 1],
        primarySlot,
        "Bed repair added a right upper side rail.",
      ),
    );
  }

  const existingPosts = cubes.filter((cube) => cubeNameMatches(cube, ["post"])).length;
  if (existingPosts < 4) {
    const postTop = lowerTop + 3;
    next.push(
      cubeFromBounds("front_left_post", [xMin, groundY, zMin], [xMin + postThickness, postTop, zMin + postThickness], primarySlot),
      cubeFromBounds("front_right_post", [xMax - postThickness, groundY, zMin], [xMax, postTop, zMin + postThickness], primarySlot),
      cubeFromBounds("back_left_post", [xMin, groundY, zMax - postThickness], [xMin + postThickness, postTop + 2, zMax], primarySlot),
      cubeFromBounds("back_right_post", [xMax - postThickness, groundY, zMax - postThickness], [xMax, postTop + 2, zMax], primarySlot),
    );
  }

  return next;
}

function closeBedSides(cubes: PlannedCube[]): PlannedCube[] {
  const { bounds, primarySlot, lowerTop } = bedBounds(cubes);
  const xMin = bounds.min[0];
  const xMax = bounds.max[0];
  const zMin = bounds.min[2];
  const zMax = bounds.max[2];
  const groundY = bounds.min[1];
  const next = [...cubes];

  if (!findFirst(cubes, ["left_side_panel"])) {
    next.push(
      cubeFromBounds(
        "left_side_panel",
        [xMin, groundY + 0.5, zMin + 1],
        [xMin + 1, lowerTop, zMax - 1],
        primarySlot,
        "Bed repair closed the left lower side.",
      ),
    );
  }

  if (!findFirst(cubes, ["right_side_panel"])) {
    next.push(
      cubeFromBounds(
        "right_side_panel",
        [xMax - 1, groundY + 0.5, zMin + 1],
        [xMax, lowerTop, zMax - 1],
        primarySlot,
        "Bed repair closed the right lower side.",
      ),
    );
  }

  return next;
}

function closeBedUnderside(cubes: PlannedCube[]): PlannedCube[] {
  if (findFirst(cubes, ["underside_panel", "base_panel", "plinth"])) {
    return cubes;
  }

  const { bounds, primarySlot } = bedBounds(cubes);

  return [
    ...cubes,
    cubeFromBounds(
      "underside_panel",
      [bounds.min[0] + 1, bounds.min[1], bounds.min[2] + 1],
      [bounds.max[0] - 1, bounds.min[1] + 1, bounds.max[2] - 1],
      primarySlot,
      "Bed repair added a lower underside closure panel.",
    ),
  ];
}

function embedDrawers(cubes: PlannedCube[]): PlannedCube[] {
  const { bounds } = bedBounds(cubes);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const depthTargetZ = Math.max(3, Math.round((bounds.max[2] - bounds.min[2]) * 0.24));
  const depthTargetX = Math.max(3, Math.round((bounds.max[0] - bounds.min[0]) * 0.24));

  return cubes.map((cube) => {
    if (!cubeNameMatches(cube, ["drawer"]) || cubeNameMatches(cube, ["handle"])) {
      return cube;
    }

    const [sizeX, , sizeZ] = cubeSize(cube);
    if (Math.min(sizeX, sizeZ) > 1.5) {
      return cube;
    }

    const from = [...cube.from] as [number, number, number];
    const to = [...cube.to] as [number, number, number];

    if (sizeZ <= sizeX) {
      const currentMin = Math.min(from[2], to[2]);
      const currentMax = Math.max(from[2], to[2]);

      if ((from[2] + to[2]) / 2 <= centerZ) {
        if (from[2] <= to[2]) {
          to[2] = Math.min(bounds.max[2] - 1, currentMin + depthTargetZ);
        } else {
          from[2] = Math.min(bounds.max[2] - 1, currentMin + depthTargetZ);
        }
      } else if (from[2] <= to[2]) {
        from[2] = Math.max(bounds.min[2] + 1, currentMax - depthTargetZ);
      } else {
        to[2] = Math.max(bounds.min[2] + 1, currentMax - depthTargetZ);
      }
    } else {
      const currentMin = Math.min(from[0], to[0]);
      const currentMax = Math.max(from[0], to[0]);

      if ((from[0] + to[0]) / 2 <= centerX) {
        if (from[0] <= to[0]) {
          to[0] = Math.min(bounds.max[0] - 1, currentMin + depthTargetX);
        } else {
          from[0] = Math.min(bounds.max[0] - 1, currentMin + depthTargetX);
        }
      } else if (from[0] <= to[0]) {
        from[0] = Math.max(bounds.min[0] + 1, currentMax - depthTargetX);
      } else {
        to[0] = Math.max(bounds.min[0] + 1, currentMax - depthTargetX);
      }
    }

    return updateCubeBounds(cube, {
      from,
      to,
    });
  });
}

export function applySemanticRepairHints(options: {
  cubes: PlannedCube[];
  assetType: string;
  repairHints: RepairPlanningHints;
}): PlannedCube[] {
  let cubes = options.cubes.map((cube) => ({ ...cube }));

  if (options.assetType === "chair") {
    if (options.repairHints.insetSeat) {
      cubes = applySeatInset(cubes);
    }

    if (options.repairHints.addArmrests) {
      cubes = addArmrestsAndSupports(cubes);
    }

    if (options.repairHints.addFrontBeam) {
      cubes = addFrontBeam(cubes);
    }

    if (options.repairHints.addSideSlats) {
      cubes = addSideSlats(cubes);
    }

    if (options.repairHints.addSeatCushion) {
      cubes = addSeatCushion(cubes);
    }

    if (options.repairHints.addBackCushion) {
      cubes = addBackCushion(cubes);
    }

    if (options.repairHints.raiseBack) {
      cubes = raiseBack(cubes);
    }
  }

  if (options.assetType === "bed") {
    if (options.repairHints.completeBedFrame) {
      cubes = completeBedFrame(cubes);
    }

    if (options.repairHints.closeBedSides) {
      cubes = closeBedSides(cubes);
    }

    if (options.repairHints.closeBedUnderside) {
      cubes = closeBedUnderside(cubes);
    }

    if (options.repairHints.embedDrawers) {
      cubes = embedDrawers(cubes);
    }
  }

  return cubes;
}
