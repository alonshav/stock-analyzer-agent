# MCP Server Setup for Cursor

This guide explains how to use the Stock Analyzer MCP server with Cursor IDE.

## What is MCP?

The Model Context Protocol (MCP) allows AI assistants like Cursor to access external tools and data sources. The Stock Analyzer MCP server provides financial analysis tools including:

- **fetch_company_data**: Get comprehensive financial data from FMP API
- **calculate_dcf**: Perform DCF valuation calculations
- **test_api_connection**: Test FMP API connectivity

## Setup Instructions

### 1. Get an FMP API Key

1. Sign up at [Financial Modeling Prep](https://financialmodelingprep.com/developer/docs/)
2. Copy your API key from the dashboard

### 2. Configure Cursor

#### Option A: Using npx (from GitHub)

Add this to your Cursor MCP settings (`~/.cursor/mcp.json` or `%APPDATA%\Cursor\mcp.json` on Windows):

```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "npx",
      "args": ["-y", "github:alonshav/stock-analyzer-agent"],
      "env": {
        "FMP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

#### Option B: Using Local Build

1. Build the MCP server:
```bash
npm run build:mcp-server
```

2. Add this to your Cursor MCP settings:
```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "node",
      "args": ["/absolute/path/to/stock-analyzer-agent/dist/apps/mcp-server/main.js"],
      "env": {
        "FMP_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Replace `/absolute/path/to/stock-analyzer-agent/` with your actual project path.

### 3. Restart Cursor

After updating the configuration, restart Cursor completely for the changes to take effect.

### 4. Verify Connection

1. Open Cursor settings
2. Navigate to the MCP section
3. You should see "stock-analyzer" listed with a green status indicator
4. The server should show 3 available tools

## Troubleshooting

### "No server info found" Error

This usually means:
- The server crashed on startup (check if FMP_API_KEY is set correctly)
- The path to the server is incorrect
- Node.js is not in your PATH

### Testing Locally

You can test the server manually:

```bash
# Set your API key
export FMP_API_KEY=your-api-key-here

# Run the server
node dist/apps/mcp-server/main.js

# Send a test message (in another terminal)
echo '{"jsonrpc": "2.0", "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0"}}, "id": 1}' | node dist/apps/mcp-server/main.js
```

You should see a JSON response with server info.

### Viewing Logs

Check Cursor's MCP logs:
- **macOS/Linux**: `~/.cursor/logs/mcp-*.log`
- **Windows**: `%APPDATA%\Cursor\logs\mcp-*.log`

## Using the Tools in Cursor

Once connected, you can ask Cursor to use the financial tools:

```
"Fetch financial data for Apple (AAPL)"
"Calculate DCF valuation for Tesla with these assumptions..."
"Test if my FMP API connection is working"
```

Cursor will automatically call the appropriate MCP tools to fulfill your request.

## API Key Security

⚠️ **Important**: Never commit your actual API key to version control. The configuration file above is just a template - replace `your-api-key-here` with your actual key.

Consider using environment variables:

```json
{
  "mcpServers": {
    "stock-analyzer": {
      "command": "node",
      "args": ["/path/to/dist/apps/mcp-server/main.js"],
      "env": {
        "FMP_API_KEY": "${FMP_API_KEY}"
      }
    }
  }
}
```

Then set `FMP_API_KEY` in your shell's environment.
