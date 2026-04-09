import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SERVER_VERSION } from "./constants.js";
import { registerPrompts } from "./mcp/registerPrompts.js";
import { registerResources } from "./mcp/registerResources.js";
import { registerTools } from "./mcp/registerTools.js";
import { BridgeClient } from "./services/bridgeClient.js";

const config = loadConfig();
const bridge = new BridgeClient(config.bridgeUrl, config.requestTimeoutMs);

const server = new McpServer({
  name: config.serverName,
  version: SERVER_VERSION,
});

await registerResources(server, config);
registerPrompts(server);
registerTools(server, { config, bridge });

const transport = new StdioServerTransport();
await server.connect(transport);
