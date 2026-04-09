import type {
  BridgeHealth,
  CubeCreateInput,
  CubeResult,
  PreviewRenderInput,
  PreviewRenderResult,
  ProjectCreateInput,
  ProjectState,
  TextureCreateInput,
  TextureResult,
} from "../contracts/schemas.js";
import {
  BridgeHealthSchema,
  CubeResultSchema,
  PreviewRenderResultSchema,
  ProjectStateSchema,
  TextureResultSchema,
} from "../contracts/schemas.js";

type BridgeEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

export class BridgeClient {
  readonly #baseUrl: URL;
  readonly #timeoutMs: number;

  constructor(baseUrl: string, timeoutMs: number) {
    this.#baseUrl = new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    this.#timeoutMs = timeoutMs;
  }

  get baseUrl(): string {
    return this.#baseUrl.toString().replace(/\/$/, "");
  }

  async health(): Promise<BridgeHealth> {
    const data = await this.#request("health", { method: "GET" });
    return BridgeHealthSchema.parse(data);
  }

  async getProjectState(): Promise<ProjectState> {
    const data = await this.#request("project/state", { method: "GET" });
    return ProjectStateSchema.parse(data);
  }

  async createProject(input: ProjectCreateInput): Promise<ProjectState> {
    const data = await this.#request("project/create", {
      method: "POST",
      body: input,
    });
    return ProjectStateSchema.parse(data);
  }

  async addCube(input: CubeCreateInput): Promise<CubeResult> {
    const data = await this.#request("cube/add", {
      method: "POST",
      body: input,
    });
    return CubeResultSchema.parse(data);
  }

  async createTexture(input: TextureCreateInput): Promise<TextureResult> {
    const data = await this.#request("texture/create", {
      method: "POST",
      body: input,
    });
    return TextureResultSchema.parse(data);
  }

  async renderPreview(input: PreviewRenderInput): Promise<PreviewRenderResult> {
    const data = await this.#request("preview/render", {
      method: "POST",
      body: input,
    });
    return PreviewRenderResultSchema.parse(data);
  }

  async #request(
    path: string,
    options: {
      method: "GET" | "POST";
      body?: unknown;
    },
  ): Promise<unknown> {
    const url = new URL(path.replace(/^\//, ""), this.#baseUrl);
    const headers = new Headers();

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(this.#timeoutMs),
    });

    const envelope = (await response.json()) as BridgeEnvelope;

    if (!response.ok || !envelope.ok) {
      throw new Error(envelope.error || `Bridge request failed with status ${response.status}`);
    }

    return envelope.data;
  }
}
