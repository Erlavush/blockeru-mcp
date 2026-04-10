import type {
  BuildPlan,
  GeneratedTextureAtlas,
  ProjectContents,
  TextureDeleteResult,
  TextureResult,
  TextureSummary,
} from "../contracts/schemas.js";
import type { BridgeClient } from "./bridgeClient.js";

export type ManagedTextureAction = "none" | "created" | "updated" | "reused";

export type ManagedTexturePlan = {
  action: ManagedTextureAction;
  primaryTexture: TextureSummary | null;
  staleTextures: TextureSummary[];
  legacyTextureMatched: boolean;
};

export type ManagedTextureExecutionResult = {
  action: ManagedTextureAction;
  texture: TextureResult | null;
  deletedTextures: TextureDeleteResult[];
  finalRevision: number | null;
};

function getLegacyTextureNames(plan: BuildPlan): string[] {
  return [`${plan.projectName}-atlas`];
}

function isManagedTextureName(plan: BuildPlan, textureName: string): boolean {
  return textureName === plan.managedTextureName || getLegacyTextureNames(plan).includes(textureName);
}

function listManagedTextureCandidates(contents: ProjectContents, plan: BuildPlan): TextureSummary[] {
  return contents.textures.filter((texture) => isManagedTextureName(plan, texture.name));
}

function choosePrimaryTexture(candidates: TextureSummary[], plan: BuildPlan): TextureSummary | null {
  const exact = candidates.find((texture) => texture.name === plan.managedTextureName);
  if (exact) {
    return exact;
  }

  return candidates[0] ?? null;
}

export function planManagedTextureMutation(options: {
  contents: ProjectContents;
  plan: BuildPlan;
  createTexture: boolean;
}): ManagedTexturePlan {
  if (!options.createTexture) {
    const candidates = listManagedTextureCandidates(options.contents, options.plan);

    return {
      action: "none",
      primaryTexture: null,
      staleTextures: candidates,
      legacyTextureMatched: false,
    };
  }

  const candidates = listManagedTextureCandidates(options.contents, options.plan);
  const primaryTexture = choosePrimaryTexture(candidates, options.plan);
  const staleTextures =
    primaryTexture === null
      ? candidates
      : candidates.filter((texture) => texture.uuid !== primaryTexture.uuid);

  return {
    action: primaryTexture === null ? "created" : "updated",
    primaryTexture,
    staleTextures,
    legacyTextureMatched:
      primaryTexture !== null && primaryTexture.name !== options.plan.managedTextureName,
  };
}

export async function applyManagedTextureMutation(options: {
  bridge: BridgeClient;
  atlas: GeneratedTextureAtlas | null;
  executionPlan: ManagedTexturePlan;
  plan: BuildPlan;
  currentRevision: number | null;
}): Promise<ManagedTextureExecutionResult> {
  if (options.atlas === null) {
    return {
      action: "none",
      texture: null,
      deletedTextures: [],
      finalRevision: options.currentRevision,
    };
  }

  let revision = options.currentRevision;
  let texture: TextureResult | null = null;
  let action: ManagedTextureAction = options.executionPlan.action;

  if (options.executionPlan.primaryTexture === null) {
    texture = await options.bridge.createTexture({
      name: options.plan.managedTextureName,
      dataUrl: options.atlas.dataUrl,
      applyToAll: false,
      setAsDefault: true,
      ifRevision: revision ?? undefined,
    });
    revision = texture.revision;
    action = "created";
  } else {
    const currentTexture = await options.bridge.readTexture({
      target: { uuid: options.executionPlan.primaryTexture.uuid },
    });
    const samePixels = currentTexture.dataUrl === options.atlas.dataUrl;
    const sameName = currentTexture.name === options.plan.managedTextureName;

    if (samePixels && sameName && currentTexture.useAsDefault) {
      texture = {
        uuid: currentTexture.uuid,
        name: currentTexture.name,
        width: currentTexture.width,
        height: currentTexture.height,
        useAsDefault: currentTexture.useAsDefault,
        revision: revision ?? 1,
      };
      action = "reused";
    } else {
      texture = await options.bridge.updateTexture({
        target: { uuid: options.executionPlan.primaryTexture.uuid },
        name: options.plan.managedTextureName,
        dataUrl: options.atlas.dataUrl,
        applyToAll: false,
        setAsDefault: true,
        ifRevision: revision ?? undefined,
      });
      revision = texture.revision;
      action = "updated";
    }
  }

  return {
    action,
    texture,
    deletedTextures: [],
    finalRevision: revision,
  };
}

export async function cleanupManagedTextures(options: {
  bridge: BridgeClient;
  staleTextures: TextureSummary[];
  currentRevision: number | null;
}): Promise<{ deletedTextures: TextureDeleteResult[]; finalRevision: number | null }> {
  const deletedTextures: TextureDeleteResult[] = [];
  let revision = options.currentRevision;

  for (const texture of options.staleTextures) {
    const deleted = await options.bridge.deleteTexture({
      target: { uuid: texture.uuid },
      ifRevision: revision ?? undefined,
    });
    deletedTextures.push(deleted);
    revision = deleted.revision;
  }

  return {
    deletedTextures,
    finalRevision: revision,
  };
}
