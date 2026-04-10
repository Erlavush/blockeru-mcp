import type {
  DiffProjectSnapshotsResult,
  ProjectSnapshot,
  ProjectSnapshotCube,
  ProjectSnapshotTexture,
  SnapshotDiffEntry,
} from "../contracts/schemas.js";

function stringify(value: unknown): string {
  return JSON.stringify(value);
}

function pushAddedOrRemoved<T extends { name: string }>(
  entries: SnapshotDiffEntry[],
  kind: "added" | "removed",
  items: T[],
): void {
  for (const item of items) {
    entries.push({
      name: item.name,
      kind,
      details: [],
    });
  }
}

function diffCube(before: ProjectSnapshotCube, after: ProjectSnapshotCube): string[] {
  const changes: string[] = [];

  if (stringify(before.from) !== stringify(after.from)) {
    changes.push("from");
  }
  if (stringify(before.to) !== stringify(after.to)) {
    changes.push("to");
  }
  if (stringify(before.origin) !== stringify(after.origin)) {
    changes.push("origin");
  }
  if (stringify(before.uvOffset) !== stringify(after.uvOffset)) {
    changes.push("uvOffset");
  }
  if (stringify(before.faces) !== stringify(after.faces)) {
    changes.push("faces");
  }
  if (before.colorIndex !== after.colorIndex) {
    changes.push("colorIndex");
  }
  if (before.boxUv !== after.boxUv) {
    changes.push("boxUv");
  }
  if (before.textureRef !== after.textureRef) {
    changes.push("textureRef");
  }
  if (stringify(before.parentPath) !== stringify(after.parentPath)) {
    changes.push("parentPath");
  }

  return changes;
}

function diffTexture(before: ProjectSnapshotTexture, after: ProjectSnapshotTexture): string[] {
  const changes: string[] = [];

  if (before.width !== after.width || before.height !== after.height) {
    changes.push("size");
  }
  if (before.useAsDefault !== after.useAsDefault) {
    changes.push("useAsDefault");
  }
  if (before.dataUrl !== after.dataUrl) {
    changes.push("dataUrl");
  }

  return changes;
}

function diffNamedCollection<T extends { name: string }>(
  beforeItems: T[],
  afterItems: T[],
  diffItem: (before: T, after: T) => string[],
): SnapshotDiffEntry[] {
  const entries: SnapshotDiffEntry[] = [];
  const beforeByName = new Map(beforeItems.map((item) => [item.name, item]));
  const afterByName = new Map(afterItems.map((item) => [item.name, item]));

  pushAddedOrRemoved(
    entries,
    "added",
    afterItems.filter((item) => !beforeByName.has(item.name)),
  );
  pushAddedOrRemoved(
    entries,
    "removed",
    beforeItems.filter((item) => !afterByName.has(item.name)),
  );

  for (const [name, before] of beforeByName.entries()) {
    const after = afterByName.get(name);

    if (!after) {
      continue;
    }

    const details = diffItem(before, after);
    if (details.length > 0) {
      entries.push({
        name,
        kind: "updated",
        details,
      });
    }
  }

  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export function diffProjectSnapshots(options: {
  before: ProjectSnapshot;
  after: ProjectSnapshot;
}): DiffProjectSnapshotsResult {
  const cubeDiffs = diffNamedCollection(options.before.cubes, options.after.cubes, diffCube);
  const textureDiffs = diffNamedCollection(
    options.before.textures,
    options.after.textures,
    diffTexture,
  );

  return {
    cubeDiffs,
    textureDiffs,
    cubeChangeCount: cubeDiffs.length,
    textureChangeCount: textureDiffs.length,
  };
}
