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

  function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end(JSON.stringify(payload));
  }

  function sendOk(response, data) {
    sendJson(response, 200, { ok: true, data: data });
  }

  function sendError(response, statusCode, error) {
    sendJson(response, statusCode, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
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

  function readRequestBody(request) {
    return new Promise((resolve, reject) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        if (!body) {
          resolve({});
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (_error) {
          reject(new Error("Invalid JSON request body."));
        }
      });
      request.on("error", reject);
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

  function resolveHttpModule() {
    const candidates = ["node:http", "http"];

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

    if (typeof setProjectResolution === "function") {
      setProjectResolution(
        Number(payload.textureWidth || 64),
        Number(payload.textureHeight || 64),
        true,
      );
    }

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

    return {
      uuid: cube.uuid,
      name: cube.name,
      from: cube.from,
      to: cube.to,
      origin: cube.origin,
      textureRef: textureRef,
    };
  }

  function createTexture(payload) {
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

    if (payload.setAsDefault !== false && typeof texture.setAsDefaultTexture === "function") {
      texture.setAsDefaultTexture();
    }

    if (payload.applyToAll) {
      texture.apply(true);
    }

    return {
      uuid: texture.uuid,
      name: texture.name,
      width: texture.width,
      height: texture.height,
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

  async function handleRoute(request, response) {
    const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      response.end();
      return;
    }

    if (path === `${BASE_PATH}/health` && request.method === "GET") {
      sendOk(response, getHealth());
      return;
    }

    if (path === `${BASE_PATH}/project/state` && request.method === "GET") {
      sendOk(response, getProjectState());
      return;
    }

    const body = request.method === "POST" ? await readRequestBody(request) : {};

    if (path === `${BASE_PATH}/project/create` && request.method === "POST") {
      sendOk(response, createProject(body));
      return;
    }

    if (path === `${BASE_PATH}/cube/add` && request.method === "POST") {
      sendOk(response, addCube(body));
      return;
    }

    if (path === `${BASE_PATH}/texture/create` && request.method === "POST") {
      sendOk(response, createTexture(body));
      return;
    }

    if (path === `${BASE_PATH}/preview/render` && request.method === "POST") {
      sendOk(response, renderPreview());
      return;
    }

    sendError(response, 404, `Unknown bridge route: ${request.method} ${path}`);
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
        const http = resolveHttpModule();
        ensure(http, "Failed to load the Node HTTP module inside Blockbench.");

        httpServer = http.createServer((request, response) => {
          Promise.resolve(handleRoute(request, response)).catch((error) => {
            console.error(`[${PLUGIN_TITLE}]`, error);
            sendError(response, 500, error);
          });
        });

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
