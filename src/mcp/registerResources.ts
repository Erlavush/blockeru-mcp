import { readFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerConfig } from "../config.js";

export async function registerResources(server: McpServer, config: ServerConfig): Promise<void> {
  server.registerResource(
    "blockeru-config",
    "blockeru://config",
    {
      title: "Blockeru MCP Config",
      description: "Resolved runtime configuration for the Blockeru MCP server.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify(config, null, 2),
        },
      ],
    }),
  );

  server.registerResource(
    "blockeru-plan",
    "blockeru://plan",
    {
      title: "Blockeru Plan",
      description: "The implementation plan for this repository.",
      mimeType: "text/markdown",
    },
    async (uri) => {
      const planPath = new URL("../../PLAN.md", import.meta.url);
      const text = await readFile(planPath, "utf8");

      return {
        contents: [
          {
            uri: uri.href,
            text,
          },
        ],
      };
    },
  );
}
