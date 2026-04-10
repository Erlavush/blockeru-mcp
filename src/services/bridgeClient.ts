import type {
  BridgeHealth,
  CreateProjectSnapshotInput,
  CubeCreateInput,
  CubeDeleteInput,
  CubeDeleteResult,
  CubeResult,
  CubeSummary,
  ExportProjectInput,
  ExportProjectResult,
  GroupCreateInput,
  GroupDeleteInput,
  GroupDeleteResult,
  GroupSummary,
  GroupUpdateInput,
  ImportProjectInput,
  ImportProjectResult,
  ListCodecsResult,
  PreviewRenderInput,
  PreviewRenderResult,
  ProjectContents,
  ProjectClearInput,
  ProjectCreateInput,
  ProjectSnapshot,
  ProjectState,
  ReparentSceneNodeInput,
  ReparentSceneNodeResult,
  RestoreProjectSnapshotInput,
  RestoreProjectSnapshotResult,
  SceneGraphSummary,
  SelectSceneNodesInput,
  SelectionSummary,
  TextureAssignInput,
  TextureAssignResult,
  TextureCreateInput,
  TextureDeleteInput,
  TextureDeleteResult,
  TextureReadInput,
  TextureReadResult,
  TextureResult,
  TextureUpdateInput,
  CubeUpdateInput,
} from "../contracts/schemas.js";
import {
  BridgeHealthSchema,
  CubeDeleteResultSchema,
  CubeResultSchema,
  CubeSummarySchema,
  ExportProjectResultSchema,
  GroupDeleteResultSchema,
  GroupSummarySchema,
  ImportProjectResultSchema,
  ListCodecsResultSchema,
  PreviewRenderResultSchema,
  ProjectContentsSchema,
  ProjectSnapshotSchema,
  ProjectStateSchema,
  ReparentSceneNodeResultSchema,
  RestoreProjectSnapshotResultSchema,
  SceneGraphSummarySchema,
  SelectionSummarySchema,
  TextureAssignResultSchema,
  TextureDeleteResultSchema,
  TextureReadResultSchema,
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

  async clearProject(input: ProjectClearInput): Promise<ProjectState> {
    const data = await this.#request("project/clear", {
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

  async getProjectContents(): Promise<ProjectContents> {
    const data = await this.#request("project/contents", { method: "GET" });
    return ProjectContentsSchema.parse(data);
  }

  async getSceneGraph(): Promise<SceneGraphSummary> {
    const data = await this.#request("scene/graph", { method: "GET" });
    return SceneGraphSummarySchema.parse(data);
  }

  async createGroup(input: GroupCreateInput): Promise<GroupSummary> {
    const data = await this.#request("group/create", {
      method: "POST",
      body: input,
    });
    return GroupSummarySchema.parse(data);
  }

  async updateGroup(input: GroupUpdateInput): Promise<GroupSummary> {
    const data = await this.#request("group/update", {
      method: "POST",
      body: input,
    });
    return GroupSummarySchema.parse(data);
  }

  async deleteGroup(input: GroupDeleteInput): Promise<GroupDeleteResult> {
    const data = await this.#request("group/delete", {
      method: "POST",
      body: input,
    });
    return GroupDeleteResultSchema.parse(data);
  }

  async reparentSceneNode(input: ReparentSceneNodeInput): Promise<ReparentSceneNodeResult> {
    const data = await this.#request("scene/reparent", {
      method: "POST",
      body: input,
    });
    return ReparentSceneNodeResultSchema.parse(data);
  }

  async getSelection(): Promise<SelectionSummary> {
    const data = await this.#request("scene/selection", { method: "GET" });
    return SelectionSummarySchema.parse(data);
  }

  async selectSceneNodes(input: SelectSceneNodesInput): Promise<SelectionSummary> {
    const data = await this.#request("scene/select", {
      method: "POST",
      body: input,
    });
    return SelectionSummarySchema.parse(data);
  }

  async createProjectSnapshot(input: CreateProjectSnapshotInput): Promise<ProjectSnapshot> {
    const data = await this.#request("project/snapshot", {
      method: "POST",
      body: input,
    });
    return ProjectSnapshotSchema.parse(data);
  }

  async restoreProjectSnapshot(input: RestoreProjectSnapshotInput): Promise<RestoreProjectSnapshotResult> {
    const data = await this.#request("project/restore", {
      method: "POST",
      body: input,
    });
    return RestoreProjectSnapshotResultSchema.parse(data);
  }

  async listCodecs(): Promise<ListCodecsResult> {
    const data = await this.#request("codecs/list", { method: "GET" });
    return ListCodecsResultSchema.parse(data);
  }

  async exportProject(input: ExportProjectInput): Promise<ExportProjectResult> {
    const data = await this.#request("project/export", {
      method: "POST",
      body: input,
    });
    return ExportProjectResultSchema.parse(data);
  }

  async importProject(input: ImportProjectInput): Promise<ImportProjectResult> {
    const data = await this.#request("project/import", {
      method: "POST",
      body: input,
    });
    return ImportProjectResultSchema.parse(data);
  }

  async updateCube(input: CubeUpdateInput): Promise<CubeSummary> {
    const data = await this.#request("cube/update", {
      method: "POST",
      body: input,
    });
    return CubeSummarySchema.parse(data);
  }

  async deleteCube(input: CubeDeleteInput): Promise<CubeDeleteResult> {
    const data = await this.#request("cube/delete", {
      method: "POST",
      body: input,
    });
    return CubeDeleteResultSchema.parse(data);
  }

  async readTexture(input: TextureReadInput): Promise<TextureReadResult> {
    const data = await this.#request("texture/read", {
      method: "POST",
      body: input,
    });
    return TextureReadResultSchema.parse(data);
  }

  async updateTexture(input: TextureUpdateInput): Promise<TextureResult> {
    const data = await this.#request("texture/update", {
      method: "POST",
      body: input,
    });
    return TextureResultSchema.parse(data);
  }

  async deleteTexture(input: TextureDeleteInput): Promise<TextureDeleteResult> {
    const data = await this.#request("texture/delete", {
      method: "POST",
      body: input,
    });
    return TextureDeleteResultSchema.parse(data);
  }

  async assignTexture(input: TextureAssignInput): Promise<TextureAssignResult> {
    const data = await this.#request("texture/assign", {
      method: "POST",
      body: input,
    });
    return TextureAssignResultSchema.parse(data);
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
