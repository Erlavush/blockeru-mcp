import { z } from "zod";

export const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vector2Schema = z.tuple([z.number(), z.number()]);
export const Vector4Schema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export const HexColorSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/, "Expected a 6-digit hex color.")
  .transform((value) => (value.startsWith("#") ? value.toLowerCase() : `#${value.toLowerCase()}`));
export const CubeFaceDirectionSchema = z.enum([
  "north",
  "south",
  "east",
  "west",
  "up",
  "down",
]);
export const CubeFaceLayoutSchema = z
  .object({
    uv: Vector4Schema,
    rotation: z.number().int().optional(),
    enabled: z.boolean().optional(),
    textureRef: z.string().trim().min(1).nullable().optional(),
  })
  .strict();
export const CubeFacesLayoutSchema = z
  .object({
    north: CubeFaceLayoutSchema.optional(),
    south: CubeFaceLayoutSchema.optional(),
    east: CubeFaceLayoutSchema.optional(),
    west: CubeFaceLayoutSchema.optional(),
    up: CubeFaceLayoutSchema.optional(),
    down: CubeFaceLayoutSchema.optional(),
  })
  .strict()
  .optional();

export const ProjectCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("java_block"),
  textureWidth: z.number().int().positive().default(64),
  textureHeight: z.number().int().positive().default(64),
  boxUv: z.boolean().default(false),
  ifRevision: z.number().int().positive().optional(),
});

export const ProjectClearInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  textureWidth: z.number().int().positive().optional(),
  textureHeight: z.number().int().positive().optional(),
  boxUv: z.boolean().optional(),
  ifRevision: z.number().int().positive().optional(),
});

export const ProjectStateSchema = z.object({
  open: z.boolean(),
  name: z.string().nullable(),
  formatId: z.string().nullable(),
  boxUv: z.boolean().nullable(),
  textureWidth: z.number().int().positive().nullable(),
  textureHeight: z.number().int().positive().nullable(),
  revision: z.number().int().positive().nullable(),
  cubeCount: z.number().int().nonnegative(),
  textureCount: z.number().int().nonnegative(),
});
export const TargetRefSchema = z
  .object({
    uuid: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.uuid !== undefined || value.name !== undefined, {
    message: "Provide either uuid or name.",
  });
export const EnsureProjectModeSchema = z.enum([
  "reuse_or_create",
  "replace_current_project",
  "create_new",
]);
export const EnsureProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  mode: EnsureProjectModeSchema.default("reuse_or_create"),
  ifRevision: z.number().int().positive().optional(),
});
export const EnsureProjectResultSchema = z.object({
  action: z.enum(["reused", "cleared", "created"]),
  project: ProjectStateSchema,
});

export const BridgeHealthSchema = z.object({
  pluginId: z.string(),
  version: z.string(),
  host: z.string(),
  port: z.number().int().positive(),
  basePath: z.string(),
  capabilities: z.array(z.string()),
  project: ProjectStateSchema,
});

export const CubeCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).default("cube"),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema.default([8, 8, 8]),
  uvOffset: Vector2Schema.optional(),
  faces: CubeFacesLayoutSchema,
  colorIndex: z.number().int().nonnegative().max(7).optional(),
  boxUv: z.boolean().optional(),
  textureRef: z.string().trim().min(1).optional(),
  ifRevision: z.number().int().positive().optional(),
});

export const CubeResultSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
  textureRef: z.string().nullable(),
  revision: z.number().int().positive(),
});
export const CubeSummarySchema = z.object({
  uuid: z.string(),
  name: z.string(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
  boxUv: z.boolean(),
  textureRef: z.string().nullable(),
  revision: z.number().int().positive(),
});
export const CubeUpdateInputSchema = z.object({
  target: TargetRefSchema,
  name: z.string().trim().min(1).max(120).optional(),
  from: Vector3Schema.optional(),
  to: Vector3Schema.optional(),
  origin: Vector3Schema.optional(),
  uvOffset: Vector2Schema.optional(),
  faces: CubeFacesLayoutSchema,
  colorIndex: z.number().int().nonnegative().max(7).optional(),
  boxUv: z.boolean().optional(),
  textureRef: z.string().trim().min(1).nullable().optional(),
  ifRevision: z.number().int().positive().optional(),
});
export const CubeDeleteInputSchema = z.object({
  target: TargetRefSchema,
  ifRevision: z.number().int().positive().optional(),
});
export const CubeDeleteResultSchema = z.object({
  deleted: z.boolean(),
  uuid: z.string(),
  name: z.string(),
  revision: z.number().int().positive(),
});

export const TextureCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dataUrl: z.string().startsWith("data:image/"),
  applyToAll: z.boolean().default(false),
  setAsDefault: z.boolean().default(true),
  ifRevision: z.number().int().positive().optional(),
});

