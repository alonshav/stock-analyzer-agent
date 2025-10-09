import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * PDF Generation Provider Interface
 * Allows swapping between different PDF generation services
 */
interface PDFGenerationProvider {
  generatePDF(params: {
    content: string;
    ticker: string;
    reportType: 'full' | 'summary';
  }): Promise<{
    downloadUrl: string;
    fileId: string;
    provider: string;
  }>;
}

/**
 * Anvil PDF API Provider
 * Free: 500 PDFs/month, then $0.10/PDF
 * Docs: https://www.useanvil.com/docs/api/generate-pdf
 */
class AnvilPDFProvider implements PDFGenerationProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://app.useanvil.com/api/v1';

  constructor() {
    this.apiKey = process.env['ANVIL_API_KEY'] || '';
    if (!this.apiKey) {
      throw new Error('ANVIL_API_KEY environment variable is required');
    }
  }

  async generatePDF(params: {
    content: string;
    ticker: string;
    reportType: 'full' | 'summary';
  }): Promise<{
    downloadUrl: string;
    fileId: string;
    provider: string;
  }> {
    const title = `${params.ticker} - ${
      params.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'
    }`;

    // Add header to markdown content
    const markdownWithHeader = `# ${title}\n\n*Generated: ${new Date().toLocaleDateString()}*\n\n---\n\n${params.content}`;

    // Call Anvil API with markdown directly
    const response = await fetch(`${this.baseUrl}/generate-pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title,
        type: 'markdown',
        data: {
          markdown: markdownWithHeader,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anvil API error: ${response.status} - ${error}`);
    }

    const result = await response.json();

    return {
      downloadUrl: result.downloadURL,
      fileId: result.eid,
      provider: 'anvil',
    };
  }
}

/**
 * Generic PDF Provider Factory
 * Swap providers by changing PDF_PROVIDER environment variable
 */
class PDFProviderFactory {
  private static providers: Map<string, PDFGenerationProvider> = new Map();

  static getProvider(providerName?: string): PDFGenerationProvider {
    const provider = providerName || process.env['PDF_PROVIDER'] || 'anvil';

    if (!this.providers.has(provider)) {
      switch (provider.toLowerCase()) {
        case 'anvil':
          this.providers.set(provider, new AnvilPDFProvider());
          break;
        // Add more providers here:
        // case 'cloudconvert':
        //   this.providers.set(provider, new CloudConvertProvider());
        //   break;
        default:
          throw new Error(`Unknown PDF provider: ${provider}`);
      }
    }

    return this.providers.get(provider)!;
  }
}

/**
 * MCP Tool Definition for PDF Generation
 */
export const generatePDFTool: Tool = {
  name: 'generate_pdf',
  description: `Generate a PDF report from markdown content using an external PDF service.

The PDF is automatically hosted by the provider and a permanent download URL is returned.

Current provider: ${process.env['PDF_PROVIDER'] || 'Anvil'}
- Free: 500 PDFs/month
- Cost: $0.10 per PDF thereafter
- No storage needed - fully managed`,

  inputSchema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock ticker symbol (e.g., AAPL)',
      },
      content: {
        type: 'string',
        description:
          'Markdown content to convert to PDF. Should be well-formatted markdown.',
      },
      reportType: {
        type: 'string',
        enum: ['full', 'summary'],
        description: 'Type of report: "full" or "summary"',
      },
      sessionId: {
        type: 'string',
        description: 'Optional session ID for tracking',
      },
    },
    required: ['ticker', 'content', 'reportType'],
  },
};

/**
 * PDF Tool Handler
 * Executes PDF generation and returns structured result
 */
export async function handleGeneratePDF(params: {
  ticker: string;
  content: string;
  reportType: 'full' | 'summary';
  sessionId?: string;
}): Promise<any> {
  const startTime = Date.now();

  try {
    const provider = PDFProviderFactory.getProvider();

    console.log(
      `[PDF] Generating ${params.reportType} report for ${params.ticker}`
    );

    const result = await provider.generatePDF({
      content: params.content,
      ticker: params.ticker,
      reportType: params.reportType,
    });

    const duration = Date.now() - startTime;

    console.log(`[PDF] Success in ${duration}ms: ${result.downloadUrl}`);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              ticker: params.ticker,
              reportType: params.reportType,
              downloadUrl: result.downloadUrl,
              fileId: result.fileId,
              provider: result.provider,
              generatedAt: new Date().toISOString(),
              durationMs: duration,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error('[PDF] Error:', error);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              ticker: params.ticker,
              reportType: params.reportType,
            },
            null,
            2
          ),
        },
      ],
    };
  }
}
