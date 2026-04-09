(function () {
  const PLUGIN_ID = "blockeru_mcp_bridge";
  const PLUGIN_TITLE = "Blockeru MCP Bridge";
  const VERSION = "0.1.0";
  const HOST = "127.0.0.1";
  const PORT = 37891;
  const BASE_PATH = "/blockeru-bridge";

  let httpServer = null;
  let startupError = null;

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

  function getFormatId(project) {
    if (!project || !project.format) {
      return null;
    }

    return project.format.id || project.format.name || null;
  }

  function getProjectState() {
    const project = currentProject();
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
      cubeCount: cubeCount,
      textureCount: textureCount,
    };
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
        "cube.add",
        "texture.create",
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

  function addCube(payload) {
    const project = currentProject();
    ensure(project, "No Blockbench project is open.");
    ensure(typeof Cube === "function", "Blockbench cube API is not available.");

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

    if (payload.faces && typeof cube.faces === "object") {
      cube.box_uv = false;

      if (typeof cube.setUVMode === "function") {
        try {
          cube.setUVMode(false);
        } catch (_error) {
          // Ignore if unavailable.
        }
      }

      Object.keys(payload.faces).forEach((faceKey) => {
        const faceData = payload.faces[faceKey];
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
      });

      if (typeof cube.mapAutoUV === "function") {
        cube.autouv = 0;
      }
    }

    if (typeof cube.updateElement === "function") {
      cube.updateElement();
    }
    refreshCanvas();

    return {
      uuid: cube.uuid,
      name: cube.name,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
      textureRef: textureRef,
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
    const size = await waitForTextureReady(texture, 1500);

    if (size.width > 0 && size.height > 0) {
      applyProjectResolution(size.width, size.height, false);
    }

    if (payload.setAsDefault !== false && typeof texture.setAsDefaultTexture === "function") {
      texture.setAsDefaultTexture();
    }

    if (payload.applyToAll) {
      texture.apply(true);
    }

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: size.width,
      height: size.height,
      useAsDefault: !!texture.use_as_default,
    };
  }

  function renderPreview() {
    const preview =
      typeof Preview !== "undefined" &&
      (Preview.selected || (Array.isArray(Preview.all) ? Preview.all[0] : null));

    ensure(preview, "No Blockbench preview is available.");

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

    if (route === `${BASE_PATH}/project/create` && method === "POST") {
      sendSocketOk(socket, createProject(body));
      return;
    }

    if (route === `${BASE_PATH}/project/clear` && method === "POST") {
      sendSocketOk(socket, clearProject(body));
      return;
    }

    if (route === `${BASE_PATH}/cube/add` && method === "POST") {
      sendSocketOk(socket, addCube(body));
      return;
    }

    if (route === `${BASE_PATH}/texture/create` && method === "POST") {
      sendSocketOk(socket, await createTexture(body));
      return;
    }

    if (route === `${BASE_PATH}/preview/render` && method === "POST") {
      sendSocketOk(socket, renderPreview());
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