export const TextureResultSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  useAsDefault: z.boolean(),
  revision: z.number().int().positive(),
});
export const TextureSummarySchema = z.object({
  uuid: z.string(),
  name: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  useAsDefault: z.boolean(),
});
export const TextureReadInputSchema = z.object({
  target: TargetRefSchema,
});
export const TextureReadResultSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  useAsDefault: z.boolean(),
  dataUrl: z.string().startsWith("data:image/"),
});
export const TextureUpdateInputSchema = z.object({
  target: TargetRefSchema,
  name: z.string().trim().min(1).max(120).optional(),
  dataUrl: z.string().startsWith("data:image/"),
  applyToAll: z.boolean().default(false),
  setAsDefault: z.boolean().default(true),
  ifRevision: z.number().int().positive().optional(),
});
export const TextureDeleteInputSchema = z.object({
  target: TargetRefSchema,
  ifRevision: z.number().int().positive().optional(),
});
export const TextureDeleteResultSchema = z.object({
  deleted: z.boolean(),
  uuid: z.string(),
  name: z.string(),
  revision: z.number().int().positive(),
});
export const TextureRegionSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export const TexturePaintRegionInputSchema = z.object({
  target: TargetRefSchema,
  region: TextureRegionSchema,
  material: z.string().trim().min(1),
  colorHint: z.string().trim().min(1).default("natural"),
  seed: z.string().trim().min(1).optional(),
  ifRevision: z.number().int().positive().optional(),
});
export const TexturePaintRegionResultSchema = z.object({
  texture: TextureResultSchema,
  region: TextureRegionSchema,
});
export const TextureAssignInputSchema = z.object({
  cube: TargetRefSchema,
  texture: TargetRefSchema,
  ifRevision: z.number().int().positive().optional(),
});
export const TextureAssignResultSchema = z.object({
  cube: CubeResultSchema,
  texture: TextureSummarySchema,
  revision: z.number().int().positive(),
});
export const ProjectContentsSchema = z.object({
  project: ProjectStateSchema,
  cubes: z.array(CubeSummarySchema),
  textures: z.array(TextureSummarySchema),
});
export const ProjectSnapshotTextureSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  useAsDefault: z.boolean(),
  dataUrl: z.string().startsWith("data:image/"),
});
export const ProjectSnapshotCubeSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
  uvOffset: Vector2Schema.nullable(),
  faces: CubeFacesLayoutSchema,
  colorIndex: z.number().int().nonnegative().max(7).nullable(),
  boxUv: z.boolean(),
  textureRef: z.string().trim().min(1).nullable(),
  parentPath: z.array(z.string()),
});
export const ProjectSnapshotSchema = z.object({
  project: z.object({
    name: z.string().nullable(),
    formatId: z.string().nullable(),
    boxUv: z.boolean().nullable(),
    textureWidth: z.number().int().positive().nullable(),
    textureHeight: z.number().int().positive().nullable(),
    revision: z.number().int().positive().nullable(),
  }),
  cubes: z.array(ProjectSnapshotCubeSchema),
  textures: z.array(ProjectSnapshotTextureSchema),
});
export const GroupSummarySchema = z.object({
  uuid: z.string(),
  name: z.string(),
  origin: Vector3Schema,
  rotation: Vector3Schema,
  parentPath: z.array(z.string()),
  childCount: z.number().int().nonnegative(),
  visibility: z.boolean(),
  export: z.boolean(),
  colorIndex: z.number().int().nonnegative(),
  selected: z.boolean(),
});
export const SceneGraphCubeSummarySchema = z.object({
  uuid: z.string(),
  name: z.string(),
  parentPath: z.array(z.string()),
  selected: z.boolean(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
});
export const SelectionNodeSummarySchema = z.object({
  type: z.enum(["cube", "group"]),
  uuid: z.string(),
  name: z.string(),
  parentPath: z.array(z.string()),
});
export const SelectionSummarySchema = z.object({
  cubes: z.array(SelectionNodeSummarySchema),
  groups: z.array(SelectionNodeSummarySchema),
  totalSelected: z.number().int().nonnegative(),
});
export const SceneGraphSummarySchema = z.object({
  project: ProjectStateSchema,
  groups: z.array(GroupSummarySchema),
  cubes: z.array(SceneGraphCubeSummarySchema),
  selection: SelectionSummarySchema,
});
export const GroupCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  origin: Vector3Schema.default([0, 0, 0]),
  rotation: Vector3Schema.default([0, 0, 0]),
  colorIndex: z.number().int().nonnegative().max(7).default(0),
  visibility: z.boolean().default(true),
  export: z.boolean().default(true),
  parent: TargetRefSchema.optional(),
  ifRevision: z.number().int().positive().optional(),
});
export const GroupUpdateInputSchema = z.object({
  target: TargetRefSchema,
  name: z.string().trim().min(1).max(120).optional(),
  origin: Vector3Schema.optional(),
  rotation: Vector3Schema.optional(),
  colorIndex: z.number().int().nonnegative().max(7).optional(),
  visibility: z.boolean().optional(),
  export: z.boolean().optional(),
  ifRevision: z.number().int().positive().optional(),
});
export const GroupDeleteInputSchema = z.object({
  target: TargetRefSchema,
  ifRevision: z.number().int().positive().optional(),
});
export const GroupDeleteResultSchema = z.object({
  deleted: z.boolean(),
  uuid: z.string(),
  name: z.string(),
  revision: z.number().int().positive(),
});
export const SceneNodeTypeSchema = z.enum(["cube", "group"]);
export const SceneNodeRefSchema = z.object({
  type: SceneNodeTypeSchema,
  target: TargetRefSchema,
});
export const ReparentSceneNodeInputSchema = z.object({
  node: SceneNodeRefSchema,
  parent: TargetRefSchema.nullable().default(null),
  ifRevision: z.number().int().positive().optional(),
});
export const ReparentSceneNodeResultSchema = z.object({
  nodeType: SceneNodeTypeSchema,
  uuid: z.string(),
  name: z.string(),
  parentPath: z.array(z.string()),
  revision: z.number().int().positive(),
});
export const SelectSceneNodesInputSchema = z.object({
  nodes: z.array(SceneNodeRefSchema).default([]),
  clearExisting: z.boolean().default(true),
});
export const CreateProjectSnapshotInputSchema = z.object({
  includeTextureData: z.boolean().default(true),
});
export const RestoreProjectSnapshotInputSchema = z.object({
  snapshot: ProjectSnapshotSchema,
  mode: z.enum(["replace_current_project", "new_project"]).default("replace_current_project"),
  ifRevision: z.number().int().positive().optional(),
});
export const RestoreProjectSnapshotResultSchema = z.object({
  project: ProjectStateSchema,
  createdCubeCount: z.number().int().nonnegative(),
  createdTextureCount: z.number().int().nonnegative(),
  warnings: z.array(z.string()),
});
export const SnapshotDiffEntrySchema = z.object({
  name: z.string(),
  kind: z.enum(["added", "removed", "updated"]),
  details: z.array(z.string()),
});
export const DiffProjectSnapshotsInputSchema = z.object({
  before: ProjectSnapshotSchema,
  after: ProjectSnapshotSchema,
});
export const DiffProjectSnapshotsResultSchema = z.object({
  cubeDiffs: z.array(SnapshotDiffEntrySchema),
  textureDiffs: z.array(SnapshotDiffEntrySchema),
  cubeChangeCount: z.number().int().nonnegative(),
  textureChangeCount: z.number().int().nonnegative(),
});
export const CodecSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  extension: z.string().nullable(),
  supportsImport: z.boolean(),
  supportsExport: z.boolean(),
  formatId: z.string().nullable(),
});
export const ListCodecsResultSchema = z.object({
  codecs: z.array(CodecSummarySchema),
});
export const ExportProjectInputSchema = z.object({
  codecId: z.string().trim().min(1).default("project"),
  exportOptions: z.record(z.string(), z.unknown()).default({}),
});
export const ExportProjectResultSchema = z.object({
  codec: CodecSummarySchema,
  contentType: z.enum(["text", "json", "base64"]),
  content: z.string(),
  suggestedFileName: z.string().nullable(),
  revision: z.number().int().positive().nullable(),
});
export const ImportProjectInputSchema = z.object({
  codecId: z.string().trim().min(1),
  contentType: z.enum(["text", "json", "base64"]).default("text"),
  content: z.string().min(1),
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).optional(),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  projectMode: z.enum(["replace_current_project", "new_project"]).default("replace_current_project"),
  ifRevision: z.number().int().positive().optional(),
});
export const ImportProjectResultSchema = z.object({
  project: ProjectStateSchema,
  codec: CodecSummarySchema,
  revision: z.number().int().positive().nullable(),
});
export const DescribeProjectStructureInputSchema = z.object({
  managedScope: z.string().trim().min(1).optional(),
  managedOnly: z.boolean().default(false),
});
export const ProjectValidateInputSchema = z.object({
  expectedTextureWidth: z.number().int().positive().optional(),
  expectedTextureHeight: z.number().int().positive().optional(),
  expectedCenter: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0]),
  requireTextures: z.boolean().default(true),
  allowEmpty: z.boolean().default(false),
});
export const ProjectValidationMetricsSchema = z.object({
  cubeCount: z.number().int().nonnegative(),
  textureCount: z.number().int().nonnegative(),
  texturedCubeCount: z.number().int().nonnegative(),
  untexturedCubeCount: z.number().int().nonnegative(),
  boundingBoxMin: Vector3Schema.nullable(),
  boundingBoxMax: Vector3Schema.nullable(),
  boundingBoxSize: Vector3Schema.nullable(),
  boundingBoxCenter: Vector3Schema.nullable(),
  groundY: z.number().nullable(),
  centerOffsetX: z.number().nullable(),
  centerOffsetZ: z.number().nullable(),
  projectTextureSize: Vector2Schema.nullable(),
});
export const ProjectValidationResultSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  findings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["info", "warning", "error"]),
      message: z.string(),
      suggestedFix: z.string().optional(),
    }),
  ),
  metrics: ProjectValidationMetricsSchema,
});

