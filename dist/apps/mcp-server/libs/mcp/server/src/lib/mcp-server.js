#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var mcp_server_exports = {};
__export(mcp_server_exports, {
  StockAnalysisMCPServer: () => StockAnalysisMCPServer
});
module.exports = __toCommonJS(mcp_server_exports);
var import_server = require("@modelcontextprotocol/sdk/server/index.js");
var import_stdio = require("@modelcontextprotocol/sdk/server/stdio.js");
var import_types = require("@modelcontextprotocol/sdk/types.js");
var import_tools = require("@stock-analyzer/mcp/tools");
class StockAnalysisMCPServer {
  constructor() {
    this.server = new import_server.Server(
      {
        name: "stock-analysis-mcp",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    this.toolRegistry = (0, import_tools.createToolRegistry)();
    this.setupHandlers();
    this.setupErrorHandlers();
  }
  setupHandlers() {
    this.server.setRequestHandler(import_types.ListToolsRequestSchema, async () => ({
      tools: this.toolRegistry.getTools()
    }));
    this.server.setRequestHandler(import_types.CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        return await this.toolRegistry.executeTool(name, args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`
            }
          ]
        };
      }
    });
  }
  setupErrorHandlers() {
    this.server.onerror = (error) => {
      console.error("[MCP Server Error]", error);
    };
    process.on("SIGINT", async () => {
      await this.shutdown();
    });
    process.on("SIGTERM", async () => {
      await this.shutdown();
    });
  }
  async shutdown() {
    console.error("Shutting down MCP server...");
    await this.server.close();
    process.exit(0);
  }
  async run() {
    const transport = new import_stdio.StdioServerTransport();
    await this.server.connect(transport);
    console.error("Stock Analysis MCP Server running on stdio");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StockAnalysisMCPServer
});
