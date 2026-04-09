import type {
  AssetPart,
  AssetSpec,
  AxisPixelSize,
  ImageMeasurementGuidance,
  MeasurementAxis,
  MeasurementReport,
  MeasuredPartInput,
  MeasuredPartReport,
  MeasurementUnitSystem,
} from "../contracts/schemas.js";

const AXES = ["x", "y", "z"] as const satisfies readonly MeasurementAxis[];

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

function axisToIndex(axis: MeasurementAxis): 0 | 1 | 2 {
  switch (axis) {
    case "x":
      return 0;
    case "y":
      return 1;
    case "z":
      return 2;
  }
}

function toModelUnits(
  size: number,
  unitSystem: MeasurementUnitSystem,
  unitsPerBlock: number,
): number {
  return unitSystem === "blocks" ? size * unitsPerBlock : size;
}

function snapDimension(value: number, increment: number): number {
  if (increment <= 0) {
    return Math.max(1, Math.round(value));
  }

  return Math.max(1, Math.round(value / increment) * increment);
}

function resolveAxisPixelSize(
  baseSize: readonly [number, number, number],
  pixelSize: AxisPixelSize | undefined,
  unitsPerPixel: number,
  snapIncrement: number,
  axisScale: readonly [number, number, number],
): {
  size: [number, number, number];
  measuredAxes: MeasurementAxis[];
  scaledAxes: MeasurementAxis[];
} {
  const resolved = [...baseSize] as [number, number, number];
  const measuredAxes: MeasurementAxis[] = [];
  const scaledAxes: MeasurementAxis[] = [];

  for (const axis of AXES) {
    const index = axisToIndex(axis);
    const measuredPixels = pixelSize?.[axis];

    if (measuredPixels !== undefined) {
      resolved[index] = snapDimension(measuredPixels * unitsPerPixel, snapIncrement);
      measuredAxes.push(axis);
      continue;
    }

    if (Math.abs(axisScale[index] - 1) > 0.001) {
      resolved[index] = snapDimension(baseSize[index] * axisScale[index], snapIncrement);
      scaledAxes.push(axis);
    } else {
      resolved[index] = snapDimension(baseSize[index], snapIncrement);
    }
  }

  return {
    size: resolved,
    measuredAxes,
    scaledAxes,
  };
}

function applyPartMeasurement(
  part: AssetPart,
  measurement: MeasuredPartInput | undefined,
  unitsPerPixel: number,
  snapIncrement: number,
  axisScale: readonly [number, number, number],
): {
  part: AssetPart;
  report: MeasuredPartReport | null;
} {
  const resolved = resolveAxisPixelSize(
    part.size,
    measurement?.pixelSize,
    unitsPerPixel,
    snapIncrement,
    axisScale,
  );
  const notes: string[] = [];

  if (measurement?.notes) {
    notes.push(measurement.notes);
  }

  if (resolved.scaledAxes.length > 0) {
    notes.push(`Scaled axes from overall measurement: ${resolved.scaledAxes.join(", ")}.`);
  }

  const report =
    measurement || resolved.scaledAxes.length > 0
      ? {
          partName: part.name,
          baseSize: part.size,
          resolvedSize: resolved.size,
          measuredAxes: resolved.measuredAxes,
          notes,
        }
      : null;

  return {
    part: {
      ...part,
      size: resolved.size,
    },
    report,
  };
}

export function applyMeasurementGuidanceToSpec(options: {
  spec: AssetSpec;
  measurementGuidance: ImageMeasurementGuidance;
}): {
  spec: AssetSpec;
  measurementReport: MeasurementReport;
} {
  const unitsPerBlock = options.measurementGuidance.unitsPerBlock ?? 16;
  const snapIncrement = options.measurementGuidance.snapIncrement ?? 1;
  const anchorUnits = toModelUnits(
    options.measurementGuidance.anchor.knownSize,
    options.measurementGuidance.anchor.unitSystem,
    unitsPerBlock,
  );
  const unitsPerPixel = anchorUnits / options.measurementGuidance.anchor.pixelLength;
  const warnings: string[] = [];

  if (!Number.isFinite(unitsPerPixel) || unitsPerPixel <= 0) {
    throw new Error("Measurement anchor must resolve to a positive units-per-pixel scale.");
  }

  if (!options.measurementGuidance.overallPixelSize) {
    warnings.push(
      "No overallPixelSize was provided, so unmeasured overall axes stay prompt-derived.",
    );
  }

  const overallResolved = resolveAxisPixelSize(
    options.spec.estimatedSize,
    options.measurementGuidance.overallPixelSize,
    unitsPerPixel,
    snapIncrement,
    [1, 1, 1],
  );
  const axisScale: [number, number, number] = [1, 1, 1];

  AXES.forEach((axis) => {
    const index = axisToIndex(axis);
    const baseAxis = options.spec.estimatedSize[index];
    const resolvedAxis = overallResolved.size[index];
    axisScale[index] = baseAxis > 0 ? resolvedAxis / baseAxis : 1;
  });

  const measurementByPartName = new Map<string, MeasuredPartInput>();
  for (const measurement of options.measurementGuidance.partMeasurements) {
    measurementByPartName.set(normalizeWord(measurement.partName), measurement);
  }

  const appliedPartMeasurements: MeasuredPartReport[] = [];
  const measuredParts = options.spec.parts.map((part) => {
    const measurement = measurementByPartName.get(normalizeWord(part.name));
    const applied = applyPartMeasurement(
      part,
      measurement,
      unitsPerPixel,
      snapIncrement,
      axisScale,
    );

    if (applied.report) {
      appliedPartMeasurements.push(applied.report);
    }

    return applied.part;
  });

  for (const measurement of options.measurementGuidance.partMeasurements) {
    const matched = options.spec.parts.some(
      (part) => normalizeWord(part.name) === normalizeWord(measurement.partName),
    );
    if (!matched) {
      warnings.push(`Measured part "${measurement.partName}" did not match any known spec part.`);
    }
  }

  if (options.measurementGuidance.notes) {
    warnings.push(`Measurement notes: ${options.measurementGuidance.notes}`);
  }

  return {
    spec: {
      ...options.spec,
      sizeSource: "measured",
      estimatedSize: overallResolved.size,
      parts: measuredParts,
      constraints: [
        ...options.spec.constraints,
        `Measurement anchor "${options.measurementGuidance.anchor.label}" resolved ${unitsPerPixel.toFixed(4)} units per pixel.`,
        "Measurement guidance takes priority over heuristic prompt sizing on measured axes.",
      ],
    },
    measurementReport: {
      unitsPerBlock,
      unitsPerPixel: Number(unitsPerPixel.toFixed(6)),
      anchorUnits,
      baseEstimatedSize: options.spec.estimatedSize,
      resolvedEstimatedSize: overallResolved.size,
      measuredOverallAxes: overallResolved.measuredAxes,
      appliedPartMeasurements,
      warnings,
    },
  };
}