export const PreviewRenderInputSchema = z.object({
  mimeType: z.literal("image/png").default("image/png"),
  viewPreset: z.enum(["preserve", "front", "side", "three_quarter"]).default("preserve"),
  projection: z.enum(["preserve", "orthographic", "perspective"]).default("preserve"),
  lockedAngle: z.number().finite().optional(),
  fov: z.number().positive().max(160).optional(),
});

export const PreviewRenderResultSchema = z.object({
  mimeType: z.literal("image/png"),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  dataUrl: z.string().startsWith("data:image/png;base64,"),
});

export const PromptAnalysisInputSchema = z.object({
  prompt: z.string().trim().min(1),
  formatId: z.string().trim().min(1).default("java_block"),
});

export const AssetPartSchema = z.object({
  name: z.string(),
  shape: z.enum(["cube", "slab", "panel", "rod", "cluster"]),
  size: Vector3Schema,
  material: z.string().optional(),
  notes: z.string().optional(),
});

export const AssetSpecSchema = z.object({
  assetType: z.string(),
  style: z.string(),
  targetFormat: z.string(),
  sizeSource: z.enum(["heuristic", "measured"]).default("heuristic"),
  estimatedSize: Vector3Schema,
  symmetry: z.enum(["none", "mirror_x", "mirror_z", "radial"]),
  materials: z.array(z.string()),
  palette: z.array(z.string()),
  materialColorHints: z.record(z.string(), HexColorSchema).default({}),
  parts: z.array(AssetPartSchema),
  textureStrategy: z.string(),
  constraints: z.array(z.string()),
});
export const ReferenceFeatureCodeSchema = z.enum([
  "four_legs",
  "armrests",
  "side_slats",
  "open_sides",
  "seat_cushion",
  "back_cushion",
  "visible_front_beam",
  "inset_seat",
  "back_above_armrests",
  "storage_base",
  "underbed_drawers",
  "footboard",
  "pillows",
  "duvet",
]);
export const ReferenceIntentSchema = z.object({
  assetType: z.string(),
  requiredFeatures: z.array(ReferenceFeatureCodeSchema),
  preferredFeatures: z.array(ReferenceFeatureCodeSchema),
  sourceHints: z.array(z.string()),
  notes: z.array(z.string()),
});
export const ProjectStructureChairSummarySchema = z.object({
  legCount: z.number().int().nonnegative(),
  armrestCount: z.number().int().nonnegative(),
  sideSlatCount: z.number().int().nonnegative(),
  supportCount: z.number().int().nonnegative(),
  frontBeamCount: z.number().int().nonnegative(),
  sidePanelCount: z.number().int().nonnegative(),
  seatBaseCount: z.number().int().nonnegative(),
  seatCushionCount: z.number().int().nonnegative(),
  backBaseCount: z.number().int().nonnegative(),
  backCushionCount: z.number().int().nonnegative(),
  seatInsetX: z.number().nullable(),
  seatInsetZ: z.number().nullable(),
  armrestTopY: z.number().nullable(),
  backTopY: z.number().nullable(),
  backAboveArmrests: z.boolean().nullable(),
  frontBeamVisible: z.boolean().nullable(),
  openSides: z.boolean().nullable(),
});
export const ProjectStructureBedSummarySchema = z.object({
  frameCount: z.number().int().nonnegative(),
  mattressCount: z.number().int().nonnegative(),
  headboardCount: z.number().int().nonnegative(),
  footboardCount: z.number().int().nonnegative(),
  drawerCount: z.number().int().nonnegative(),
  drawerBodyCount: z.number().int().nonnegative(),
  drawerFrontOnlyCount: z.number().int().nonnegative(),
  drawerHandleCount: z.number().int().nonnegative(),
  pillowCount: z.number().int().nonnegative(),
  beddingCount: z.number().int().nonnegative(),
  postCount: z.number().int().nonnegative(),
  railCount: z.number().int().nonnegative(),
  mattressSupportRatio: z.number().min(0).max(1).nullable(),
  leftSideClosureRatio: z.number().min(0).max(1).nullable(),
  rightSideClosureRatio: z.number().min(0).max(1).nullable(),
  frontClosureRatio: z.number().min(0).max(1).nullable(),
  backClosureRatio: z.number().min(0).max(1).nullable(),
  lowerBodyCoverageRatio: z.number().min(0).max(1).nullable(),
  undersideCoverageRatio: z.number().min(0).max(1).nullable(),
  floatingCubeCount: z.number().int().nonnegative(),
  storageBaseClosed: z.boolean().nullable(),
  sidesClosed: z.boolean().nullable(),
  undersideClosed: z.boolean().nullable(),
});
export const ProjectStructureSummarySchema = z.object({
  managedScope: z.string().nullable(),
  totalCubeCount: z.number().int().nonnegative(),
  analyzedCubeCount: z.number().int().nonnegative(),
  textureCount: z.number().int().nonnegative(),
  boundsMin: Vector3Schema.nullable(),
  boundsMax: Vector3Schema.nullable(),
  boundsSize: Vector3Schema.nullable(),
  namedPartCounts: z.record(z.string(), z.number().int().nonnegative()),
  detectedFeatures: z.array(ReferenceFeatureCodeSchema),
  chair: ProjectStructureChairSummarySchema.nullable(),
  bed: ProjectStructureBedSummarySchema.nullable(),
});
export const CritiqueProjectAgainstIntentInputSchema = z.object({
  managedScope: z.string().trim().min(1).optional(),
  managedOnly: z.boolean().default(true),
  prompt: z.string().trim().min(1).optional(),
  spec: AssetSpecSchema.optional(),
});
export const SemanticCritiqueSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  intent: ReferenceIntentSchema,
  structure: ProjectStructureSummarySchema,
  findings: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["info", "warning", "error"]),
      message: z.string(),
      suggestedFix: z.string().optional(),
    }),
  ),
});

