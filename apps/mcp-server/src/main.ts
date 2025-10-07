import { StockAnalysisMCPServer } from '@stock-analyzer/mcp/server';
import dotenv from 'dotenv';

// Suppress stdout during dotenv loading to avoid MCP protocol interference
const originalWrite = process.stdout.write;
process.stdout.write = function() { return true; };
dotenv.config();
process.stdout.write = originalWrite;

// Bootstrap and run the MCP server
const server = new StockAnalysisMCPServer();
server.run().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
