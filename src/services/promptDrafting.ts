import type { AssetSpec } from "../contracts/schemas.js";

const CATEGORY_DEFAULTS: Record<
  string,
  { size: [number, number, number]; materials: string[]; parts: AssetSpec["parts"] }
> = {
  chair: {
    size: [16, 24, 16],
    materials: ["wood"],
    parts: [
      { name: "seat", shape: "slab", size: [12, 2, 12], material: "wood" },
      { name: "backrest", shape: "panel", size: [12, 12, 2], material: "wood" },
      {
        name: "legs",
        shape: "rod",
        size: [2, 12, 2],
        material: "wood",
        notes: "Mirror four legs from one template.",
      },
    ],
  },
  table: {
    size: [16, 16, 16],
    materials: ["wood"],
    parts: [
      { name: "top", shape: "slab", size: [16, 2, 16], material: "wood" },
      {
        name: "legs",
        shape: "rod",
        size: [2, 14, 2],
        material: "wood",
        notes: "Mirror four legs from one template.",
      },
    ],
  },
  lamp: {
    size: [10, 20, 10],
    materials: ["metal", "fabric"],
    parts: [
      { name: "base", shape: "cube", size: [6, 2, 6], material: "metal" },
      { name: "stem", shape: "rod", size: [2, 12, 2], material: "metal" },
      { name: "shade", shape: "cluster", size: [10, 6, 10], material: "fabric" },
    ],
  },
  shelf: {
    size: [16, 24, 6],
    materials: ["wood"],
    parts: [
      {
        name: "side_panels",
        shape: "panel",
        size: [2, 24, 6],
        material: "wood",
        notes: "Mirror left and right.",
      },
      {
        name: "shelves",
        shape: "panel",
        size: [12, 2, 6],
        material: "wood",
        notes: "Repeat 2 to 4 shelves.",
      },
    ],
  },
  cabinet: {
    size: [16, 24, 8],
    materials: ["wood", "metal"],
    parts: [
      { name: "body", shape: "cube", size: [16, 24, 8], material: "wood" },
      {
        name: "doors",
        shape: "panel",
        size: [7, 20, 1],
        material: "wood",
        notes: "Mirror left and right doors.",
      },
      {
        name: "handles",
        shape: "rod",
        size: [1, 3, 1],
        material: "metal",
        notes: "Use metal accent color.",
      },
    ],
  },
  bed: {
    size: [16, 16, 24],
    materials: ["wood", "fabric"],
    parts: [
      { name: "frame", shape: "cube", size: [16, 8, 24], material: "wood" },
      { name: "mattress", shape: "slab", size: [14, 4, 22], material: "fabric" },
      { name: "headboard", shape: "panel", size: [16, 8, 2], material: "wood" },
    ],
  },
};

const COLOR_WORDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "teal",
  "cyan",
  "purple",
  "pink",
  "brown",
  "black",
  "white",
  "gray",
  "grey",
  "gold",
  "silver",
  "beige",
];

const MATERIAL_WORDS = ["wood", "metal", "stone", "fabric", "glass", "plastic", "ceramic"];

function detectAssetType(prompt: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes("sofa")) {
    return "chair";
  }

  if (lower.includes("stool")) {
    return "chair";
  }

  if (lower.includes("desk")) {
    return "table";
  }

  if (
    lower.includes("nightstand") ||
    lower.includes("bedside") ||
    lower.includes("drawer") ||
    lower.includes("dresser")
  ) {
    return "cabinet";
  }

  if (lower.includes("bookshelf") || lower.includes("shelving")) {
    return "shelf";
  }

  for (const key of Object.keys(CATEGORY_DEFAULTS)) {
    if (lower.includes(key)) {
      return key;
    }
  }

  return "prop";
}

function collectWords(prompt: string, words: string[]): string[] {
  const lower = prompt.toLowerCase();
  return words.filter((word) => lower.includes(word));
}

export function draftAssetSpecFromPrompt(prompt: string, formatId: string): AssetSpec {
  const assetType = detectAssetType(prompt);
  const defaults = CATEGORY_DEFAULTS[assetType] ?? {
    size: [16, 16, 16] as [number, number, number],
    materials: ["wood"],
    parts: [
      {
        name: "main_body",
        shape: "cube" as const,
        size: [12, 12, 12] as [number, number, number],
        material: "wood",
        notes: "Start with a single silhouette cube and refine from there.",
      },
    ],
  };

  const lower = prompt.toLowerCase();
  const palette = collectWords(prompt, COLOR_WORDS);
  const promptMaterials = collectWords(prompt, MATERIAL_WORDS);
  const materials = Array.from(new Set([...defaults.materials, ...promptMaterials]));
  const hasFabricCue =
    lower.includes("cushion") ||
    lower.includes("pillow") ||
    lower.includes("upholstered") ||
    lower.includes("fabric");

  if (hasFabricCue && !materials.includes("fabric")) {
    materials.push("fabric");
  }

  const parts = defaults.parts.map((part) => ({ ...part }));

  if (assetType === "chair" && hasFabricCue) {
    const seat = parts.find((part) => part.name === "seat");
    const backrest = parts.find((part) => part.name === "backrest");

    if (seat) {
      seat.material = "fabric";
      seat.notes = `${seat.notes ? `${seat.notes} ` : ""}Treat the seat as a cushioned surface.`;
    }

    if (backrest && lower.includes("upholstered")) {
      backrest.material = "fabric";
    }
  }

  return {
    assetType,
    style: lower.includes("minecraft") || lower.includes("voxel") ? "voxel" : "blockbench-low-poly",
    targetFormat: formatId,
    estimatedSize: defaults.size,
    symmetry: lower.includes("symmetrical") || lower.includes("symmetric") ? "mirror_x" : "none",
    materials,
    palette: palette.length > 0 ? palette : ["natural"],
    parts,
    textureStrategy:
      lower.includes("clean") || lower.includes("minimal")
        ? "Use flat colors with light edge contrast and minimal noise."
        : "Use a stylized hand-painted texture with simple material breakup.",
    constraints: [
      "Prefer cube-friendly silhouettes.",
      "Keep UV layout simple enough for one texture sheet.",
      "Bias toward mirrored parts where possible.",
    ],
  };
}
