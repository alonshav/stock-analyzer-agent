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
var generate_pdf_tool_exports = {};
__export(generate_pdf_tool_exports, {
  generatePDFTool: () => generatePDFTool,
  handleGeneratePDF: () => handleGeneratePDF
});
module.exports = __toCommonJS(generate_pdf_tool_exports);
class AnvilPDFProvider {
  constructor() {
    this.baseUrl = "https://app.useanvil.com/api/v1";
    this.apiKey = process.env["ANVIL_API_KEY"] || "";
    if (!this.apiKey) {
      throw new Error("ANVIL_API_KEY environment variable is required");
    }
  }
  async generatePDF(params) {
    const title = `${params.ticker} - ${params.reportType === "full" ? "Full Analysis" : "Executive Summary"}`;
    const markdownWithHeader = `# ${title}

*Generated: ${(/* @__PURE__ */ new Date()).toLocaleDateString()}*

---

${params.content}`;
    const response = await fetch(`${this.baseUrl}/generate-pdf`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(this.apiKey + ":").toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title,
        type: "markdown",
        data: {
          markdown: markdownWithHeader
        }
      })
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anvil API error: ${response.status} - ${error}`);
    }
    const result = await response.json();
    return {
      downloadUrl: result.downloadURL,
      fileId: result.eid,
      provider: "anvil"
    };
  }
}
class PDFProviderFactory {
  static {
    this.providers = /* @__PURE__ */ new Map();
  }
  static getProvider(providerName) {
    const provider = providerName || process.env["PDF_PROVIDER"] || "anvil";
    if (!this.providers.has(provider)) {
      switch (provider.toLowerCase()) {
        case "anvil":
          this.providers.set(provider, new AnvilPDFProvider());
          break;
        default:
          throw new Error(`Unknown PDF provider: ${provider}`);
      }
    }
    return this.providers.get(provider);
  }
}
const generatePDFTool = {
  name: "generate_pdf",
  description: `Generate a PDF report from markdown content using an external PDF service.

The PDF is automatically hosted by the provider and a permanent download URL is returned.

Current provider: ${process.env["PDF_PROVIDER"] || "Anvil"}
- Free: 500 PDFs/month
- Cost: $0.10 per PDF thereafter
- No storage needed - fully managed`,
  inputSchema: {
    type: "object",
    properties: {
      ticker: {
        type: "string",
        description: "Stock ticker symbol (e.g., AAPL)"
      },
      content: {
        type: "string",
        description: "Markdown content to convert to PDF. Should be well-formatted markdown."
      },
      reportType: {
        type: "string",
        enum: ["full", "summary"],
        description: 'Type of report: "full" or "summary"'
      },
      sessionId: {
        type: "string",
        description: "Optional session ID for tracking"
      }
    },
    required: ["ticker", "content", "reportType"]
  }
};
async function handleGeneratePDF(params) {
  const startTime = Date.now();
  try {
    const provider = PDFProviderFactory.getProvider();
    console.log(
      `[PDF] Generating ${params.reportType} report for ${params.ticker}`
    );
    const result = await provider.generatePDF({
      content: params.content,
      ticker: params.ticker,
      reportType: params.reportType
    });
    const duration = Date.now() - startTime;
    console.log(`[PDF] Success in ${duration}ms: ${result.downloadUrl}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              ticker: params.ticker,
              reportType: params.reportType,
              downloadUrl: result.downloadUrl,
              fileId: result.fileId,
              provider: result.provider,
              generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
              durationMs: duration
            },
            null,
            2
          )
        }
      ]
    };
  } catch (error) {
    console.error("[PDF] Error:", error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : "Unknown error",
              ticker: params.ticker,
              reportType: params.reportType
            },
            null,
            2
          )
        }
      ]
    };
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generatePDFTool,
  handleGeneratePDF
});
