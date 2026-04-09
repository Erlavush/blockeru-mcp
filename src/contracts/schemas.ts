import { z } from "zod";

export const Vector3Schema = z.tuple([z.number(), z.number(), z.number()]);
export const Vector2Schema = z.tuple([z.number(), z.number()]);

export const ProjectCreateInputSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  formatId: z.string().trim().min(1).default("java_block"),
  textureWidth: z.number().int().positive().default(64),
  textureHeight: z.number().int().positive().default(64),
  boxUv: z.boolean().default(false),
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

export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectState = z.infer<typeof ProjectStateSchema>;
export type BridgeHealth = z.infer<typeof BridgeHealthSchema>;
export type CubeCreateInput = z.infer<typeof CubeCreateInputSchema>;
export type CubeResult = z.infer<typeof CubeResultSchema>;
export type TextureCreateInput = z.infer<typeof TextureCreateInputSchema>;
export type TextureResult = z.infer<typeof TextureResultSchema>;
export type PreviewRenderInput = z.infer<typeof PreviewRenderInputSchema>;
export type PreviewRenderResult = z.infer<typeof PreviewRenderResultSchema>;
export type PromptAnalysisInput = z.infer<typeof PromptAnalysisInputSchema>;
export type AssetSpec = z.infer<typeof AssetSpecSchema>;
