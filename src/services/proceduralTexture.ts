import { Buffer } from "node:buffer";
import { PNG } from "pngjs";
import type { AssetSpec, BuildPlan, GeneratedTextureAtlas } from "../contracts/schemas.js";

type Rgb = { r: number; g: number; b: number };

const NAMED_COLORS: Record<string, Rgb> = {
  red: { r: 180, g: 56, b: 46 },
  orange: { r: 201, g: 120, b: 51 },
  yellow: { r: 214, g: 191, b: 74 },
  green: { r: 86, g: 131, b: 82 },
  blue: { r: 69, g: 109, b: 173 },
  teal: { r: 59, g: 142, b: 137 },
  cyan: { r: 78, g: 177, b: 191 },
  purple: { r: 121, g: 88, b: 164 },
  pink: { r: 194, g: 110, b: 146 },
  brown: { r: 122, g: 84, b: 58 },
  black: { r: 44, g: 44, b: 49 },
  white: { r: 212, g: 212, b: 212 },
  gray: { r: 129, g: 133, b: 143 },
  grey: { r: 129, g: 133, b: 143 },
  gold: { r: 197, g: 162, b: 73 },
  silver: { r: 169, g: 175, b: 184 },
  beige: { r: 188, g: 167, b: 129 },
};

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: clampChannel(a.r + (b.r - a.r) * t),
    g: clampChannel(a.g + (b.g - a.g) * t),
    b: clampChannel(a.b + (b.b - a.b) * t),
  };
}

function darken(color: Rgb, amount: number): Rgb {
  return mix(color, { r: 0, g: 0, b: 0 }, amount);
}

function lighten(color: Rgb, amount: number): Rgb {
  return mix(color, { r: 255, g: 255, b: 255 }, amount);
}

function hash(seed: string, x: number, y: number): number {
  let value = 2166136261;
  const fullSeed = `${seed}:${x}:${y}`;

  for (let index = 0; index < fullSeed.length; index += 1) {
    value ^= fullSeed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return (value >>> 0) / 4294967295;
}

function resolveBaseColor(material: string, colorHint: string): Rgb {
  const lowerMaterial = material.toLowerCase();
  const lowerHint = colorHint.toLowerCase();

  if (lowerMaterial === "wood") {
    return NAMED_COLORS.brown;
  }

  if (lowerMaterial === "metal") {
    return NAMED_COLORS.silver;
  }

  if (lowerMaterial === "stone") {
    return NAMED_COLORS.gray;
  }

  if (lowerMaterial === "fabric") {
    return NAMED_COLORS[lowerHint] ?? NAMED_COLORS.blue;
  }

  if (lowerMaterial === "glass") {
    return lighten(NAMED_COLORS.cyan, 0.15);
  }

  return NAMED_COLORS[lowerHint] ?? NAMED_COLORS.beige;
}

function paintPixel(png: PNG, x: number, y: number, color: Rgb): void {
  const index = (png.width * y + x) << 2;
  png.data[index] = color.r;
  png.data[index + 1] = color.g;
  png.data[index + 2] = color.b;
  png.data[index + 3] = 255;
}

function paintTile(
  png: PNG,
  xOffset: number,
  yOffset: number,
  tileSize: number,
  material: string,
  colorHint: string,
  seed: string,
): void {
  const base = resolveBaseColor(material, colorHint);
  const edge = darken(base, 0.2);
  const highlight = lighten(base, 0.08);

  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      let color = base;
      const noise = hash(seed, x, y);

      switch (material) {
        case "wood": {
          const grainBand = Math.sin((y + noise * 4) / 6) * 0.08;
          color = mix(base, darken(base, 0.18), 0.22 + grainBand);
          break;
        }
        case "metal": {
          const brushed = ((x + y) % 6) / 12;
          color = mix(base, highlight, brushed);
          if (noise > 0.96) {
            color = darken(base, 0.22);
          }
          break;
        }
        case "stone": {
          color = noise > 0.82 ? darken(base, 0.22) : noise < 0.08 ? lighten(base, 0.18) : base;
          break;
        }
        case "fabric": {
          const weave = (x % 4 === 0 || y % 4 === 0) ? 0.14 : 0;
          color = mix(base, darken(base, 0.2), weave + noise * 0.08);
          break;
        }
        case "glass": {
          const gradient = y / tileSize;
          color = mix(lighten(base, 0.15), darken(base, 0.12), gradient * 0.7);
          if ((x + y) % 19 === 0) {
            color = lighten(color, 0.2);
          }
          break;
        }
        default: {
          color = noise > 0.9 ? darken(base, 0.18) : noise < 0.1 ? lighten(base, 0.1) : base;
          break;
        }
      }

      if (x === 0 || y === 0 || x === tileSize - 1 || y === tileSize - 1) {
        color = edge;
      } else if (x === 1 || y === 1) {
        color = highlight;
      }

      paintPixel(png, xOffset + x, yOffset + y, color);
    }
  }
}

export function generateMaterialAtlas(spec: AssetSpec, plan: BuildPlan): GeneratedTextureAtlas {
  const png = new PNG({
    width: plan.textureWidth,
    height: plan.textureHeight,
  });
  const tileWidth = Math.floor(plan.textureWidth / 2);
  const tileHeight = Math.floor(plan.textureHeight / 2);
  const tileSize = Math.min(tileWidth, tileHeight);

  for (const slot of plan.materialSlots) {
    paintTile(
      png,
      slot.uvOffset[0],
      slot.uvOffset[1],
      tileSize,
      slot.material,
      slot.colorHint,
      `${spec.assetType}:${slot.slotId}:${slot.colorHint}`,
    );
  }

  const dataUrl = `data:image/png;base64,${Buffer.from(PNG.sync.write(png)).toString("base64")}`;

  return {
    name: `${plan.projectName}-atlas`,
    width: plan.textureWidth,
    height: plan.textureHeight,
    dataUrl,
    materialSlots: plan.materialSlots,
  };
}
