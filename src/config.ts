import {
  DEFAULT_BOX_UV,
  DEFAULT_BRIDGE_URL,
  DEFAULT_PROJECT_FORMAT,
  DEFAULT_TEXTURE_HEIGHT,
  DEFAULT_TEXTURE_WIDTH,
  SERVER_NAME,
} from "./constants.js";

export type ServerConfig = {
  serverName: string;
  bridgeUrl: string;
  requestTimeoutMs: number;
  defaultProjectFormat: string;
  defaultTextureWidth: number;
  defaultTextureHeight: number;
  defaultBoxUv: boolean;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): ServerConfig {
  return {
    serverName: process.env.BLOCKERU_SERVER_NAME?.trim() || SERVER_NAME,
    bridgeUrl: process.env.BLOCKERU_BRIDGE_URL?.trim() || DEFAULT_BRIDGE_URL,
    requestTimeoutMs: parseNumber(process.env.BLOCKERU_REQUEST_TIMEOUT_MS, 5_000),
    defaultProjectFormat:
      process.env.BLOCKERU_DEFAULT_PROJECT_FORMAT?.trim() || DEFAULT_PROJECT_FORMAT,
    defaultTextureWidth: parseNumber(
      process.env.BLOCKERU_DEFAULT_TEXTURE_WIDTH,
      DEFAULT_TEXTURE_WIDTH,
    ),
    defaultTextureHeight: parseNumber(
      process.env.BLOCKERU_DEFAULT_TEXTURE_HEIGHT,
      DEFAULT_TEXTURE_HEIGHT,
    ),
    defaultBoxUv: parseBoolean(process.env.BLOCKERU_DEFAULT_BOX_UV, DEFAULT_BOX_UV),
  };
}
