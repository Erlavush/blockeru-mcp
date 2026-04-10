import type {
  BuildMutationPlan,
  BuildMutationSummary,
  BuildPlan,
  CubeDeleteResult,
  CubeResult,
  CubeSummary,
  PlannedCube,
  ProjectContents,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";

type InternalMutationOperation =
  | { type: "add_cube"; cube: PlannedCube; reason: string }
  | { type: "update_cube"; cube: PlannedCube; current: CubeSummary; reason: string }
  | { type: "delete_cube"; current: CubeSummary; reason: string }
  | { type: "keep_cube"; cube: PlannedCube; current: CubeSummary; reason: string };

export type MutationExecutionPlan = {
  mutationPlan: BuildMutationPlan;
  operations: InternalMutationOperation[];
};

export type MutationExecutionResult = {
  createdCubes: CubeResult[];
  updatedCubes: CubeSummary[];
  deletedCubes: CubeDeleteResult[];
  retainedCubes: CubeSummary[];
  finalRevision: number | null;
};

function listDuplicateNames(cubes: Array<Pick<PlannedCube, "name"> | Pick<CubeSummary, "name">>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const cube of cubes) {
    if (seen.has(cube.name)) {
      duplicates.add(cube.name);
    } else {
      seen.add(cube.name);
    }
  }

  return Array.from(duplicates).sort();
}

function stripMutationScope(scope: string, cubeName: string): string {
  const prefix = `${scope}::`;
  return cubeName.startsWith(prefix) ? cubeName.slice(prefix.length) : cubeName;
}

function getManagedScopePrefix(scope: string): string {
  return `${scope}::`;
}

function getManagedCubes(contents: ProjectContents, scope: string): CubeSummary[] {
  const prefix = getManagedScopePrefix(scope);
  return contents.cubes.filter((cube) => cube.name.startsWith(prefix));
}

function buildLegacyCubeIndex(contents: ProjectContents, plan: BuildPlan): Map<string, CubeSummary> {
  const legacyByScopedName = new Map<string, CubeSummary>();

  for (const cube of contents.cubes) {
    for (const plannedCube of plan.cubes) {
      if (cube.name === stripMutationScope(plan.mutationScope, plannedCube.name)) {
        legacyByScopedName.set(plannedCube.name, cube);
      }
    }
  }

  return legacyByScopedName;
}

function listLegacyCubeNames(plan: BuildPlan): Set<string> {
  return new Set(plan.cubes.map((cube) => stripMutationScope(plan.mutationScope, cube.name)));
}