export const ImageGuidanceSchema = z.object({
  subject: z.string().trim().min(1).optional(),
  assetTypeHint: z.string().trim().min(1).optional(),
  dominantColors: z.array(z.string().trim().min(1)).default([]),
  materials: z.array(z.string().trim().min(1)).default([]),
  visibleParts: z.array(z.string().trim().min(1)).default([]),
  silhouette: z
    .enum(["boxy", "round", "flat", "tall", "wide", "slim", "deep", "layered"])
    .optional(),
  symmetry: z.enum(["none", "mirror_x", "mirror_z", "radial"]).optional(),
  proportionHint: Vector3Schema.optional(),
  notes: z.string().trim().min(1).optional(),
});

export const MeasurementAxisSchema = z.enum(["x", "y", "z"]);
export const MeasurementUnitSystemSchema = z.enum(["blocks", "model_units"]);
export const AxisPixelSizeSchema = z
  .object({
    x: z.number().positive().optional(),
    y: z.number().positive().optional(),
    z: z.number().positive().optional(),
  })
  .refine((value) => value.x !== undefined || value.y !== undefined || value.z !== undefined, {
    message: "At least one axis pixel measurement must be provided.",
  });
export const MeasurementAnchorSchema = z.object({
  label: z.string().trim().min(1).default("reference"),
  pixelLength: z.number().positive(),
  knownSize: z.number().positive(),
  unitSystem: MeasurementUnitSystemSchema.default("blocks"),
  axis: MeasurementAxisSchema.optional(),
});
export const MeasuredPartInputSchema = z.object({
  partName: z.string().trim().min(1),
  pixelSize: AxisPixelSizeSchema,
  notes: z.string().trim().min(1).optional(),
});
export const ObservationPlaneSchema = z.enum(["x_y", "z_y", "x_z"]);
export const ImageViewSchema = z.enum(["front", "side", "top", "three_quarter", "unknown"]);
export const PixelRectSchema = z.object({
  x: z.number().nonnegative().default(0),
  y: z.number().nonnegative().default(0),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const ObservedMeasurementInputSchema = z.object({
  partName: z.string().trim().min(1),
  rect: PixelRectSchema,
  plane: ObservationPlaneSchema.optional(),
  depthPixels: z.number().positive().optional(),
  notes: z.string().trim().min(1).optional(),
});
export const ImageMeasurementGuidanceSchema = z.object({
  anchor: MeasurementAnchorSchema,
  overallPixelSize: AxisPixelSizeSchema.optional(),
  partMeasurements: z.array(MeasuredPartInputSchema).default([]),
  unitsPerBlock: z.number().positive().default(16),
  snapIncrement: z.number().positive().default(1),
  notes: z.string().trim().min(1).optional(),
});
export const ImageObservationGuidanceSchema = z.object({
  anchor: MeasurementAnchorSchema,
  imageView: ImageViewSchema.default("front"),
  overallBounds: PixelRectSchema.optional(),
  overallPlane: ObservationPlaneSchema.optional(),
  overallDepthPixels: z.number().positive().optional(),
  partObservations: z.array(ObservedMeasurementInputSchema).default([]),
  unitsPerBlock: z.number().positive().default(16),
  snapIncrement: z.number().positive().default(1),
  notes: z.string().trim().min(1).optional(),
});
export const ReferenceImageBackgroundModeSchema = z.enum([
  "auto",
  "greenscreen",
  "color_key",
  "alpha",
]);
export const ReferenceImageInputSchema = z.object({
  dataUrl: z.string().startsWith("data:image/"),
  backgroundMode: ReferenceImageBackgroundModeSchema.default("auto"),
  backgroundColor: HexColorSchema.optional(),
  backgroundTolerance: z.number().int().min(0).max(255).default(48),
  cropPadding: z.number().int().min(0).max(64).default(0),
});
export const ReferenceImagePartAnalysisSchema = z.object({
  partName: z.string(),
  inputRect: PixelRectSchema,
  fittedRect: PixelRectSchema.nullable(),
  occupancyRatio: z.number().min(0).max(1),
  dominantColors: z.array(HexColorSchema),
  warnings: z.array(z.string()),
});
export const ReferenceImageAnalysisSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  backgroundModeUsed: ReferenceImageBackgroundModeSchema,
  backgroundColorUsed: HexColorSchema.nullable(),
  foregroundBounds: PixelRectSchema.nullable(),
  foregroundCoverage: z.number().min(0).max(1),
  dominantColors: z.array(HexColorSchema),
  materialColorHints: z.record(z.string(), HexColorSchema),
  partAnalyses: z.array(ReferenceImagePartAnalysisSchema),
  warnings: z.array(z.string()),
});

export const MaterialSlotSchema = z.object({
  slotId: z.string(),
  label: z.string(),
  material: z.string(),
  uvOffset: Vector2Schema,
  uvSize: Vector2Schema,
  colorHint: z.string(),
});

