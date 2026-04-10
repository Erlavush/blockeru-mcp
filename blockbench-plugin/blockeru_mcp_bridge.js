(function () {
  const PLUGIN_ID = "blockeru_mcp_bridge";
  const PLUGIN_TITLE = "Blockeru MCP Bridge";
  const VERSION = "0.1.0";
  const HOST = "127.0.0.1";
  const PORT = 37891;
  const BASE_PATH = "/blockeru-bridge";

  let httpServer = null;
  let startupError = null;
  let trackedProjectRef = null;
  let projectRevision = 0;

  function ensure(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  function reportStatus(message, duration) {
    console.log(`[${PLUGIN_TITLE}] ${message}`);
    if (typeof Blockbench !== "undefined" && typeof Blockbench.showQuickMessage === "function") {
      Blockbench.showQuickMessage(message, duration || 4000);
    }
  }

  function reportError(error) {
    startupError = error instanceof Error ? error.message : String(error);
    console.error(`[${PLUGIN_TITLE}]`, error);
    reportStatus(`${PLUGIN_TITLE} failed: ${startupError}`, 6000);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getStatusText(statusCode) {
    const texts = {
      200: "OK",
      204: "No Content",
      400: "Bad Request",
      404: "Not Found",
      405: "Method Not Allowed",
      500: "Internal Server Error",
    };

    return texts[statusCode] || "Unknown";
  }

  function sendSocketResponse(socket, statusCode, payload) {
    if (!socket || socket.destroyed || !socket.writable) {
      return;
    }

    const body = JSON.stringify(payload);
    const headers = [
      `HTTP/1.1 ${statusCode} ${getStatusText(statusCode)}`,
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "Access-Control-Allow-Origin: *",
      "Access-Control-Allow-Methods: GET, POST, OPTIONS",
      "Access-Control-Allow-Headers: Content-Type",
      "Connection: close",
      `Date: ${new Date().toUTCString()}`,
      "",
      body,
    ];

    socket.end(headers.join("\r\n"));
  }

  function sendSocketOk(socket, data) {
    sendSocketResponse(socket, 200, { ok: true, data: data });
  }

  function sendSocketError(socket, statusCode, error) {
    sendSocketResponse(socket, statusCode, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  function currentProject() {
    return typeof Project === "undefined" ? null : Project;
  }

  function syncProjectRevision() {
    const project = currentProject();

    if (!project) {
      trackedProjectRef = null;
      projectRevision = 0;
      return null;
    }

    if (project !== trackedProjectRef) {
      trackedProjectRef = project;
      projectRevision = 1;
    }

    return projectRevision;
  }

  function getProjectRevision() {
    return syncProjectRevision();
  }

  function bumpProjectRevision(projectOverride) {
    const project = projectOverride || currentProject();

    if (!project) {
      trackedProjectRef = null;
      projectRevision = 0;
      return null;
    }

    if (project !== trackedProjectRef) {
      trackedProjectRef = project;
      projectRevision = 1;
      return projectRevision;
    }

    projectRevision = Math.max(1, projectRevision + 1);
    return projectRevision;
  }

  function ensureRevision(payload) {
    const expectedRevision =
      payload && typeof payload.ifRevision === "number" ? payload.ifRevision : null;
    const currentRevision = getProjectRevision();

    if (expectedRevision === null) {
      return currentRevision;
    }

    ensure(
      Number.isInteger(expectedRevision) && expectedRevision > 0,
      "ifRevision must be a positive integer.",
    );
    ensure(currentProject(), "No Blockbench project is open.");
    ensure(
      currentRevision === expectedRevision,
      `Project revision mismatch. Expected ${expectedRevision}, current ${currentRevision}.`,
    );

    return currentRevision;
  }

  function getFormatId(project) {
    if (!project || !project.format) {
      return null;
    }

    return project.format.id || project.format.name || null;
  }

  function getProjectState() {
    const project = currentProject();
    const revision = getProjectRevision();
    const cubeCount =
      typeof Cube !== "undefined" && Array.isArray(Cube.all) ? Cube.all.length : 0;
    const textureCount =
      typeof Texture !== "undefined" && Array.isArray(Texture.all) ? Texture.all.length : 0;

    return {
      open: !!project,
      name: project ? project.name || null : null,
      formatId: getFormatId(project),
      boxUv: project ? !!project.box_uv : null,
      textureWidth: project ? Number(project.texture_width || 0) || null : null,
      textureHeight: project ? Number(project.texture_height || 0) || null : null,
      revision: revision,
      cubeCount: cubeCount,
      textureCount: textureCount,
    };
  }

  function getTextureSize(texture) {
    return {
      width: Number(texture?.width || texture?.img?.naturalWidth || texture?.img?.width || 0),
      height: Number(texture?.height || texture?.img?.naturalHeight || texture?.img?.height || 0),
    };
  }

  function summarizeTexture(texture) {
    const size = getTextureSize(texture);

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: size.width,
      height: size.height,
      useAsDefault: !!texture.use_as_default,
    };
  }

  function summarizeCube(cube) {
    let textureRef = null;

    if (cube.faces && typeof cube.faces === "object") {
      const texturedFace = Object.values(cube.faces).find(
        (face) => face && face.texture && face.texture.uuid,
      );

      if (texturedFace && texturedFace.texture) {
        textureRef =
          texturedFace.texture.uuid ||
          texturedFace.texture.id ||
          texturedFace.texture.name ||
          null;
      }
    }

    return {
      uuid: cube.uuid,
      name: cube.name,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
      boxUv: !!cube.box_uv,
      textureRef: textureRef,
      revision: getProjectRevision(),
    };
  }

  function getTextureRefValue(textureLike) {
    if (!textureLike) {
      return null;
    }

    if (typeof textureLike === "string") {
      return textureLike;
    }

    return textureLike.uuid || textureLike.id || textureLike.name || null;
  }

  function getParentPath(node) {
    const path = [];
    let current = node ? node.parent : null;

    while (current && current !== "root") {
      if (typeof current.name === "string" && current.name.trim()) {
        path.unshift(current.name);
      }
      current = current.parent || null;
    }

    return path;
  }

  function serializeCubeFaces(cube) {
    const serialized = {};

    if (!cube || !cube.faces || typeof cube.faces !== "object") {
      return serialized;
    }

    Object.keys(cube.faces).forEach((faceKey) => {
      const face = cube.faces[faceKey];

      if (!face) {
        return;
      }

      serialized[faceKey] = {
        uv: Array.isArray(face.uv) ? face.uv : [0, 0, 0, 0],
        ...(typeof face.rotation === "number" ? { rotation: face.rotation } : {}),
        ...(typeof face.enabled === "boolean" ? { enabled: face.enabled } : {}),
        ...(getTextureRefValue(face.texture) !== null
          ? { textureRef: getTextureRefValue(face.texture) }
          : {}),
      };
    });

    return serialized;
  }

  function serializeCubeSnapshot(cube) {
    return {
      uuid: cube.uuid,
      name: cube.name,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
      uvOffset: Array.isArray(cube.uv_offset) ? cube.uv_offset : null,
      faces: serializeCubeFaces(cube),
      colorIndex: typeof cube.color === "number" ? cube.color : null,
      boxUv: !!cube.box_uv,
      textureRef: summarizeCube(cube).textureRef,
      parentPath: getParentPath(cube),
    };
  }

  function findCube(target) {
    if (!target || typeof Cube === "undefined" || !Array.isArray(Cube.all)) {
      return null;
    }

    if (typeof target.uuid === "string" && target.uuid.trim()) {
      const cubeByUuid = Cube.all.find((cube) => cube && cube.uuid === target.uuid);
      if (cubeByUuid) {
        return cubeByUuid;
      }
    }

    if (typeof target.name === "string" && target.name.trim()) {
      const cubeByName = Cube.all.find((cube) => cube && cube.name === target.name);
      if (cubeByName) {
        return cubeByName;
      }
    }

    return null;
  }

  function findGroup(target) {
    if (!target || typeof Group === "undefined" || !Array.isArray(Group.all)) {
      return null;
    }

    if (typeof target.uuid === "string" && target.uuid.trim()) {
      const groupByUuid = Group.all.find((group) => group && group.uuid === target.uuid);
      if (groupByUuid) {
        return groupByUuid;
      }
    }

    if (typeof target.name === "string" && target.name.trim()) {
      const groupByName = Group.all.find((group) => group && group.name === target.name);
      if (groupByName) {
        return groupByName;
      }
    }

    return null;
  }

  function findSceneNode(nodeRef) {
    if (!nodeRef || !nodeRef.target) {
      return null;
    }

    if (nodeRef.type === "group") {
      return findGroup(nodeRef.target);
    }

    return findCube(nodeRef.target);
  }

  function summarizeSelectionNode(node, type) {
    return {
      type: type,
      uuid: node.uuid,
      name: node.name,
      parentPath: getParentPath(node),
    };
  }

  function summarizeGroup(group) {
    const childCount = Array.isArray(group.children)
      ? group.children.length
      : Array.isArray(group.child_nodes)
        ? group.child_nodes.length
        : 0;

    return {
      uuid: group.uuid,
      name: group.name,
      origin: Array.isArray(group.origin) ? group.origin : [0, 0, 0],
      rotation: Array.isArray(group.rotation) ? group.rotation : [0, 0, 0],
      parentPath: getParentPath(group),
      childCount: childCount,
      visibility: group.visibility !== false,
      export: group.export !== false,
      colorIndex: typeof group.color === "number" ? group.color : 0,
      selected: !!group.selected,
    };
  }

  function summarizeSceneGraphCube(cube) {
    return {
      uuid: cube.uuid,
      name: cube.name,
      parentPath: getParentPath(cube),
      selected: !!cube.selected,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
    };
  }

  function getSelectionSummary() {
    const cubes =
      typeof Cube !== "undefined" && Array.isArray(Cube.all)
        ? Cube.all.filter((cube) => cube && cube.selected).map((cube) => summarizeSelectionNode(cube, "cube"))
        : [];
    const groups =
      typeof Group !== "undefined" && Array.isArray(Group.all)
        ? Group.all.filter((group) => group && group.selected).map((group) => summarizeSelectionNode(group, "group"))
        : [];

    return {
      cubes: cubes,
      groups: groups,
      totalSelected: cubes.length + groups.length,
    };
  }

  function getSceneGraph() {
    const groups =
      typeof Group !== "undefined" && Array.isArray(Group.all)
        ? Group.all.map((group) => summarizeGroup(group))
        : [];
    const cubes =
      typeof Cube !== "undefined" && Array.isArray(Cube.all)
        ? Cube.all.map((cube) => summarizeSceneGraphCube(cube))
        : [];

    return {
      project: getProjectState(),
      groups: groups,
      cubes: cubes,
      selection: getSelectionSummary(),
    };
  }

  function applyCubeFaces(cube, faces) {
    if (!faces || typeof cube.faces !== "object") {
      return;
    }

    cube.box_uv = false;

    if (typeof cube.setUVMode === "function") {
      try {
        cube.setUVMode(false);
      } catch (_error) {
        // Ignore if unavailable.
      }
    }

    Object.keys(faces).forEach((faceKey) => {
      const faceData = faces[faceKey];
      const cubeFace = cube.faces[faceKey];

      if (!faceData || !cubeFace) {
        return;
      }

      cubeFace.uv = faceData.uv;

      if (typeof faceData.rotation === "number") {
        cubeFace.rotation = faceData.rotation;
      }

      if (typeof faceData.enabled === "boolean") {
        cubeFace.enabled = faceData.enabled;
      }

      if (faceData.textureRef !== undefined) {
        if (faceData.textureRef === null) {
          cubeFace.texture = null;
        } else {
          const texture = findTexture(faceData.textureRef);
          ensure(texture, `Texture "${faceData.textureRef}" was not found.`);
          cubeFace.texture = texture.uuid || texture.id || texture.name || null;
        }
      }
    });

    if (typeof cube.mapAutoUV === "function") {
      cube.autouv = 0;
    }
  }

  function getProjectContents() {
    const cubes =
      typeof Cube !== "undefined" && Array.isArray(Cube.all)
        ? Cube.all.map((cube) => summarizeCube(cube))
        : [];
    const textures =
      typeof Texture !== "undefined" && Array.isArray(Texture.all)
        ? Texture.all.map((texture) => summarizeTexture(texture))
        : [];

    return {
      project: getProjectState(),
      cubes: cubes,
      textures: textures,
    };
  }

  async function createProjectSnapshot(payload) {
    ensure(currentProject(), "No Blockbench project is open.");

    const textures =
      typeof Texture !== "undefined" && Array.isArray(Texture.all)
        ? await Promise.all(
            Texture.all.map(async (texture) => {
              const detailed = await readTexture({
                target: {
                  uuid: texture.uuid,
                },
              });

              return {
                uuid: detailed.uuid,
                name: detailed.name,
                width: detailed.width,
                height: detailed.height,
                useAsDefault: detailed.useAsDefault,
                dataUrl: detailed.dataUrl,
              };
            }),
          )
        : [];
    const cubes =
      typeof Cube !== "undefined" && Array.isArray(Cube.all)
        ? Cube.all.map((cube) => serializeCubeSnapshot(cube))
        : [];
    const project = getProjectState();

    return {
      project: {
        name: project.name,
        formatId: project.formatId,
        boxUv: project.boxUv,
        textureWidth: project.textureWidth,
        textureHeight: project.textureHeight,
        revision: project.revision,
      },
      cubes: cubes,
      textures: textures,
    };
  }

  function createGroup(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensure(typeof Group === "function", "Blockbench group API is not available.");
    ensureRevision(payload);

    const parentGroup = payload.parent ? findGroup(payload.parent) : null;
    if (payload.parent) {
      ensure(parentGroup, "Parent group target was not found.");
    }

    const group = new Group({
      name: payload.name,
      origin: payload.origin || [0, 0, 0],
      rotation: payload.rotation || [0, 0, 0],
      color: typeof payload.colorIndex === "number" ? payload.colorIndex : 0,
      visibility: payload.visibility !== false,
      export: payload.export !== false,
    })
      .addTo(parentGroup || "root")
      .init();

    refreshCanvas();
    bumpProjectRevision(currentProject());
    return summarizeGroup(group);
  }

  function updateGroup(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const group = findGroup(payload.target);
    ensure(group, "Group target was not found.");

    if (typeof payload.name === "string" && payload.name.trim()) {
      group.name = payload.name.trim();
    }
    if (Array.isArray(payload.origin)) {
      group.origin = payload.origin;
    }
    if (Array.isArray(payload.rotation)) {
      group.rotation = payload.rotation;
    }
    if (typeof payload.colorIndex === "number") {
      group.color = payload.colorIndex;
    }
    if (typeof payload.visibility === "boolean") {
      group.visibility = payload.visibility;
    }
    if (typeof payload.export === "boolean") {
      group.export = payload.export;
    }

    if (typeof group.updateElement === "function") {
      group.updateElement();
    }

    refreshCanvas();
    bumpProjectRevision(currentProject());
    return summarizeGroup(group);
  }

  function deleteGroup(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const group = findGroup(payload.target);
    ensure(group, "Group target was not found.");

    const summary = {
      deleted: true,
      uuid: group.uuid,
      name: group.name,
    };

    if (typeof group.remove === "function") {
      group.remove();
    } else if (typeof group.delete === "function") {
      group.delete();
    }

    refreshCanvas();
    return {
      ...summary,
      revision: bumpProjectRevision(currentProject()),
    };
  }

  function reparentSceneNode(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const node = findSceneNode(payload.node);
    ensure(node, "Scene node target was not found.");
    const parentGroup = payload.parent ? findGroup(payload.parent) : null;

    if (payload.parent) {
      ensure(parentGroup, "Parent group target was not found.");
      ensure(parentGroup !== node, "Scene node cannot be parented to itself.");
      if (payload.node.type === "group" && typeof parentGroup.isChildOf === "function") {
        ensure(!parentGroup.isChildOf(node), "Scene node cannot be parented under its own descendant.");
      }
    }

    ensure(typeof node.addTo === "function", "Scene node cannot be reparented.");
    node.addTo(parentGroup || "root");

    if (typeof node.updateElement === "function") {
      node.updateElement();
    }

    refreshCanvas();
    return {
      nodeType: payload.node.type,
      uuid: node.uuid,
      name: node.name,
      parentPath: getParentPath(node),
      revision: bumpProjectRevision(currentProject()),
    };
  }

  function clearSelectionState() {
    if (typeof unselectAll === "function") {
      try {
        unselectAll();
        return;
      } catch (_error) {
        // Fall through to manual clear.
      }
    }

    if (typeof Cube !== "undefined" && Array.isArray(Cube.all)) {
      Cube.all.forEach((cube) => {
        if (cube && typeof cube.unselect === "function") {
          cube.unselect();
        } else if (cube) {
          cube.selected = false;
        }
      });
    }

    if (typeof Group !== "undefined" && Array.isArray(Group.all)) {
      Group.all.forEach((group) => {
        if (group && typeof group.unselect === "function") {
          group.unselect();
        } else if (group) {
          group.selected = false;
        }
      });
    }
  }

  function selectSceneNodes(payload) {
    ensure(currentProject(), "No Blockbench project is open.");

    if (payload.clearExisting !== false) {
      clearSelectionState();
    }

    (payload.nodes || []).forEach((nodeRef) => {
      const node = findSceneNode(nodeRef);
      ensure(node, `Scene node target was not found for ${nodeRef.type}.`);

      if (typeof node.select === "function") {
        node.select();
      } else {
        node.selected = true;
      }
    });

    refreshCanvas();
    return getSelectionSummary();
  }

  function applyProjectResolution(width, height, modifyUv) {
    const project = currentProject();
    ensure(project, "No Blockbench project is open.");

    const resolvedWidth = Math.max(1, Number(width || project.texture_width || 16));
    const resolvedHeight = Math.max(1, Number(height || project.texture_height || 16));

    if (typeof setProjectResolution === "function") {
      try {
        setProjectResolution(resolvedWidth, resolvedHeight, modifyUv !== false);
      } catch (_error) {
        // Fall back to direct assignment below.
      }
    }

    project.texture_width = resolvedWidth;
    project.texture_height = resolvedHeight;

    if (typeof updateProjectResolution === "function") {
      try {
        updateProjectResolution();
      } catch (_error) {
        // Ignore if unsupported in this Blockbench version.
      }
    }

    refreshCanvas();
  }

  function getHealth() {
    return {
      pluginId: PLUGIN_ID,
      version: VERSION,
      host: HOST,
      port: PORT,
      basePath: BASE_PATH,
      capabilities: [
        "health",
        "project.create",
        "project.clear",
        "project.state",
        "project.contents",
        "project.snapshot",
        "project.restore",
        "project.export",
        "project.import",
        "project.revision",
        "mutation.ifRevision",
        "codecs.list",
        "scene.graph",
        "scene.selection",
        "scene.reparent",
        "group.create",
        "group.update",
        "group.delete",
        "cube.add",
        "cube.update",
        "cube.delete",
        "texture.create",
        "texture.read",
        "texture.update",
        "texture.delete",
        "texture.assign",
        "preview.render",
      ],
      startupError: startupError,
      project: getProjectState(),
    };
  }

  function requireBridgeModule(moduleName) {
    try {
      if (typeof requireNativeModule === "function") {
        const nativeModule = requireNativeModule(moduleName, {
          message: "Network access is required for the Blockeru MCP bridge.",
          detail:
            "The Blockbench plugin needs localhost network access so Codex can talk to Blockbench.",
          optional: false,
        });

        if (nativeModule) {
          return nativeModule;
        }
      }
    } catch (_error) {
      // Fall through to other resolution paths.
    }

    try {
      if (typeof require === "function") {
        return require(moduleName);
      }
    } catch (_error) {
      // Fall through to null.
    }

    return null;
  }

  function resolveNetModule() {
    const candidates = ["node:net", "net"];

    for (const candidate of candidates) {
      const mod = requireBridgeModule(candidate);
      if (mod && typeof mod.createServer === "function") {
        return mod;
      }
    }

    return null;
  }

  function createProject(payload) {
    if (currentProject()) {
      ensureRevision(payload);
    }

    ensure(typeof newProject === "function", "Blockbench project API is not available.");

    const formatId = payload.formatId || "java_block";
    const created = newProject(formatId);
    ensure(created, `Failed to create Blockbench project with format "${formatId}".`);

    const project = currentProject();
    ensure(project, "Blockbench project was not created.");

    if (payload.name) {
      project.name = payload.name;
    }

    if (typeof payload.boxUv === "boolean") {
      project.box_uv = payload.boxUv;
    }

    applyProjectResolution(payload.textureWidth || 64, payload.textureHeight || 64, true);
    trackedProjectRef = project;
    projectRevision = 1;

    return getProjectState();
  }

  function clearCollection(items) {
    if (!Array.isArray(items)) {
      return;
    }

    items
      .slice()
      .reverse()
      .forEach((item) => {
        if (!item) {
          return;
        }

        if (typeof item.remove === "function") {
          item.remove();
          return;
        }

        if (typeof item.delete === "function") {
          item.delete();
        }
      });
  }

  function refreshCanvas() {
    if (typeof Canvas === "undefined") {
      return;
    }

    if (typeof Canvas.updateAll === "function") {
      Canvas.updateAll();
    }
    if (typeof Canvas.updateAllUVs === "function") {
      Canvas.updateAllUVs();
    }
    if (typeof Canvas.updateLayeredTextures === "function") {
      Canvas.updateLayeredTextures();
    }
  }

  function clearProject(payload) {
    const project = currentProject();
    ensure(project, "No Blockbench project is open.");
    ensureRevision(payload);

    if (typeof Outliner !== "undefined" && Array.isArray(Outliner.root)) {
      clearCollection(Outliner.root);
    } else {
      if (typeof Cube !== "undefined") {
        clearCollection(Cube.all);
      }
      if (typeof Mesh !== "undefined") {
        clearCollection(Mesh.all);
      }
      if (typeof Group !== "undefined") {
        clearCollection(Group.all);
      }
    }

    if (typeof Texture !== "undefined") {
      clearCollection(Texture.all);
    }

    if (typeof payload.name === "string" && payload.name.trim()) {
      project.name = payload.name.trim();
    }

    if (typeof payload.boxUv === "boolean") {
      project.box_uv = payload.boxUv;
    }

    const textureWidth = payload.textureWidth === undefined ? project.texture_width || 64 : payload.textureWidth;
    const textureHeight = payload.textureHeight === undefined ? project.texture_height || 64 : payload.textureHeight;
    applyProjectResolution(textureWidth, textureHeight, true);
    bumpProjectRevision(project);

    return getProjectState();
  }

  function findTexture(textureRef) {
    if (
      !textureRef ||
      typeof Texture === "undefined" ||
      !Array.isArray(Texture.all)
    ) {
      return null;
    }

    return (
      Texture.all.find((texture) => texture.uuid === textureRef) ||
      Texture.all.find((texture) => texture.id === textureRef) ||
      Texture.all.find((texture) => texture.name === textureRef) ||
      null
    );
  }

  function findTextureFromTarget(target) {
    if (!target) {
      return null;
    }

    return findTexture(target.uuid || target.name || null);
  }

  function summarizeCodec(codecId, codec) {
    return {
      id: codecId,
      name:
        (typeof codec?.name === "string" && codec.name) ||
        (typeof codec?.format?.name === "string" && codec.format.name) ||
        codecId,
      extension:
        typeof codec?.extension === "string" && codec.extension.trim()
          ? codec.extension.trim()
          : null,
      supportsImport:
        typeof codec?.parse === "function" ||
        typeof codec?.load === "function",
      supportsExport: typeof codec?.compile === "function",
      formatId:
        typeof codec?.format?.id === "string" && codec.format.id
          ? codec.format.id
          : null,
    };
  }

  function getCodec(codecId) {
    ensure(typeof Codecs === "object" && Codecs, "Blockbench codecs are not available.");
    const codec = Codecs[codecId];
    ensure(codec, `Codec "${codecId}" was not found.`);
    return codec;
  }

  function listCodecs() {
    const codecs =
      typeof Codecs === "object" && Codecs
        ? Object.keys(Codecs)
            .map((codecId) => summarizeCodec(codecId, Codecs[codecId]))
            .filter((codec) => codec.supportsImport || codec.supportsExport)
            .sort((left, right) => left.id.localeCompare(right.id))
        : [];

    return {
      codecs: codecs,
    };
  }

  function readPngSizeFromDataUrl(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
      return null;
    }

    try {
      const buffer = Buffer.from(dataUrl.slice("data:image/png;base64,".length), "base64");

      if (buffer.length < 24) {
        return null;
      }

      const signature = buffer.subarray(0, 8).toString("hex");
      if (signature !== "89504e470d0a1a0a") {
        return null;
      }

      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    } catch (_error) {
      return null;
    }
  }

  function addCube(payload) {
    const project = currentProject();
    ensure(project, "No Blockbench project is open.");
    ensure(typeof Cube === "function", "Blockbench cube API is not available.");
    ensureRevision(payload);

    const cube = new Cube({
      name: payload.name || "cube",
      from: payload.from,
      to: payload.to,
      origin: payload.origin || [8, 8, 8],
      uv_offset: payload.uvOffset,
      color: payload.colorIndex,
      box_uv:
        typeof payload.boxUv === "boolean"
          ? payload.boxUv
          : typeof project.box_uv === "boolean"
            ? project.box_uv
            : false,
    })
      .addTo("root")
      .init();

    let textureRef = null;
    const texture = findTexture(payload.textureRef);
    if (texture) {
      cube.applyTexture(texture, true);
      textureRef = texture.uuid || texture.id || texture.name || null;
    }

    applyCubeFaces(cube, payload.faces);

    if (typeof cube.updateElement === "function") {
      cube.updateElement();
    }
    refreshCanvas();
    const revision = bumpProjectRevision(project);

    return {
      uuid: cube.uuid,
      name: cube.name,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
      textureRef: textureRef,
      revision: revision,
    };
  }

  function updateCube(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const cube = findCube(payload.target);
    ensure(cube, "Cube target was not found.");

    if (typeof payload.name === "string" && payload.name.trim()) {
      cube.name = payload.name.trim();
    }
    if (Array.isArray(payload.from)) {
      cube.from = payload.from;
    }
    if (Array.isArray(payload.to)) {
      cube.to = payload.to;
    }
    if (Array.isArray(payload.origin)) {
      cube.origin = payload.origin;
    }
    if (Array.isArray(payload.uvOffset)) {
      cube.uv_offset = payload.uvOffset;
    }
    if (typeof payload.colorIndex === "number") {
      cube.color = payload.colorIndex;
    }
    if (typeof payload.boxUv === "boolean") {
      cube.box_uv = payload.boxUv;
    }

    applyCubeFaces(cube, payload.faces);

    if (payload.textureRef !== undefined) {
      if (payload.textureRef === null) {
        if (cube.faces && typeof cube.faces === "object") {
          Object.keys(cube.faces).forEach((faceKey) => {
            if (cube.faces[faceKey]) {
              cube.faces[faceKey].texture = null;
            }
          });
        }
      } else {
        const texture = findTexture(payload.textureRef);
        ensure(texture, `Texture "${payload.textureRef}" was not found.`);
        cube.applyTexture(texture, true);
      }
    }

    if (typeof cube.updateElement === "function") {
      cube.updateElement();
    }
    refreshCanvas();
    bumpProjectRevision(currentProject());

    return summarizeCube(cube);
  }

  function deleteCube(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const cube = findCube(payload.target);
    ensure(cube, "Cube target was not found.");

    const summary = {
      deleted: true,
      uuid: cube.uuid,
      name: cube.name,
    };

    if (typeof cube.remove === "function") {
      cube.remove();
    } else if (typeof cube.delete === "function") {
      cube.delete();
    }

    refreshCanvas();
    return {
      ...summary,
      revision: bumpProjectRevision(currentProject()),
    };
  }

  async function waitForTextureReady(texture, timeoutMs) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const width = Number(texture.width || texture.img?.naturalWidth || texture.img?.width || 0);
      const height = Number(texture.height || texture.img?.naturalHeight || texture.img?.height || 0);

      if (width > 0 && height > 0) {
        return { width, height };
      }

      await sleep(30);
    }

    return {
      width: Number(texture.width || texture.img?.naturalWidth || texture.img?.width || 0),
      height: Number(texture.height || texture.img?.naturalHeight || texture.img?.height || 0),
    };
  }

  async function createTexture(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensure(typeof Texture === "function", "Blockbench texture API is not available.");
    ensureRevision(payload);
    ensure(
      typeof payload.dataUrl === "string" && payload.dataUrl.startsWith("data:image/"),
      "Texture payload must include a valid image data URL.",
    );

    const texture = new Texture({
      name: payload.name,
      saved: false,
      particle: false,
    });

    texture.fromDataURL(payload.dataUrl).add(false, true);
    const parsedSize = readPngSizeFromDataUrl(payload.dataUrl);
    const size = parsedSize || (await waitForTextureReady(texture, 1500));

    if (size.width > 0 && size.height > 0) {
      applyProjectResolution(size.width, size.height, false);
    }

    if (payload.setAsDefault !== false && typeof texture.setAsDefaultTexture === "function") {
      texture.setAsDefaultTexture();
    }

    if (payload.applyToAll) {
      texture.apply(true);
    }
    const revision = bumpProjectRevision(currentProject());

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: size.width,
      height: size.height,
      useAsDefault: !!texture.use_as_default,
      revision: revision,
    };
  }

  async function readTexture(payload) {
    ensure(currentProject(), "No Blockbench project is open.");

    const texture = findTextureFromTarget(payload.target);
    ensure(texture, "Texture target was not found.");

    let dataUrl = null;

    if (typeof texture.getDataURL === "function") {
      dataUrl = await Promise.resolve(texture.getDataURL());
    } else if (typeof texture.source === "string" && texture.source.startsWith("data:image/")) {
      dataUrl = texture.source;
    } else if (
      texture.canvas &&
      typeof texture.canvas.toDataURL === "function"
    ) {
      dataUrl = texture.canvas.toDataURL("image/png");
    }

    ensure(
      typeof dataUrl === "string" && dataUrl.startsWith("data:image/"),
      "Texture data URL is not available for the requested texture.",
    );

    const size = readPngSizeFromDataUrl(dataUrl) || getTextureSize(texture);

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: size.width,
      height: size.height,
      useAsDefault: !!texture.use_as_default,
      dataUrl: dataUrl,
    };
  }

  async function updateTexture(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensure(typeof Texture === "function", "Blockbench texture API is not available.");
    ensureRevision(payload);
    ensure(
      typeof payload.dataUrl === "string" && payload.dataUrl.startsWith("data:image/"),
      "Texture payload must include a valid image data URL.",
    );

    const texture = findTextureFromTarget(payload.target);
    ensure(texture, "Texture target was not found.");

    if (typeof payload.name === "string" && payload.name.trim()) {
      texture.name = payload.name.trim();
    }

    if (typeof texture.fromDataURL === "function") {
      texture.fromDataURL(payload.dataUrl);
    } else {
      texture.source = payload.dataUrl;
    }

    const parsedSize = readPngSizeFromDataUrl(payload.dataUrl);
    const size = parsedSize || (await waitForTextureReady(texture, 1500));

    if (size.width > 0 && size.height > 0) {
      applyProjectResolution(size.width, size.height, false);
    }

    if (payload.setAsDefault !== false && typeof texture.setAsDefaultTexture === "function") {
      texture.setAsDefaultTexture();
    }

    if (payload.applyToAll) {
      texture.apply(true);
    }

    refreshCanvas();
    const revision = bumpProjectRevision(currentProject());

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: size.width,
      height: size.height,
      useAsDefault: !!texture.use_as_default,
      revision: revision,
    };
  }

  async function restoreProjectSnapshot(payload) {
    ensure(payload && payload.snapshot, "A project snapshot payload is required.");
    const snapshot = payload.snapshot;
    let projectState = null;

    if (payload.mode === "new_project" || !currentProject()) {
      projectState = createProject({
        name: snapshot.project.name || undefined,
        formatId: snapshot.project.formatId || "free",
        textureWidth: snapshot.project.textureWidth || 64,
        textureHeight: snapshot.project.textureHeight || 64,
        boxUv:
          typeof snapshot.project.boxUv === "boolean" ? snapshot.project.boxUv : false,
        ifRevision: payload.ifRevision,
      });
    } else {
      projectState = clearProject({
        name: snapshot.project.name || undefined,
        textureWidth: snapshot.project.textureWidth || undefined,
        textureHeight: snapshot.project.textureHeight || undefined,
        boxUv:
          typeof snapshot.project.boxUv === "boolean" ? snapshot.project.boxUv : undefined,
        ifRevision: payload.ifRevision,
      });
    }

    let currentRevision = projectState.revision;
    const textureRefMap = new Map();
    const warnings = [];

    for (const texture of snapshot.textures || []) {
      const createdTexture = await createTexture({
        name: texture.name,
        dataUrl: texture.dataUrl,
        applyToAll: false,
        setAsDefault: texture.useAsDefault,
        ifRevision: currentRevision || undefined,
      });
      currentRevision = createdTexture.revision;
      textureRefMap.set(texture.uuid, createdTexture.uuid);
      textureRefMap.set(texture.name, createdTexture.uuid);
    }

    for (const cube of snapshot.cubes || []) {
      const mappedFaces = {};

      Object.keys(cube.faces || {}).forEach((faceKey) => {
        const face = cube.faces[faceKey];
        const mappedTextureRef =
          face && face.textureRef ? textureRefMap.get(face.textureRef) || face.textureRef : face?.textureRef;
        mappedFaces[faceKey] = {
          ...face,
          ...(mappedTextureRef !== undefined ? { textureRef: mappedTextureRef } : {}),
        };
      });

      const mappedTextureRef =
        cube.textureRef ? textureRefMap.get(cube.textureRef) || cube.textureRef : undefined;

      if (Array.isArray(cube.parentPath) && cube.parentPath.length > 0) {
        warnings.push(
          `Restored cube "${cube.name}" without recreating group path ${cube.parentPath.join("/")}.`,
        );
      }

      const createdCube = addCube({
        name: cube.name,
        from: cube.from,
        to: cube.to,
        origin: cube.origin,
        uvOffset: cube.uvOffset || undefined,
        faces: mappedFaces,
        colorIndex: typeof cube.colorIndex === "number" ? cube.colorIndex : undefined,
        boxUv: cube.boxUv,
        textureRef: mappedTextureRef,
        ifRevision: currentRevision || undefined,
      });
      currentRevision = createdCube.revision;
    }

    return {
      project: getProjectState(),
      createdCubeCount: Array.isArray(snapshot.cubes) ? snapshot.cubes.length : 0,
      createdTextureCount: Array.isArray(snapshot.textures) ? snapshot.textures.length : 0,
      warnings: [...new Set(warnings)],
    };
  }

  async function exportProject(payload) {
    ensure(currentProject(), "No Blockbench project is open.");

    const codecId = payload && typeof payload.codecId === "string" ? payload.codecId : "project";
    const codec = getCodec(codecId);
    ensure(typeof codec.compile === "function", `Codec "${codecId}" does not support export.`);

    const compiled = await Promise.resolve(codec.compile(payload.exportOptions || {}));
    ensure(compiled !== undefined && compiled !== null, `Codec "${codecId}" returned no export payload.`);
    const codecSummary = summarizeCodec(codecId, codec);
    let contentType = "text";
    let content = "";

    if (typeof compiled === "string") {
      contentType = "text";
      content = compiled;
    } else if (Buffer.isBuffer(compiled) || compiled instanceof Uint8Array) {
      contentType = "base64";
      content = Buffer.from(compiled).toString("base64");
    } else {
      contentType = "json";
      content = JSON.stringify(compiled, null, 2);
    }

    const project = currentProject();
    const fileBase =
      (project && typeof project.name === "string" && project.name.trim()) || "blockbench-project";

    return {
      codec: codecSummary,
      contentType: contentType,
      content: content,
      suggestedFileName:
        codecSummary.extension !== null ? `${fileBase}.${codecSummary.extension}` : fileBase,
      revision: getProjectRevision(),
    };
  }

  async function importProject(payload) {
    const codec = getCodec(payload.codecId);
    ensure(
      typeof codec.parse === "function" || typeof codec.load === "function",
      `Codec "${payload.codecId}" does not support import.`,
    );

    if (payload.projectMode === "new_project" || !currentProject()) {
      createProject({
        name: payload.projectName,
        formatId:
          payload.formatId ||
          (typeof codec.format?.id === "string" ? codec.format.id : "free"),
        textureWidth: payload.textureWidth,
        textureHeight: payload.textureHeight,
        boxUv: payload.boxUv,
        ifRevision: payload.ifRevision,
      });
    } else {
      clearProject({
        name: payload.projectName,
        textureWidth: payload.textureWidth,
        textureHeight: payload.textureHeight,
        boxUv: payload.boxUv,
        ifRevision: payload.ifRevision,
      });
    }

    let content = payload.content;

    if (payload.contentType === "json") {
      content = JSON.parse(payload.content);
    } else if (payload.contentType === "base64") {
      content = Buffer.from(payload.content, "base64");
    }

    const suggestedFileName = payload.projectName
      ? codec.extension
        ? `${payload.projectName}.${codec.extension}`
        : payload.projectName
      : `import.${codec.extension || "txt"}`;

    if (typeof codec.parse === "function") {
      await Promise.resolve(codec.parse(content, suggestedFileName));
    } else {
      await Promise.resolve(codec.load(content, suggestedFileName));
    }

    refreshCanvas();
    const revision = bumpProjectRevision(currentProject());

    return {
      project: getProjectState(),
      codec: summarizeCodec(payload.codecId, codec),
      revision: revision,
    };
  }

  function deleteTexture(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const texture = findTextureFromTarget(payload.target);
    ensure(texture, "Texture target was not found.");

    const summary = {
      deleted: true,
      uuid: texture.uuid,
      name: texture.name,
    };

    if (typeof texture.remove === "function") {
      texture.remove(false);
    } else if (typeof texture.delete === "function") {
      texture.delete();
    } else if (typeof Texture !== "undefined" && Array.isArray(Texture.all)) {
      const index = Texture.all.indexOf(texture);
      if (index >= 0) {
        Texture.all.splice(index, 1);
      }
    }

    refreshCanvas();
    return {
      ...summary,
      revision: bumpProjectRevision(currentProject()),
    };
  }

  function assignTexture(payload) {
    ensure(currentProject(), "No Blockbench project is open.");
    ensureRevision(payload);

    const cube = findCube(payload.cube);
    ensure(cube, "Cube target was not found.");

    const texture = findTextureFromTarget(payload.texture);
    ensure(texture, "Texture target was not found.");

    cube.applyTexture(texture, true);

    if (typeof cube.updateElement === "function") {
      cube.updateElement();
    }
    refreshCanvas();
    const revision = bumpProjectRevision(currentProject());

    return {
      cube: {
        uuid: cube.uuid,
        name: cube.name,
        from: cube.from,
        to: cube.to,
        origin: cube.origin,
        textureRef: texture.uuid || texture.id || texture.name || null,
        revision: revision,
      },
      texture: summarizeTexture(texture),
      revision: revision,
    };
  }

  function applyPreviewSettings(preview, payload) {
    if (!preview || !payload) {
      return;
    }

    const preset = payload.viewPreset || "preserve";
    const projection = payload.projection || "preserve";
    const lockedAngle =
      typeof payload.lockedAngle === "number"
        ? payload.lockedAngle
        : preset === "front"
          ? 0
          : preset === "side"
            ? 90
            : preset === "three_quarter"
              ? 45
              : null;

    if (typeof preview.setProjectionMode === "function") {
      if (projection === "orthographic" || preset === "front" || preset === "side") {
        preview.setProjectionMode(true);
      } else if (projection === "perspective" || preset === "three_quarter") {
        preview.setProjectionMode(false);
      }
    }

    if (typeof lockedAngle === "number" && typeof preview.setLockedAngle === "function") {
      try {
        preview.setLockedAngle(lockedAngle);
      } catch (_error) {
        // Ignore if unsupported by this Blockbench version.
      }
    }

    if (typeof payload.fov === "number" && typeof preview.setFOV === "function") {
      try {
        preview.setFOV(payload.fov);
      } catch (_error) {
        // Ignore if unsupported by this Blockbench version.
      }
    }
  }

  function renderPreview(payload) {
    const preview =
      typeof Preview !== "undefined" &&
      (Preview.selected || (Array.isArray(Preview.all) ? Preview.all[0] : null));

    ensure(preview, "No Blockbench preview is available.");
    applyPreviewSettings(preview, payload);

    preview.render();

    const canvas = preview.canvas;
    ensure(canvas && typeof canvas.toDataURL === "function", "Preview canvas is not available.");

    return {
      mimeType: "image/png",
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL("image/png"),
    };
  }

  async function handleParsedRequest(method, path, bodyText, socket) {
    const url = new URL(path || "/", `http://${HOST}:${PORT}`);
    const route = url.pathname;
    const body =
      method === "POST" && bodyText
        ? (() => {
            try {
              return JSON.parse(bodyText);
            } catch (_error) {
              throw new Error("Invalid JSON request body.");
            }
          })()
        : {};

    if (method === "OPTIONS") {
      sendSocketResponse(socket, 204, { ok: true });
      return;
    }

    if (route === `${BASE_PATH}/health` && method === "GET") {
      sendSocketOk(socket, getHealth());
      return;
    }

    if (route === `${BASE_PATH}/project/state` && method === "GET") {
      sendSocketOk(socket, getProjectState());
      return;
    }

    if (route === `${BASE_PATH}/project/contents` && method === "GET") {
      sendSocketOk(socket, getProjectContents());
      return;
    }

    if (route === `${BASE_PATH}/scene/graph` && method === "GET") {
      sendSocketOk(socket, getSceneGraph());
      return;
    }

    if (route === `${BASE_PATH}/scene/selection` && method === "GET") {
      sendSocketOk(socket, getSelectionSummary());
      return;
    }

    if (route === `${BASE_PATH}/project/snapshot` && method === "POST") {
      sendSocketOk(socket, await createProjectSnapshot(body));
      return;
    }

    if (route === `${BASE_PATH}/project/create` && method === "POST") {
      sendSocketOk(socket, createProject(body));
      return;
    }

    if (route === `${BASE_PATH}/project/clear` && method === "POST") {
      sendSocketOk(socket, clearProject(body));
      return;
    }

    if (route === `${BASE_PATH}/project/restore` && method === "POST") {
      sendSocketOk(socket, await restoreProjectSnapshot(body));
      return;
    }

    if (route === `${BASE_PATH}/codecs/list` && method === "GET") {
      sendSocketOk(socket, listCodecs());
      return;
    }

    if (route === `${BASE_PATH}/project/export` && method === "POST") {
      sendSocketOk(socket, await exportProject(body));
      return;
    }

    if (route === `${BASE_PATH}/project/import` && method === "POST") {
      sendSocketOk(socket, await importProject(body));
      return;
    }

    if (route === `${BASE_PATH}/group/create` && method === "POST") {
      sendSocketOk(socket, createGroup(body));
      return;
    }

    if (route === `${BASE_PATH}/group/update` && method === "POST") {
      sendSocketOk(socket, updateGroup(body));
      return;
    }

    if (route === `${BASE_PATH}/group/delete` && method === "POST") {
      sendSocketOk(socket, deleteGroup(body));
      return;
    }

    if (route === `${BASE_PATH}/scene/reparent` && method === "POST") {
      sendSocketOk(socket, reparentSceneNode(body));
      return;
    }

    if (route === `${BASE_PATH}/scene/select` && method === "POST") {
      sendSocketOk(socket, selectSceneNodes(body));
      return;
    }

    if (route === `${BASE_PATH}/cube/add` && method === "POST") {
      sendSocketOk(socket, addCube(body));
      return;
    }

    if (route === `${BASE_PATH}/cube/update` && method === "POST") {
      sendSocketOk(socket, updateCube(body));
      return;
    }

    if (route === `${BASE_PATH}/cube/delete` && method === "POST") {
      sendSocketOk(socket, deleteCube(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/create` && method === "POST") {
      sendSocketOk(socket, await createTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/read` && method === "POST") {
      sendSocketOk(socket, await readTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/update` && method === "POST") {
      sendSocketOk(socket, await updateTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/delete` && method === "POST") {
      sendSocketOk(socket, deleteTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/assign` && method === "POST") {
      sendSocketOk(socket, assignTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/preview/render` && method === "POST") {
      sendSocketOk(socket, renderPreview(body));
      return;
    }

    sendSocketError(socket, 404, `Unknown bridge route: ${method} ${route}`);
  }

  function createBridgeServer(net) {
    return net.createServer((socket) => {
      let buffer = Buffer.alloc(0);
      let handled = false;

      socket.on("data", (chunk) => {
        if (handled) {
          return;
        }

        buffer = Buffer.concat([buffer, chunk]);
        processBuffer().catch((error) => {
          reportError(error);
          sendSocketError(socket, 500, error);
        });
      });

      socket.on("error", (error) => {
        console.error(`[${PLUGIN_TITLE}] Socket error`, error);
      });

      async function processBuffer() {
        if (handled) {
          return;
        }

        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          return;
        }

        const headerText = buffer.subarray(0, headerEnd).toString("utf8");
        const lines = headerText.split("\r\n");
        const requestLine = lines[0] || "";
        const parts = requestLine.split(" ");

        if (parts.length < 2) {
          handled = true;
          sendSocketError(socket, 400, "Malformed HTTP request line.");
          return;
        }

        const method = parts[0];
        const path = parts[1];
        const headers = {};

        for (let index = 1; index < lines.length; index += 1) {
          const separator = lines[index].indexOf(":");
          if (separator === -1) {
            continue;
          }

          const key = lines[index].slice(0, separator).trim().toLowerCase();
          const value = lines[index].slice(separator + 1).trim();
          headers[key] = value;
        }

        const bodyStart = headerEnd + 4;
        const contentLength = Number(headers["content-length"] || "0");
        const requestEnd = bodyStart + contentLength;

        if (buffer.length < requestEnd) {
          return;
        }

        handled = true;
        const bodyText = buffer.subarray(bodyStart, requestEnd).toString("utf8");
        await handleParsedRequest(method, path, bodyText, socket);
      }
    });
  }

  BBPlugin.register(PLUGIN_ID, {
    title: PLUGIN_TITLE,
    author: "OpenAI Codex",
    description: "Localhost Blockbench bridge for the Blockeru MCP server.",
    icon: "extension",
    tags: ["MCP", "AI", "Blockbench"],
    variant: "desktop",
    version: VERSION,
    async onload() {
      startupError = null;

      try {
        const net = resolveNetModule();
        ensure(net, "Failed to load the Node net module inside Blockbench.");

        httpServer = createBridgeServer(net);

        httpServer.on("error", (error) => {
          reportError(error);
        });

        httpServer.listen(PORT, HOST, () => {
          startupError = null;
          reportStatus(`${PLUGIN_TITLE} listening on http://${HOST}:${PORT}${BASE_PATH}`, 4000);
        });
      } catch (error) {
        reportError(error);
      }
    },
    onunload() {
      if (httpServer) {
        httpServer.close();
        httpServer = null;
      }
    },
    oninstall() {
      Blockbench.showQuickMessage(`${PLUGIN_TITLE} installed`, 2000);
    },
    onuninstall() {
      if (httpServer) {
        httpServer.close();
        httpServer = null;
      }
      Blockbench.showQuickMessage(`${PLUGIN_TITLE} uninstalled`, 2000);
    },
  });
})();