function areVectorsEqual(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function needsCubeUpdate(options: {
  current: CubeSummary;
  cube: PlannedCube;
  boxUv: boolean;
  desiredTextureRef: string | null;
}): boolean {
  if (options.current.name !== options.cube.name) {
    return true;
  }

  if (!areVectorsEqual(options.current.from, options.cube.from)) {
    return true;
  }

  if (!areVectorsEqual(options.current.to, options.cube.to)) {
    return true;
  }

  if (!areVectorsEqual(options.current.origin, options.cube.origin)) {
    return true;
  }

  if (options.current.boxUv !== options.boxUv) {
    return true;
  }

  if (options.current.textureRef !== options.desiredTextureRef) {
    return true;
  }

  // Project contents do not expose per-face UVs, so non-box-UV plans must refresh
  // managed cubes to guarantee deterministic face layout after repair passes.
  if (!options.boxUv) {
    return true;
  }

  return false;
}

export function planProjectMutation(options: {
  contents: ProjectContents;
  plan: BuildPlan;
  desiredTextureRef: string | null;
}): MutationExecutionPlan {
  const duplicateCurrentCubeNames = listDuplicateNames(options.contents.cubes);
  const duplicatePlannedCubeNames = listDuplicateNames(options.plan.cubes);
  const managedCubes = getManagedCubes(options.contents, options.plan.mutationScope);
  const legacyCubeIndex = buildLegacyCubeIndex(options.contents, options.plan);
  const legacyCubeNames = listLegacyCubeNames(options.plan);
  const canUseLegacyPatch =
    managedCubes.length === 0 &&
    options.contents.project.name === options.plan.projectName &&
    options.contents.cubes.length > 0;
  const foreignCubeCount = canUseLegacyPatch
    ? options.contents.cubes.filter((cube) => !legacyCubeNames.has(cube.name)).length
    : options.contents.cubes.length - managedCubes.length;
  const patchEligible =
    duplicateCurrentCubeNames.length === 0 &&
    duplicatePlannedCubeNames.length === 0 &&
    (options.contents.cubes.length === 0 ||
      managedCubes.length > 0 ||
      (canUseLegacyPatch && foreignCubeCount === 0));

  const fallbackReason =
    duplicateCurrentCubeNames.length > 0
      ? `Current project contains duplicate cube names: ${duplicateCurrentCubeNames.join(", ")}.`
      : duplicatePlannedCubeNames.length > 0
        ? `Generated plan contains duplicate cube names: ${duplicatePlannedCubeNames.join(", ")}.`
        : options.contents.cubes.length > 0 && managedCubes.length === 0 && !canUseLegacyPatch
          ? "Current project does not expose the managed mutation scope for this asset, so a safe patch target cannot be identified."
          : canUseLegacyPatch && foreignCubeCount > 0
            ? "Current project mixes legacy unscoped generated cubes with unrelated cubes, so patching would not be revision-safe."
            : null;

  const strategy: BuildMutationPlan["strategy"] = patchEligible ? "patch" : "rebuild";
  const currentByName = new Map(options.contents.cubes.map((cube) => [cube.name, cube]));
  const matchedCurrentUuids = new Set<string>();
  const operations: InternalMutationOperation[] = [];

  for (const cube of options.plan.cubes) {
    const current =
      currentByName.get(cube.name) ??
      (patchEligible && managedCubes.length === 0 ? legacyCubeIndex.get(cube.name) : undefined);

    if (!current) {
      operations.push({
        type: "add_cube",
        cube,
        reason: "Cube is missing from the managed project scope.",
      });
      continue;
    }

    matchedCurrentUuids.add(current.uuid);

    if (
      needsCubeUpdate({
        current,
        cube,
        boxUv: options.plan.boxUv,
        desiredTextureRef: options.desiredTextureRef,
      })
    ) {
      operations.push({
        type: "update_cube",
        cube,
        current,
        reason:
          current.name === cube.name
            ? "Cube geometry, UV mode, or texture assignment differs from the planned state."
            : "Legacy cube name is being migrated into the managed mutation scope.",
      });
      continue;
    }

    operations.push({
      type: "keep_cube",
      cube,
      current,
      reason: "Cube already matches the planned managed state.",
    });
  }

  const currentDeletionPool =
    patchEligible && managedCubes.length === 0 && canUseLegacyPatch
      ? options.contents.cubes
      : managedCubes;

  for (const cube of currentDeletionPool) {
    if (!matchedCurrentUuids.has(cube.uuid)) {
      operations.push({
        type: "delete_cube",
        current: cube,
        reason: "Managed cube is no longer present in the planned asset.",
      });
    }
  }

  return {
    mutationPlan: {
      strategy,
      scope: options.plan.mutationScope,
      targetProjectName: options.plan.projectName,
      targetTextureName: options.desiredTextureRef === null ? null : options.plan.managedTextureName,
      safety: {
        patchEligible,
        managedCubeCount: managedCubes.length,
        foreignCubeCount,
        duplicateCurrentCubeNames,
        duplicatePlannedCubeNames,
        fallbackReason,
      },
      operations: operations.map((operation) => ({
        type: operation.type,
        cubeName:
          operation.type === "delete_cube" ? operation.current.name : operation.cube.name,
        targetUuid:
          operation.type === "add_cube" ? null : operation.current.uuid,
        targetName:
          operation.type === "add_cube" ? null : operation.current.name,
        reason: operation.reason,
      })),
    },
    operations,
  };
}

export async function applyProjectMutationPlan(options: {
  bridge: BridgeClient;
  plan: BuildPlan;
  executionPlan: MutationExecutionPlan;
  desiredTextureRef: string | null;
  currentRevision: number | null;
}): Promise<MutationExecutionResult> {
  const createdCubes: CubeResult[] = [];
  const updatedCubes: CubeSummary[] = [];
  const deletedCubes: CubeDeleteResult[] = [];
  const retainedCubes: CubeSummary[] = [];
  let revision = options.currentRevision;

  for (const operation of options.executionPlan.operations) {
    switch (operation.type) {
      case "add_cube": {
        const created = await options.bridge.addCube({
          name: operation.cube.name,
          from: operation.cube.from,
          to: operation.cube.to,
          origin: operation.cube.origin,
          uvOffset: operation.cube.uvOffset,
          faces: operation.cube.faces,
          boxUv: options.plan.boxUv,
          textureRef: options.desiredTextureRef ?? undefined,
          ifRevision: revision ?? undefined,
        });
        createdCubes.push(created);
        revision = created.revision;
        break;
      }

      case "update_cube": {
        const updated = await options.bridge.updateCube({
          target: { uuid: operation.current.uuid },
          name: operation.cube.name,
          from: operation.cube.from,
          to: operation.cube.to,
          origin: operation.cube.origin,
          uvOffset: operation.cube.uvOffset,
          faces: operation.cube.faces,
          boxUv: options.plan.boxUv,
          textureRef: options.desiredTextureRef,
          ifRevision: revision ?? undefined,
        });
        updatedCubes.push(updated);
        revision = updated.revision;
        break;
      }

      case "delete_cube": {
        const deleted = await options.bridge.deleteCube({
          target: { uuid: operation.current.uuid },
          ifRevision: revision ?? undefined,
        });
        deletedCubes.push(deleted);
        revision = deleted.revision;
        break;
      }

      case "keep_cube":
        retainedCubes.push(operation.current);
        break;
    }
  }

  return {
    createdCubes,
    updatedCubes,
    deletedCubes,
    retainedCubes,
    finalRevision: revision,
  };
}

export function buildMutationSummary(options: {
  mutationPlan: BuildMutationPlan;
  executionResult: MutationExecutionResult;
  textureCreated: boolean;
  textureAction: "none" | "created" | "updated" | "reused";
  deletedTextureCount: number;
  managedTextureUuid: string | null;
}): BuildMutationSummary {
  return {
    strategy: options.mutationPlan.strategy,
    scope: options.mutationPlan.scope,
    addedCubeCount: options.executionResult.createdCubes.length,
    updatedCubeCount: options.executionResult.updatedCubes.length,
    deletedCubeCount: options.executionResult.deletedCubes.length,
    retainedCubeCount: options.executionResult.retainedCubes.length,
    textureCreated: options.textureCreated,
    textureAction: options.textureAction,
    deletedTextureCount: options.deletedTextureCount,
    managedTextureUuid: options.managedTextureUuid,
    finalRevision: options.executionResult.finalRevision,
  };
}

export function filterManagedProjectCubes(contents: ProjectContents, scope: string): CubeSummary[] {
  return getManagedCubes(contents, scope);
}
