import { Buffer } from "node:buffer";
import { PNG } from "pngjs";
import type {
  ImageObservationGuidance,
  PixelRect,
  ReferenceImageAnalysis,
  ReferenceImageBackgroundMode,
  ReferenceImageInput,
  ReferenceImagePartAnalysis,
} from "../contracts/schemas.js";

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type SegmentedImage = {
  width: number;
  height: number;
  mask: Uint8Array;
  backgroundModeUsed: ReferenceImageBackgroundMode;
  backgroundColorUsed: string | null;
  foregroundBounds: PixelRect | null;
  foregroundCoverage: number;
  dominantColors: string[];
  materialColorHints: Record<string, string>;
  partAnalyses: ReferenceImagePartAnalysis[];
  warnings: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHexColor(hex: string): Rgba {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 255,
  };
}

function toHex(color: Pick<Rgba, "r" | "g" | "b">): string {
  return `#${[color.r, color.g, color.b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function colorDistance(a: Pick<Rgba, "r" | "g" | "b">, b: Pick<Rgba, "r" | "g" | "b">): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function pixelAt(png: PNG, x: number, y: number): Rgba {
  const index = (png.width * y + x) << 2;
  return {
    r: png.data[index] ?? 0,
    g: png.data[index + 1] ?? 0,
    b: png.data[index + 2] ?? 0,
    a: png.data[index + 3] ?? 0,
  };
}

function decodeReferenceImage(dataUrl: string): PNG {
  if (!dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("Reference image analysis currently supports PNG data URLs.");
  }

  const base64 = dataUrl.slice("data:image/png;base64,".length);
  return PNG.sync.read(Buffer.from(base64, "base64"));
}

function averageColors(colors: Rgba[]): Rgba {
  if (colors.length === 0) {
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  const total = colors.reduce(
    (sum, color) => ({
      r: sum.r + color.r,
      g: sum.g + color.g,
      b: sum.b + color.b,
      a: sum.a + color.a,
    }),
    { r: 0, g: 0, b: 0, a: 0 },
  );

  return {
    r: total.r / colors.length,
    g: total.g / colors.length,
    b: total.b / colors.length,
    a: total.a / colors.length,
  };
}

function sampleCornerAverage(png: PNG): Rgba {
  const sampleRadius = Math.max(1, Math.min(4, Math.floor(Math.min(png.width, png.height) / 16)));
  const colors: Rgba[] = [];
  const corners: Array<[number, number]> = [
    [0, 0],
    [Math.max(0, png.width - sampleRadius), 0],
    [0, Math.max(0, png.height - sampleRadius)],
    [Math.max(0, png.width - sampleRadius), Math.max(0, png.height - sampleRadius)],
  ];

  for (const [startX, startY] of corners) {
    for (let y = startY; y < Math.min(png.height, startY + sampleRadius); y += 1) {
      for (let x = startX; x < Math.min(png.width, startX + sampleRadius); x += 1) {
        colors.push(pixelAt(png, x, y));
      }
    }
  }

  return averageColors(colors);
}

function toHsl(color: Pick<Rgba, "r" | "g" | "b">): { h: number; s: number; l: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;

  switch (max) {
    case r:
      h = ((g - b) / delta) % 6;
      break;
    case g:
      h = (b - r) / delta + 2;
      break;
    default:
      h = (r - g) / delta + 4;
      break;
  }

  h *= 60;
  if (h < 0) {
    h += 360;
  }

  return { h, s, l };
}

function isGreenscreenLike(color: Pick<Rgba, "r" | "g" | "b">): boolean {
  const hsl = toHsl(color);
  return (
    hsl.h >= 70 &&
    hsl.h <= 160 &&
    hsl.s >= 0.4 &&
    hsl.l >= 0.25 &&
    color.g > color.r * 1.15 &&
    color.g > color.b * 1.1
  );
}

function chooseBackgroundMode(
  png: PNG,
  input: ReferenceImageInput,
): { mode: ReferenceImageBackgroundMode; color: Rgba | null; colorHex: string | null } {
  const explicitColor = input.backgroundColor ? parseHexColor(input.backgroundColor) : null;
  const cornerColor = sampleCornerAverage(png);

  if (input.backgroundMode === "color_key") {
    return {
      mode: "color_key",
      color: explicitColor ?? cornerColor,
      colorHex: toHex(explicitColor ?? cornerColor),
    };
  }

  if (input.backgroundMode === "greenscreen") {
    return {
      mode: "greenscreen",
      color: explicitColor ?? cornerColor,
      colorHex: toHex(explicitColor ?? cornerColor),
    };
  }

  if (input.backgroundMode === "alpha") {
    return {
      mode: "alpha",
      color: null,
      colorHex: null,
    };
  }

  if (explicitColor) {
    return {
      mode: "color_key",
      color: explicitColor,
      colorHex: toHex(explicitColor),
    };
  }

  if (isGreenscreenLike(cornerColor)) {
    return {
      mode: "greenscreen",
      color: cornerColor,
      colorHex: toHex(cornerColor),
    };
  }

  return {
    mode: "color_key",
    color: cornerColor,
    colorHex: toHex(cornerColor),
  };
}

function isBackgroundPixel(
  color: Rgba,
  mode: ReferenceImageBackgroundMode,
  backgroundColor: Rgba | null,
  tolerance: number,
): boolean {
  if (color.a <= 12) {
    return true;
  }

  switch (mode) {
    case "alpha":
      return color.a <= 12;
    case "greenscreen":
      return (
        isGreenscreenLike(color) ||
        (backgroundColor !== null && colorDistance(color, backgroundColor) <= tolerance * 0.9)
      );
    case "color_key":
      return backgroundColor !== null && colorDistance(color, backgroundColor) <= tolerance;
    case "auto":
    default:
      return (
        (backgroundColor !== null && colorDistance(color, backgroundColor) <= tolerance) ||
        isGreenscreenLike(color)
      );
  }
}

function buildBackgroundMask(
  png: PNG,
  mode: ReferenceImageBackgroundMode,
  backgroundColor: Rgba | null,
  tolerance: number,
): Uint8Array {
  const width = png.width;
  const height = png.height;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const tryPush = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const index = y * width + x;
    if (visited[index] === 1) {
      return;
    }

    const color = pixelAt(png, x, y);
    if (!isBackgroundPixel(color, mode, backgroundColor, tolerance)) {
      return;
    }

    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    tryPush(x, 0);
    tryPush(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    tryPush(0, y);
    tryPush(width - 1, y);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    const x = index % width;
    const y = Math.floor(index / width);
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  return visited;
}

function getForegroundBounds(
  png: PNG,
  backgroundMask: Uint8Array,
  cropPadding: number,
): { bounds: PixelRect | null; coverage: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let foregroundCount = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = y * png.width + x;
      const color = pixelAt(png, x, y);

      if (backgroundMask[index] === 1 || color.a <= 12) {
        continue;
      }

      foregroundCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (foregroundCount === 0) {
    return {
      bounds: null,
      coverage: 0,
    };
  }

  const paddedMinX = clamp(minX - cropPadding, 0, png.width - 1);
  const paddedMinY = clamp(minY - cropPadding, 0, png.height - 1);
  const paddedMaxX = clamp(maxX + cropPadding, 0, png.width - 1);
  const paddedMaxY = clamp(maxY + cropPadding, 0, png.height - 1);

  return {
    bounds: {
      x: paddedMinX,
      y: paddedMinY,
      width: paddedMaxX - paddedMinX + 1,
      height: paddedMaxY - paddedMinY + 1,
    },
    coverage: Number((foregroundCount / (png.width * png.height)).toFixed(6)),
  };
}

function dominantColorsFromPixels(pixels: Rgba[], limit = 6): string[] {
  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

  for (const pixel of pixels) {
    if (pixel.a <= 12) {
      continue;
    }

    const key = `${Math.round(pixel.r / 24)}:${Math.round(pixel.g / 24)}:${Math.round(pixel.b / 24)}`;
    const entry = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    entry.count += 1;
    entry.r += pixel.r;
    entry.g += pixel.g;
    entry.b += pixel.b;
    buckets.set(key, entry);
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const colors: string[] = [];

  for (const entry of sorted) {
    const color = toHex({
      r: entry.r / entry.count,
      g: entry.g / entry.count,
      b: entry.b / entry.count,
    });
    const rgb = parseHexColor(color);

    if (colors.some((existing) => colorDistance(rgb, parseHexColor(existing)) < 18)) {
      continue;
    }

    colors.push(color);
    if (colors.length >= limit) {
      break;
    }
  }

  return colors;
}

function collectForegroundPixels(
  png: PNG,
  backgroundMask: Uint8Array,
  rect?: PixelRect | null,
): Rgba[] {
  const startX = rect ? clamp(Math.floor(rect.x), 0, png.width - 1) : 0;
  const startY = rect ? clamp(Math.floor(rect.y), 0, png.height - 1) : 0;
  const endX = rect
    ? clamp(Math.ceil(rect.x + rect.width), 0, png.width)
    : png.width;
  const endY = rect
    ? clamp(Math.ceil(rect.y + rect.height), 0, png.height)
    : png.height;
  const pixels: Rgba[] = [];

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = y * png.width + x;
      const pixel = pixelAt(png, x, y);

      if (backgroundMask[index] === 1 || pixel.a <= 12) {
        continue;
      }

      pixels.push(pixel);
    }
  }

  return pixels;
}

function fitForegroundRect(
  png: PNG,
  backgroundMask: Uint8Array,
  rect: PixelRect,
): { fittedRect: PixelRect | null; occupancyRatio: number } {
  const startX = clamp(Math.floor(rect.x), 0, png.width - 1);
  const startY = clamp(Math.floor(rect.y), 0, png.height - 1);
  const endX = clamp(Math.ceil(rect.x + rect.width), 0, png.width);
  const endY = clamp(Math.ceil(rect.y + rect.height), 0, png.height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let foregroundCount = 0;
  const area = Math.max(1, (endX - startX) * (endY - startY));

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = y * png.width + x;
      const pixel = pixelAt(png, x, y);

      if (backgroundMask[index] === 1 || pixel.a <= 12) {
        continue;
      }

      foregroundCount += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (foregroundCount === 0) {
    return {
      fittedRect: null,
      occupancyRatio: 0,
    };
  }

  return {
    fittedRect: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    occupancyRatio: Number((foregroundCount / area).toFixed(6)),
  };
}

function inferMaterialKeyFromPartName(partName: string): string | null {
  const lower = partName.toLowerCase();

  if (
    lower.includes("seat") ||
    lower.includes("back") ||
    lower.includes("cushion") ||
    lower.includes("upholster")
  ) {
    return "fabric";
  }

  if (
    lower.includes("leg") ||
    lower.includes("frame") ||
    lower.includes("beam") ||
    lower.includes("arm") ||
    lower.includes("slat") ||
    lower.includes("support")
  ) {
    return "wood";
  }

  if (lower.includes("handle") || lower.includes("knob") || lower.includes("metal")) {
    return "metal";
  }

  return null;
}

function pickColorByHeuristic(
  colors: string[],
  predicate: (color: Rgba, hsl: ReturnType<typeof toHsl>) => boolean,
): string | null {
  for (const hex of colors) {
    const rgb = parseHexColor(hex);
    const hsl = toHsl(rgb);
    if (predicate(rgb, hsl)) {
      return hex;
    }
  }

  return colors[0] ?? null;
}

function pickPartColorForMaterial(colors: string[], material: string): string | null {
  switch (material) {
    case "wood":
      return pickColorByHeuristic(
        colors,
        (_rgb, hsl) => hsl.h >= 15 && hsl.h <= 60 && hsl.s >= 0.2 && hsl.l >= 0.2 && hsl.l <= 0.78,
      );
    case "fabric":
      return pickColorByHeuristic(
        colors,
        (_rgb, hsl) =>
          (hsl.s <= 0.35 && hsl.l >= 0.15 && hsl.l <= 0.78) ||
          (hsl.h >= 180 && hsl.h <= 260 && hsl.l <= 0.7),
      );
    case "metal":
      return pickColorByHeuristic(
        colors,
        (_rgb, hsl) => hsl.s <= 0.18 && hsl.l >= 0.55,
      );
    case "stone":
      return pickColorByHeuristic(
        colors,
        (_rgb, hsl) => hsl.s <= 0.2 && hsl.l >= 0.18 && hsl.l <= 0.72,
      );
    default:
      return colors[0] ?? null;
  }
}

function buildMaterialColorHints(options: {
  dominantColors: string[];
  partAnalyses: ReferenceImagePartAnalysis[];
}): Record<string, string> {
  const hints: Record<string, string> = {};

  for (const part of options.partAnalyses) {
    const material = inferMaterialKeyFromPartName(part.partName);
    const color = material ? pickPartColorForMaterial(part.dominantColors, material) : null;

    if (!material || !color || hints[material]) {
      continue;
    }

    hints[material] = color;
  }

  if (!hints.wood) {
    const woodColor = pickColorByHeuristic(
      options.dominantColors,
      (_rgb, hsl) => hsl.h >= 15 && hsl.h <= 60 && hsl.s >= 0.2 && hsl.l >= 0.2 && hsl.l <= 0.75,
    );

    if (woodColor) {
      hints.wood = woodColor;
    }
  }

  if (!hints.fabric) {
    const fabricColor = pickColorByHeuristic(
      options.dominantColors,
      (_rgb, hsl) =>
        (hsl.s <= 0.32 && hsl.l >= 0.18 && hsl.l <= 0.78) ||
        (hsl.h >= 180 && hsl.h <= 260 && hsl.l <= 0.65),
    );

    if (fabricColor) {
      hints.fabric = fabricColor;
    }
  }

  if (!hints.metal) {
    const metalColor = pickColorByHeuristic(
      options.dominantColors,
      (_rgb, hsl) => hsl.s <= 0.18 && hsl.l >= 0.5,
    );

    if (metalColor) {
      hints.metal = metalColor;
    }
  }

  if (!hints.stone) {
    const stoneColor = pickColorByHeuristic(
      options.dominantColors,
      (_rgb, hsl) => hsl.s <= 0.2 && hsl.l >= 0.2 && hsl.l <= 0.7,
    );

    if (stoneColor) {
      hints.stone = stoneColor;
    }
  }

  return hints;
}

export function segmentReferenceImage(options: {
  referenceImage: ReferenceImageInput;
  observationGuidance?: ImageObservationGuidance;
}): SegmentedImage {
  const png = decodeReferenceImage(options.referenceImage.dataUrl);
  const background = chooseBackgroundMode(png, options.referenceImage);
  const backgroundMask = buildBackgroundMask(
    png,
    background.mode,
    background.color,
    options.referenceImage.backgroundTolerance,
  );
  const foreground = getForegroundBounds(png, backgroundMask, options.referenceImage.cropPadding);
  const warnings: string[] = [];

  if (!foreground.bounds) {
    warnings.push("Reference image foreground could not be separated from the background.");
  }

  const dominantColors = dominantColorsFromPixels(
    collectForegroundPixels(png, backgroundMask, foreground.bounds),
  );
  const partAnalyses: ReferenceImagePartAnalysis[] = (options.observationGuidance?.partObservations ?? []).map(
    (observation) => {
      const fitted = fitForegroundRect(png, backgroundMask, observation.rect);
      const dominant = dominantColorsFromPixels(
        collectForegroundPixels(png, backgroundMask, fitted.fittedRect ?? observation.rect),
        4,
      );
      const partWarnings: string[] = [];

      if (!fitted.fittedRect) {
        partWarnings.push("No foreground pixels were found inside the supplied observation rectangle.");
      } else if (fitted.occupancyRatio < 0.15) {
        partWarnings.push("Observation rectangle only weakly overlaps the detected foreground.");
      }

      return {
        partName: observation.partName,
        inputRect: observation.rect,
        fittedRect: fitted.fittedRect,
        occupancyRatio: fitted.occupancyRatio,
        dominantColors: dominant,
        warnings: partWarnings,
      };
    },
  );

  return {
    width: png.width,
    height: png.height,
    mask: backgroundMask,
    backgroundModeUsed: background.mode,
    backgroundColorUsed: background.colorHex,
    foregroundBounds: foreground.bounds,
    foregroundCoverage: foreground.coverage,
    dominantColors,
    materialColorHints: buildMaterialColorHints({
      dominantColors,
      partAnalyses,
    }),
    partAnalyses,
    warnings,
  };
}

export function analyzeReferenceImage(options: {
  referenceImage: ReferenceImageInput;
  observationGuidance?: ImageObservationGuidance;
}): ReferenceImageAnalysis {
  const segmented = segmentReferenceImage(options);

  return {
    width: segmented.width,
    height: segmented.height,
    backgroundModeUsed: segmented.backgroundModeUsed,
    backgroundColorUsed: segmented.backgroundColorUsed,
    foregroundBounds: segmented.foregroundBounds,
    foregroundCoverage: segmented.foregroundCoverage,
    dominantColors: segmented.dominantColors,
    materialColorHints: segmented.materialColorHints,
    partAnalyses: segmented.partAnalyses,
    warnings: segmented.warnings,
  };
}
