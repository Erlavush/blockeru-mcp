import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "blockeru-text-build",
    {
      title: "Blockbench Text Build",
      description: "Guide the agent through the text-to-Blockbench workflow.",
      argsSchema: {
        prompt: z.string(),
      },
    },
    ({ prompt }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Turn the following text prompt into a Blockbench asset using Blockeru MCP tools.",
              `Prompt: ${prompt}`,
              "Recommended flow:",
              "1. Call draft_asset_spec_from_prompt.",
              "2. Create a new Blockbench project.",
              "3. Build the silhouette from cubes first.",
              "4. Add a texture only after the forms are stable.",
              "5. Render a preview and iterate.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "blockeru-image-build",
    {
      title: "Blockbench Image Build",
      description: "Guide the agent through the image-guided Blockbench workflow.",
      argsSchema: {
        designGoal: z.string(),
      },
    },
    ({ designGoal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Use the currently available image context to build a Blockbench asset.",
              `Design goal: ${designGoal}`,
              "Recommended flow:",
              "1. Inspect the uploaded image and infer silhouette, proportions, materials, and palette.",
              "2. Create or adjust an AssetSpec manually if needed.",
              "3. Build the form in cubes first.",
              "4. Render a preview and repair the structure before texturing.",
              "5. Apply a stylized texture that matches the reference instead of trying to reproduce photo detail literally.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