export const PlannedCubeSchema = z.object({
  name: z.string(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
  uvOffset: Vector2Schema.optional(),
  faces: CubeFacesLayoutSchema,
  materialSlot: z.string().optional(),
  notes: z.string().optional(),
});

export const BuildPlanSchema = z.object({
  projectName: z.string(),
  mutationScope: z.string(),
  managedTextureName: z.string(),
  formatId: z.string(),
  textureWidth: z.number().int().positive(),
  textureHeight: z.number().int().positive(),
  boxUv: z.boolean(),
  symmetry: z.string(),
  estimatedSize: Vector3Schema,
  materialSlots: z.array(MaterialSlotSchema),
  cubes: z.array(PlannedCubeSchema),
  notes: z.array(z.string()),
});

export const MutationStrategySchema = z.enum(["patch", "rebuild"]);
export const BuildMutationOperationSchema = z.object({
  type: z.enum(["add_cube", "update_cube", "delete_cube", "keep_cube"]),
  cubeName: z.string(),
  targetUuid: z.string().nullable().optional(),
  targetName: z.string().nullable().optional(),
  reason: z.string(),
});
export const BuildMutationSafetySchema = z.object({
  patchEligible: z.boolean(),
  managedCubeCount: z.number().int().nonnegative(),
  foreignCubeCount: z.number().int().nonnegative(),
  duplicateCurrentCubeNames: z.array(z.string()),
  duplicatePlannedCubeNames: z.array(z.string()),
  fallbackReason: z.string().nullable(),
});
export const BuildMutationPlanSchema = z.object({
  strategy: MutationStrategySchema,
  scope: z.string(),
  targetProjectName: z.string(),
  targetTextureName: z.string().nullable(),
  safety: BuildMutationSafetySchema,
  operations: z.array(BuildMutationOperationSchema),
});
export const BuildMutationSummarySchema = z.object({
  strategy: MutationStrategySchema,
  scope: z.string(),
  addedCubeCount: z.number().int().nonnegative(),
  updatedCubeCount: z.number().int().nonnegative(),
  deletedCubeCount: z.number().int().nonnegative(),
  retainedCubeCount: z.number().int().nonnegative(),
  textureCreated: z.boolean(),
  textureAction: z.enum(["none", "created", "updated", "reused"]),
  deletedTextureCount: z.number().int().nonnegative(),
  managedTextureUuid: z.string().nullable(),
  finalRevision: z.number().int().positive().nullable(),
});

export const RepairLoopInputSchema = z.object({
  enabled: z.boolean().default(true),
  maxPasses: z.number().int().min(1).max(4).default(2),
});

export const BuildAssetFromSpecInputSchema = z.object({
  spec: AssetSpecSchema,
  prompt: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  repairLoop: RepairLoopInputSchema.default({
    enabled: true,
    maxPasses: 2,
  }),
  projectMode: z
    .enum(["replace_current_project", "new_project"])
    .default("replace_current_project"),
  createTexture: z.boolean().default(true),
  renderPreview: z.boolean().default(true),
});

export const GenerateAssetFromTextInputSchema = z.object({
  prompt: z.string().trim().min(1),
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  repairLoop: RepairLoopInputSchema.default({
    enabled: true,
    maxPasses: 2,
  }),
  projectMode: z.enum(["replace_current_project", "new_project"]).default("replace_current_project"),
  createTexture: z.boolean().default(true),
  renderPreview: z.boolean().default(true),
});

export const DraftAssetSpecFromImageInputSchema = z.object({
  prompt: z.string().trim().min(1),
  formatId: z.string().trim().min(1).default("free"),
  imageGuidance: ImageGuidanceSchema,
  measurementGuidance: ImageMeasurementGuidanceSchema.optional(),
  observationGuidance: ImageObservationGuidanceSchema.optional(),
  referenceImage: ReferenceImageInputSchema.optional(),
});

export const GenerateAssetFromImageInputSchema = z.object({
  prompt: z.string().trim().min(1),
  imageGuidance: ImageGuidanceSchema,
  measurementGuidance: ImageMeasurementGuidanceSchema.optional(),
  observationGuidance: ImageObservationGuidanceSchema.optional(),
  referenceImage: ReferenceImageInputSchema.optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  repairLoop: RepairLoopInputSchema.default({
    enabled: true,
    maxPasses: 2,
  }),
  projectMode: z
    .enum(["replace_current_project", "new_project"])
    .default("replace_current_project"),
  createTexture: z.boolean().default(true),
  renderPreview: z.boolean().default(true),
});

export const SolveImageMeasurementsInputSchema = z.object({
  prompt: z.string().trim().min(1),
  formatId: z.string().trim().min(1).default("free"),
  imageGuidance: ImageGuidanceSchema,
  measurementGuidance: ImageMeasurementGuidanceSchema.optional(),
  observationGuidance: ImageObservationGuidanceSchema.optional(),
  referenceImage: ReferenceImageInputSchema.optional(),
});

export const ExtractMeasurementGuidanceInputSchema = z.object({
  prompt: z.string().trim().min(1),
  formatId: z.string().trim().min(1).default("free"),
  imageGuidance: ImageGuidanceSchema,
  observationGuidance: ImageObservationGuidanceSchema,
  referenceImage: ReferenceImageInputSchema.optional(),
});
export const AnalyzeReferenceImageInputSchema = z.object({
  referenceImage: ReferenceImageInputSchema,
  observationGuidance: ImageObservationGuidanceSchema.optional(),
});
export const CritiquePreviewAgainstReferenceInputSchema = z.object({
  referenceImage: ReferenceImageInputSchema,
  observationGuidance: ImageObservationGuidanceSchema.optional(),
  viewPreset: z.enum(["preserve", "front", "side", "three_quarter"]).default("preserve"),
});

export const GeneratedTextureAtlasSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dataUrl: z.string().startsWith("data:image/png;base64,"),
  materialSlots: z.array(MaterialSlotSchema),
});

export const QualityFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string(),
  suggestedFix: z.string().optional(),
});

export const QualityMetricsSchema = z.object({
  boundingBoxMin: Vector3Schema,
  boundingBoxMax: Vector3Schema,
  boundingBoxSize: Vector3Schema,
  boundingBoxCenter: Vector3Schema,
  targetCenter: Vector3Schema,
  groundY: z.number(),
  requestedTextureSize: Vector2Schema,
  projectTextureSize: Vector2Schema.nullable(),
  generatedTextureSize: Vector2Schema.nullable(),
  uvCoverageRatio: z.number().min(0).max(1).nullable(),
  overlapPixelCount: z.number().int().nonnegative(),
  tinyFaceCount: z.number().int().nonnegative(),
  packedFaceCount: z.number().int().nonnegative(),
});

