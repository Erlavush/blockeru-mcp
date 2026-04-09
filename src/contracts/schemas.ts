import { z } from "zod";

export const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vector2Schema = z.tuple([z.number(), z.number()]);
export const Vector4Schema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
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
});

export const ProjectClearInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  textureWidth: z.number().int().positive().optional(),
  textureHeight: z.number().int().positive().optional(),
  boxUv: z.boolean().optional(),
});

export const ProjectStateSchema = z.object({
  open: z.boolean(),
  name: z.string().nullable(),
  formatId: z.string().nullable(),
  boxUv: z.boolean().nullable(),
  textureWidth: z.number().int().positive().nullable(),
  textureHeight: z.number().int().positive().nullable(),
  cubeCount: z.number().int().nonnegative(),
  textureCount: z.number().int().nonnegative(),
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
});

export const CubeResultSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  from: Vector3Schema,
  to: Vector3Schema,
  origin: Vector3Schema,
  textureRef: z.string().nullable(),
});

export const TextureCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  dataUrl: z.string().startsWith("data:image/"),
  applyToAll: z.boolean().default(false),
  setAsDefault: z.boolean().default(true),
});

export const TextureResultSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  useAsDefault: z.boolean(),
});

export const PreviewRenderInputSchema = z.object({
  mimeType: z.literal("image/png").default("image/png"),
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
  estimatedSize: Vector3Schema,
  symmetry: z.enum(["none", "mirror_x", "mirror_z", "radial"]),
  materials: z.array(z.string()),
  palette: z.array(z.string()),
  parts: z.array(AssetPartSchema),
  textureStrategy: z.string(),
  constraints: z.array(z.string()),
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

export const MaterialSlotSchema = z.object({
  slotId: z.string(),
  label: z.string(),
  material: z.string(),
  uvOffset: Vector2Schema,
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

export const BuildAssetFromSpecInputSchema = z.object({
  spec: AssetSpecSchema,
  prompt: z.string().trim().min(1).optional(),
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
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
  projectMode: z.enum(["replace_current_project", "new_project"]).default("replace_current_project"),
  createTexture: z.boolean().default(true),
  renderPreview: z.boolean().default(true),
});

export const DraftAssetSpecFromImageInputSchema = z.object({
  prompt: z.string().trim().min(1),
  formatId: z.string().trim().min(1).default("free"),
  imageGuidance: ImageGuidanceSchema,
});

export const GenerateAssetFromImageInputSchema = z.object({
  prompt: z.string().trim().min(1),
  imageGuidance: ImageGuidanceSchema,
  projectName: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("free"),
  textureWidth: z.number().int().positive().default(256),
  textureHeight: z.number().int().positive().default(256),
  boxUv: z.boolean().default(false),
  projectMode: z
    .enum(["replace_current_project", "new_project"])
    .default("replace_current_project"),
  createTexture: z.boolean().default(true),
  renderPreview: z.boolean().default(true),
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

export const GenerateAssetFromTextResultSchema = z.object({
  prompt: z.string(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  spec: AssetSpecSchema,
  plan: BuildPlanSchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  qualityReport: QualityReportSchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export const BuildAssetFromSpecResultSchema = z.object({
  source: z.literal("spec"),
  prompt: z.string().nullable(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  spec: AssetSpecSchema,
  plan: BuildPlanSchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  qualityReport: QualityReportSchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export const GenerateAssetFromImageResultSchema = z.object({
  source: z.literal("image_guidance"),
  prompt: z.string(),
  projectModeUsed: z.enum(["replace_current_project", "new_project"]),
  imageGuidance: ImageGuidanceSchema,
  spec: AssetSpecSchema,
  plan: BuildPlanSchema,
  project: ProjectStateSchema,
  texture: TextureResultSchema.nullable(),
  createdCubes: z.array(CubeResultSchema),
  qualityReport: QualityReportSchema,
  preview: PreviewRenderResultSchema.nullable(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectClearInput = z.infer<typeof ProjectClearInputSchema>;
export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;
export type CubeFaceDirection = z.infer<typeof CubeFaceDirectionSchema>;
export type CubeFaceLayout = z.infer<typeof CubeFaceLayoutSchema>;
export type CubeFacesLayout = z.infer<typeof CubeFacesLayoutSchema>;
export type CubeCreateInput = z.infer<typeof CubeCreateInputSchema>;
export type CubeResult = z.infer<typeof CubeResultSchema>;
export type TextureCreateInput = z.infer<typeof TextureCreateInputSchema>;
export type TextureResult = z.infer<typeof TextureResultSchema>;
export type PreviewRenderInput = z.infer<typeof PreviewRenderInputSchema>;
export type PreviewRenderResult = z.infer<typeof PreviewRenderResultSchema>;
export type PromptAnalysisInput = z.infer<typeof PromptAnalysisInputSchema>;
export type AssetPart = z.infer<typeof AssetPartSchema>;
export type AssetSpec = z.infer<typeof AssetSpecSchema>;
export type ImageGuidance = z.infer<typeof ImageGuidanceSchema>;
export type MaterialSlot = z.infer<typeof MaterialSlotSchema>;
export type PlannedCube = z.infer<typeof PlannedCubeSchema>;
export type BuildPlan = z.infer<typeof BuildPlanSchema>;
export type BuildAssetFromSpecInput = z.infer<typeof BuildAssetFromSpecInputSchema>;
export type GenerateAssetFromTextInput = z.infer<typeof GenerateAssetFromTextInputSchema>;
export type DraftAssetSpecFromImageInput = z.infer<typeof DraftAssetSpecFromImageInputSchema>;
export type GenerateAssetFromImageInput = z.infer<typeof GenerateAssetFromImageInputSchema>;
export type GeneratedTextureAtlas = z.infer<typeof GeneratedTextureAtlasSchema>;
export type QualityFinding = z.infer<typeof QualityFindingSchema>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;
export type GenerateAssetFromTextResult = z.infer<typeof GenerateAssetFromTextResultSchema>;
export type BuildAssetFromSpecResult = z.infer<typeof BuildAssetFromSpecResultSchema>;
export type GenerateAssetFromImageResult = z.infer<typeof GenerateAssetFromImageResultSchema>;
