import type {
  AxisPixelSize,
  ImageMeasurementGuidance,
  ImageObservationGuidance,
  MeasurementObservationReport,
  ObservationPlane,
  ObservedMeasurementInput,
  ReferenceImageAnalysis,
} from "../contracts/schemas.js";

function defaultPlaneForView(view: ImageObservationGuidance["imageView"]): ObservationPlane | null {
  switch (view) {
    case "front":
      return "x_y";
    case "side":
      return "z_y";
    case "top":
      return "x_z";
    case "three_quarter":
      return "x_y";
    default:
      return null;
  }
}

function axisPixelSizeFromObservation(options: {
  plane: ObservationPlane | null;
  width: number;
  height: number;
  depthPixels?: number;
}): AxisPixelSize {
  switch (options.plane) {
    case "z_y":
      return {
        z: options.width,
        y: options.height,
        ...(options.depthPixels ? { x: options.depthPixels } : {}),
      };
    case "x_z":
      return {
        x: options.width,
        z: options.height,
        ...(options.depthPixels ? { y: options.depthPixels } : {}),
      };
    case "x_y":
    default:
      return {
        x: options.width,
        y: options.height,
        ...(options.depthPixels ? { z: options.depthPixels } : {}),
      };
  }
}

function toMeasuredPart(
  observation: ObservedMeasurementInput,
  plane: ObservationPlane | null,
  fittedRect?: ObservedMeasurementInput["rect"] | null,
) {
  const rect = fittedRect ?? observation.rect;

  return {
    partName: observation.partName,
    pixelSize: axisPixelSizeFromObservation({
      plane,
      width: rect.width,
      height: rect.height,
      depthPixels: observation.depthPixels,
    }),
    notes: observation.notes,
  };
}

export function extractMeasurementGuidanceFromObservations(options: {
  observationGuidance: ImageObservationGuidance;
  referenceImageAnalysis?: ReferenceImageAnalysis | null;
}): {
  measurementGuidance: ImageMeasurementGuidance;
  observationReport: MeasurementObservationReport;
} {
  const defaultPlane = defaultPlaneForView(options.observationGuidance.imageView);
  const warnings: string[] = [];
  let autoFittedPartCount = 0;
  let usedForegroundBounds = false;

  if (options.observationGuidance.imageView === "three_quarter") {
    warnings.push(
      "Three-quarter view observations default to x_y projection unless an explicit plane is provided.",
    );
  }

  if (options.observationGuidance.imageView === "unknown") {
    warnings.push(
      "Unknown view defaults to front-style x_y projection unless explicit planes are provided.",
    );
  }

  const overallPlane = options.observationGuidance.overallPlane ?? defaultPlane;
  const overallBounds =
    options.observationGuidance.overallBounds ??
    options.referenceImageAnalysis?.foregroundBounds ??
    undefined;
  const overallPixelSize = overallBounds
    ? axisPixelSizeFromObservation({
        plane: overallPlane,
        width: overallBounds.width,
        height: overallBounds.height,
        depthPixels: options.observationGuidance.overallDepthPixels,
      })
    : null;

  if (!options.observationGuidance.overallBounds && options.referenceImageAnalysis?.foregroundBounds) {
    usedForegroundBounds = true;
    warnings.push(
      "overallBounds were inferred from the detected foreground silhouette in the reference image.",
    );
  } else if (!options.observationGuidance.overallBounds) {
    warnings.push(
      "No overallBounds were provided, so overall size falls back to prompt/image-guidance defaults.",
    );
  }

  const partMeasurements = options.observationGuidance.partObservations.map((observation) => {
    const plane = observation.plane ?? defaultPlane;
    const fittedPart = options.referenceImageAnalysis?.partAnalyses.find(
      (part) => part.partName.trim().toLowerCase() === observation.partName.trim().toLowerCase(),
    );

    if (!plane) {
      warnings.push(
        `Part "${observation.partName}" had no explicit plane; assumed front-style x_y projection.`,
      );
    } else if (
      options.observationGuidance.imageView === "three_quarter" &&
      observation.plane === undefined
    ) {
      warnings.push(
        `Part "${observation.partName}" used default x_y projection from a three-quarter view.`,
      );
    }

    if (fittedPart?.fittedRect) {
      autoFittedPartCount += 1;
      if (fittedPart.occupancyRatio < 0.2) {
        warnings.push(
          `Part "${observation.partName}" only weakly overlaps the detected foreground (${Math.round(
            fittedPart.occupancyRatio * 100,
          )}% occupancy).`,
        );
      }
    }

    return toMeasuredPart(observation, plane, fittedPart?.fittedRect);
  });

  const notes = [options.observationGuidance.notes].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  return {
    measurementGuidance: {
      anchor: options.observationGuidance.anchor,
      overallPixelSize: overallPixelSize ?? undefined,
      partMeasurements,
      unitsPerBlock: options.observationGuidance.unitsPerBlock,
      snapIncrement: options.observationGuidance.snapIncrement,
      notes: notes.length > 0 ? notes.join(" ") : undefined,
    },
    observationReport: {
      imageView: options.observationGuidance.imageView,
      defaultPlane,
      overallPixelSize,
      partMeasurementCount: partMeasurements.length,
      autoFittedPartCount,
      usedForegroundBounds,
      warnings,
    },
  };
}