export const QualityReportSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  findings: z.array(QualityFindingSchema),
  metrics: QualityMetricsSchema,
});

export const RepairAdjustmentSchema = z.object({
  code: z.enum([
    "compact_material_slots",
    "share_repeated_uvs",
    "recenter_scene",
    "reground_asset",
    "add_armrests",
    "add_side_slats",
    "add_front_beam",
    "add_seat_cushion",
    "add_back_cushion",
    "inset_seat",
    "raise_back",
    "complete_bed_frame",
    "close_bed_sides",
    "close_bed_underside",
    "embed_drawers",
  ]),
  description: z.string(),
});

export const RepairPassSchema = z.object({
  pass: z.number().int().positive(),
  qualityReport: QualityReportSchema,
  adjustments: z.array(RepairAdjustmentSchema),
});

export const RepairHistorySchema = z.object({
  enabled: z.boolean(),
  totalPasses: z.number().int().positive(),
  passes: z.array(RepairPassSchema),
  appliedAdjustments: z.array(RepairAdjustmentSchema),
});

export const MeasuredPartReportSchema = z.object({
  partName: z.string(),
  baseSize: Vector3Schema,
  resolvedSize: Vector3Schema,
  measuredAxes: z.array(MeasurementAxisSchema),
  notes: z.array(z.string()),
});

export const MeasurementReportSchema = z.object({
  unitsPerBlock: z.number().positive(),
  unitsPerPixel: z.number().positive(),
  anchorUnits: z.number().positive(),
  baseEstimatedSize: Vector3Schema,
  resolvedEstimatedSize: Vector3Schema,
  measuredOverallAxes: z.array(MeasurementAxisSchema),
  appliedPartMeasurements: z.array(MeasuredPartReportSchema),
  warnings: z.array(z.string()),
});

export const MeasurementObservationReportSchema = z.object({
  imageView: ImageViewSchema,
  defaultPlane: ObservationPlaneSchema.nullable(),
  overallPixelSize: AxisPixelSizeSchema.nullable(),
  partMeasurementCount: z.number().int().nonnegative(),
  autoFittedPartCount: z.number().int().nonnegative().default(0),
  usedForegroundBounds: z.boolean().default(false),
  warnings: z.array(z.string()),
});
export const ReferencePreviewCritiqueMetricsSchema = z.object({
  silhouetteIoU: z.number().min(0).max(1).nullable(),
  aspectRatioDelta: z.number().nonnegative().nullable(),
  aspectRatioSignedDelta: z.number().nullable(),
  widthRatioDelta: z.number().nonnegative().nullable(),
  widthRatioSignedDelta: z.number().nullable(),
  heightRatioDelta: z.number().nonnegative().nullable(),
  heightRatioSignedDelta: z.number().nullable(),
  fillRatioDelta: z.number().nonnegative().nullable(),
  fillRatioSignedDelta: z.number().nullable(),
  centerOffsetX: z.number().nonnegative().nullable(),
  centerSignedOffsetX: z.number().nullable(),
  centerOffsetY: z.number().nonnegative().nullable(),
  centerSignedOffsetY: z.number().nullable(),
  bandProfileError: z.number().nonnegative().nullable(),
  dominantColorDistance: z.number().nonnegative().nullable(),
});
export const ReferencePreviewCritiqueSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  metrics: ReferencePreviewCritiqueMetricsSchema,
  findings: z.array(QualityFindingSchema),
});
export const MultiViewCritiqueViewKeySchema = z.enum([
  "front",
  "right",
  "back",
  "left",
  "three_quarter_front",
  "three_quarter_back",
]);
export const MultiViewCritiqueViewMetricsSchema = z.object({
  foregroundCoverage: z.number().min(0).max(1),
  componentCount: z.number().int().positive(),
  lowerBandFillRatio: z.number().min(0).max(1),
  middleBandFillRatio: z.number().min(0).max(1),
  lowerCoreFillRatio: z.number().min(0).max(1),
  boundsWidthRatio: z.number().min(0).max(1).nullable(),
  boundsHeightRatio: z.number().min(0).max(1).nullable(),
});
export const MultiViewCritiqueViewSchema = z.object({
  view: MultiViewCritiqueViewKeySchema,
  metrics: MultiViewCritiqueViewMetricsSchema,
});
export const MultiViewCritiqueSchema = z.object({
  status: z.enum(["pass", "warn", "fail"]),
  score: z.number().int().min(0).max(100),
  views: z.array(MultiViewCritiqueViewSchema),
  findings: z.array(QualityFindingSchema),
});
export const CritiquePreviewAgainstReferenceResultSchema = z.object({
  analysis: ReferenceImageAnalysisSchema,
  critique: ReferencePreviewCritiqueSchema,
  preview: PreviewRenderResultSchema,
});

export const SolveImageMeasurementsResultSchema = z.object({
  baseSpec: AssetSpecSchema,
  measuredSpec: AssetSpecSchema,
  measurementGuidanceUsed: ImageMeasurementGuidanceSchema,
  observationReport: MeasurementObservationReportSchema.nullable(),
  measurementReport: MeasurementReportSchema,
  referenceImageAnalysis: ReferenceImageAnalysisSchema.nullable().default(null),
});

export const ExtractMeasurementGuidanceResultSchema = z.object({
  measurementGuidance: ImageMeasurementGuidanceSchema,
  observationReport: MeasurementObservationReportSchema,
  referenceImageAnalysis: ReferenceImageAnalysisSchema.nullable().default(null),
});

export const GenerateAssetFromTextResultSchema = z.object({
  prompt: z.string(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  spec: AssetSpecSchema,
  semanticIntent: ReferenceIntentSchema,
  plan: BuildPlanSchema,
  mutationPlan: BuildMutationPlanSchema,
  mutationSummary: BuildMutationSummarySchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  resolvedCubes: z.array(CubeSummarySchema),
  resolvedTextures: z.array(TextureSummarySchema),
  structureSummary: ProjectStructureSummarySchema,
  semanticCritique: SemanticCritiqueSchema,
  multiViewCritique: MultiViewCritiqueSchema.nullable(),
  qualityReport: QualityReportSchema,
  repairHistory: RepairHistorySchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export const BuildAssetFromSpecResultSchema = z.object({
  source: z.literal("spec"),
  prompt: z.string().nullable(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  spec: AssetSpecSchema,
  semanticIntent: ReferenceIntentSchema,
  plan: BuildPlanSchema,
  mutationPlan: BuildMutationPlanSchema,
  mutationSummary: BuildMutationSummarySchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  resolvedCubes: z.array(CubeSummarySchema),
  resolvedTextures: z.array(TextureSummarySchema),
  structureSummary: ProjectStructureSummarySchema,
  semanticCritique: SemanticCritiqueSchema,
  multiViewCritique: MultiViewCritiqueSchema.nullable(),
  qualityReport: QualityReportSchema,
  repairHistory: RepairHistorySchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export const GenerateAssetFromImageResultSchema = z.object({
  source: z.literal("image_guidance"),
  prompt: z.string(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  imageGuidance: ImageGuidanceSchema,
  referenceImage: ReferenceImageInputSchema.nullable(),
  referenceImageAnalysis: ReferenceImageAnalysisSchema.nullable(),
  measurementGuidanceUsed: ImageMeasurementGuidanceSchema.nullable(),
  observationReport: MeasurementObservationReportSchema.nullable(),
  measurementReport: MeasurementReportSchema.nullable(),
  spec: AssetSpecSchema,
  semanticIntent: ReferenceIntentSchema,
  plan: BuildPlanSchema,
  mutationPlan: BuildMutationPlanSchema,
  mutationSummary: BuildMutationSummarySchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  resolvedCubes: z.array(CubeSummarySchema),
  resolvedTextures: z.array(TextureSummarySchema),
  structureSummary: ProjectStructureSummarySchema,
  semanticCritique: SemanticCritiqueSchema,
  visualCritique: ReferencePreviewCritiqueSchema.nullable(),
  multiViewCritique: MultiViewCritiqueSchema.nullable(),
  qualityReport: QualityReportSchema,
  repairHistory: RepairHistorySchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectClearInput = z.infer<typeof ProjectClearInputSchema>;
export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type TargetRef = z.infer<typeof TargetRefSchema>;
export type EnsureProjectMode = z.infer<typeof EnsureProjectModeSchema>;
export type EnsureProjectInput = z.infer<typeof EnsureProjectInputSchema>;
export type EnsureProjectResult = z.infer<typeof EnsureProjectResultSchema>;
export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;
export type CubeFaceDirection = z.infer<typeof CubeFaceDirectionSchema>;
export type CubeFaceLayout = z.infer<typeof CubeFaceLayoutSchema>;
export type CubeFacesLayout = z.infer<typeof CubeFacesLayoutSchema>;
export type CubeCreateInput = z.infer<typeof CubeCreateInputSchema>;
export type CubeResult = z.infer<typeof CubeResultSchema>;
export type CubeSummary = z.infer<typeof CubeSummarySchema>;
export type CubeUpdateInput = z.infer<typeof CubeUpdateInputSchema>;
export type CubeDeleteInput = z.infer<typeof CubeDeleteInputSchema>;
export type CubeDeleteResult = z.infer<typeof CubeDeleteResultSchema>;
export type TextureCreateInput = z.infer<typeof TextureCreateInputSchema>;
export type TextureResult = z.infer<typeof TextureResultSchema>;
export type TextureSummary = z.infer<typeof TextureSummarySchema>;
export type TextureReadInput = z.infer<typeof TextureReadInputSchema>;
export type TextureReadResult = z.infer<typeof TextureReadResultSchema>;
export type TextureUpdateInput = z.infer<typeof TextureUpdateInputSchema>;
export type TextureDeleteInput = z.infer<typeof TextureDeleteInputSchema>;
export type TextureDeleteResult = z.infer<typeof TextureDeleteResultSchema>;
export type TextureRegion = z.infer<typeof TextureRegionSchema>;
export type TexturePaintRegionInput = z.infer<typeof TexturePaintRegionInputSchema>;
export type TexturePaintRegionResult = z.infer<typeof TexturePaintRegionResultSchema>;
export type TextureAssignInput = z.infer<typeof TextureAssignInputSchema>;
export type TextureAssignResult = z.infer<typeof TextureAssignResultSchema>;
export type ProjectContents = z.infer<typeof ProjectContentsSchema>;
export type GroupSummary = z.infer<typeof GroupSummarySchema>;
export type SceneGraphCubeSummary = z.infer<typeof SceneGraphCubeSummarySchema>;
export type SelectionNodeSummary = z.infer<typeof SelectionNodeSummarySchema>;
export type SelectionSummary = z.infer<typeof SelectionSummarySchema>;
export type SceneGraphSummary = z.infer<typeof SceneGraphSummarySchema>;
export type GroupCreateInput = z.infer<typeof GroupCreateInputSchema>;
export type GroupUpdateInput = z.infer<typeof GroupUpdateInputSchema>;
export type GroupDeleteInput = z.infer<typeof GroupDeleteInputSchema>;
export type GroupDeleteResult = z.infer<typeof GroupDeleteResultSchema>;
export type SceneNodeType = z.infer<typeof SceneNodeTypeSchema>;
export type SceneNodeRef = z.infer<typeof SceneNodeRefSchema>;
export type ReparentSceneNodeInput = z.infer<typeof ReparentSceneNodeInputSchema>;
export type ReparentSceneNodeResult = z.infer<typeof ReparentSceneNodeResultSchema>;
export type SelectSceneNodesInput = z.infer<typeof SelectSceneNodesInputSchema>;
export type ProjectSnapshotTexture = z.infer<typeof ProjectSnapshotTextureSchema>;
export type ProjectSnapshotCube = z.infer<typeof ProjectSnapshotCubeSchema>;
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
export type CreateProjectSnapshotInput = z.infer<typeof CreateProjectSnapshotInputSchema>;
export type RestoreProjectSnapshotInput = z.infer<typeof RestoreProjectSnapshotInputSchema>;
export type RestoreProjectSnapshotResult = z.infer<typeof RestoreProjectSnapshotResultSchema>;
export type SnapshotDiffEntry = z.infer<typeof SnapshotDiffEntrySchema>;
export type DiffProjectSnapshotsInput = z.infer<typeof DiffProjectSnapshotsInputSchema>;
export type DiffProjectSnapshotsResult = z.infer<typeof DiffProjectSnapshotsResultSchema>;
export type CodecSummary = z.infer<typeof CodecSummarySchema>;
export type ListCodecsResult = z.infer<typeof ListCodecsResultSchema>;
export type ExportProjectInput = z.infer<typeof ExportProjectInputSchema>;
export type ExportProjectResult = z.infer<typeof ExportProjectResultSchema>;
export type ImportProjectInput = z.infer<typeof ImportProjectInputSchema>;
export type ImportProjectResult = z.infer<typeof ImportProjectResultSchema>;
export type DescribeProjectStructureInput = z.infer<typeof DescribeProjectStructureInputSchema>;
export type ProjectValidateInput = z.infer<typeof ProjectValidateInputSchema>;
export type ProjectValidationMetrics = z.infer<typeof ProjectValidationMetricsSchema>;
export type ProjectValidationResult = z.infer<typeof ProjectValidationResultSchema>;
export type PreviewRenderInput = z.infer<typeof PreviewRenderInputSchema>;
export type PreviewRenderResult = z.infer<typeof PreviewRenderResultSchema>;
export type PromptAnalysisInput = z.infer<typeof PromptAnalysisInputSchema>;
export type AssetPart = z.infer<typeof AssetPartSchema>;
export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type ReferenceFeatureCode = z.infer<typeof ReferenceFeatureCodeSchema>;
export type ReferenceIntent = z.infer<typeof ReferenceIntentSchema>;
export type ProjectStructureChairSummary = z.infer<typeof ProjectStructureChairSummarySchema>;
export type ProjectStructureBedSummary = z.infer<typeof ProjectStructureBedSummarySchema>;
export type ProjectStructureSummary = z.infer<typeof ProjectStructureSummarySchema>;
export type CritiqueProjectAgainstIntentInput = z.infer<typeof CritiqueProjectAgainstIntentInputSchema>;
export type SemanticCritique = z.infer<typeof SemanticCritiqueSchema>;
export type ImageGuidance = z.infer<typeof ImageGuidanceSchema>;
export type MeasurementAxis = z.infer<typeof MeasurementAxisSchema>;
export type MeasurementUnitSystem = z.infer<typeof MeasurementUnitSystemSchema>;
export type AxisPixelSize = z.infer<typeof AxisPixelSizeSchema>;
export type MeasurementAnchor = z.infer<typeof MeasurementAnchorSchema>;
export type MeasuredPartInput = z.infer<typeof MeasuredPartInputSchema>;
export type ObservationPlane = z.infer<typeof ObservationPlaneSchema>;
export type ImageView = z.infer<typeof ImageViewSchema>;
export type PixelRect = z.infer<typeof PixelRectSchema>;
export type ObservedMeasurementInput = z.infer<typeof ObservedMeasurementInputSchema>;
export type ImageMeasurementGuidance = z.infer<typeof ImageMeasurementGuidanceSchema>;
export type ImageObservationGuidance = z.infer<typeof ImageObservationGuidanceSchema>;
export type ReferenceImageBackgroundMode = z.infer<typeof ReferenceImageBackgroundModeSchema>;
export type ReferenceImageInput = z.infer<typeof ReferenceImageInputSchema>;
export type ReferenceImagePartAnalysis = z.infer<typeof ReferenceImagePartAnalysisSchema>;
export type ReferenceImageAnalysis = z.infer<typeof ReferenceImageAnalysisSchema>;
export type MaterialSlot = z.infer<typeof MaterialSlotSchema>;
export type PlannedCube = z.infer<typeof PlannedCubeSchema>;
export type BuildPlan = z.infer<typeof BuildPlanSchema>;
export type MutationStrategy = z.infer<typeof MutationStrategySchema>;
export type BuildMutationOperation = z.infer<typeof BuildMutationOperationSchema>;
export type BuildMutationSafety = z.infer<typeof BuildMutationSafetySchema>;
export type BuildMutationPlan = z.infer<typeof BuildMutationPlanSchema>;
export type BuildMutationSummary = z.infer<typeof BuildMutationSummarySchema>;
export type BuildAssetFromSpecInput = z.infer<typeof BuildAssetFromSpecInputSchema>;
export type GenerateAssetFromTextInput = z.infer<typeof GenerateAssetFromTextInputSchema>;
export type DraftAssetSpecFromImageInput = z.infer<typeof DraftAssetSpecFromImageInputSchema>;
export type GenerateAssetFromImageInput = z.infer<typeof GenerateAssetFromImageInputSchema>;
export type SolveImageMeasurementsInput = z.infer<typeof SolveImageMeasurementsInputSchema>;
export type ExtractMeasurementGuidanceInput = z.infer<typeof ExtractMeasurementGuidanceInputSchema>;
export type AnalyzeReferenceImageInput = z.infer<typeof AnalyzeReferenceImageInputSchema>;
export type CritiquePreviewAgainstReferenceInput = z.infer<typeof CritiquePreviewAgainstReferenceInputSchema>;
export type GeneratedTextureAtlas = z.infer<typeof GeneratedTextureAtlasSchema>;
export type QualityFinding = z.infer<typeof QualityFindingSchema>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
export type RepairLoopInput = z.infer<typeof RepairLoopInputSchema>;
export type RepairAdjustment = z.infer<typeof RepairAdjustmentSchema>;
export type RepairPass = z.infer<typeof RepairPassSchema>;
export type RepairHistory = z.infer<typeof RepairHistorySchema>;
export type MeasuredPartReport = z.infer<typeof MeasuredPartReportSchema>;
export type MeasurementReport = z.infer<typeof MeasurementReportSchema>;
export type MeasurementObservationReport = z.infer<typeof MeasurementObservationReportSchema>;
export type ReferencePreviewCritiqueMetrics = z.infer<typeof ReferencePreviewCritiqueMetricsSchema>;
export type ReferencePreviewCritique = z.infer<typeof ReferencePreviewCritiqueSchema>;
export type MultiViewCritiqueViewKey = z.infer<typeof MultiViewCritiqueViewKeySchema>;
export type MultiViewCritiqueViewMetrics = z.infer<typeof MultiViewCritiqueViewMetricsSchema>;
export type MultiViewCritiqueView = z.infer<typeof MultiViewCritiqueViewSchema>;
export type MultiViewCritique = z.infer<typeof MultiViewCritiqueSchema>;
export type SolveImageMeasurementsResult = z.infer<typeof SolveImageMeasurementsResultSchema>;
export type ExtractMeasurementGuidanceResult = z.infer<typeof ExtractMeasurementGuidanceResultSchema>;
export type GenerateAssetFromTextResult = z.infer<typeof GenerateAssetFromTextResultSchema>;
export type BuildAssetFromSpecResult = z.infer<typeof BuildAssetFromSpecResultSchema>;
export type GenerateAssetFromImageResult = z.infer<typeof GenerateAssetFromImageResultSchema>;
