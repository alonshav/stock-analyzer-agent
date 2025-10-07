# PDF Generator Implementation Plan - External API Strategy

## Overview

Replace Puppeteer-based PDF generation with external API (Anvil) for clean, simple, scalable solution.

**Key Benefits:**

- ✅ No local storage required (provider-hosted)
- ✅ No Puppeteer dependency (~300MB saved)
- ✅ Direct markdown → PDF (no HTML/CSS conversion)
- ✅ 500 free PDFs/month, $0.10/PDF thereafter
- ✅ Easy provider swapping via environment variable

-----

## Architecture

```
Claude Agent
    ↓
generate_pdf tool
    ↓
PDFProviderFactory
    ↓
AnvilPDFProvider (or other)
    ↓
External API
    ↓
Returns: Download URL (provider-hosted)
```

-----

## Implementation

### File Location

```
libs/mcp/tools/src/lib/pdf/generate-pdf.tool.ts
```

### Core Code

```typescript
import { Tool } from '@anthropic-ai/claude-agent-sdk';

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
    this.apiKey = process.env.ANVIL_API_KEY || '';
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
    const title = `${params.ticker} - ${params.reportType === 'full' ? 'Full Analysis' : 'Executive Summary'}`;
    
    // Add header to markdown content
    const markdownWithHeader = `# ${title}\n\n*Generated: ${new Date().toLocaleDateString()}*\n\n---\n\n${params.content}`;

    // Call Anvil API with markdown directly
    const response = await fetch(`${this.baseUrl}/generate-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
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
    const provider = providerName || process.env.PDF_PROVIDER || 'anvil';
    
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
 * MCP Tool Definition
 */
export const generatePDFTool: Tool = {
  name: 'generate_pdf',
  description: `Generate a PDF report from markdown content using an external PDF service.
  
The PDF is automatically hosted by the provider and a permanent download URL is returned.

Current provider: ${process.env.PDF_PROVIDER || 'Anvil'}
- Free: 500 PDFs/month
- Cost: $0.10 per PDF thereafter
- No storage needed - fully managed`,

  input_schema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock ticker symbol (e.g., AAPL)',
      },
      content: {
        type: 'string',
        description: 'Markdown content to convert to PDF. Should be well-formatted markdown.',
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

  handler: async (params: {
    ticker: string;
    content: string;
    reportType: 'full' | 'summary';
    sessionId?: string;
  }) => {
    const startTime = Date.now();
    
    try {
      const provider = PDFProviderFactory.getProvider();
      
      console.log(`[PDF] Generating ${params.reportType} report for ${params.ticker}`);
      
      const result = await provider.generatePDF({
        content: params.content,
        ticker: params.ticker,
        reportType: params.reportType,
      });

      const duration = Date.now() - startTime;
      
      console.log(`[PDF] Success in ${duration}ms: ${result.downloadUrl}`);

      return {
        success: true,
        ticker: params.ticker,
        reportType: params.reportType,
        downloadUrl: result.downloadUrl,
        fileId: result.fileId,
        provider: result.provider,
        generatedAt: new Date().toISOString(),
        durationMs: duration,
      };
    } catch (error) {
      console.error('[PDF] Error:', error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ticker: params.ticker,
        reportType: params.reportType,
      };
    }
  },
};
```

-----

## Alternative Provider - CloudConvert

```typescript
/**
 * CloudConvert Provider (Alternative)
 * Docs: https://cloudconvert.com/api/v2
 */
class CloudConvertProvider implements PDFGenerationProvider {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.cloudconvert.com/v2';

  constructor() {
    this.apiKey = process.env.CLOUDCONVERT_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('CLOUDCONVERT_API_KEY environment variable is required');
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
    // Create conversion job
    const jobResponse = await fetch(`${this.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tasks: {
          'import-markdown': {
            operation: 'import/upload',
          },
          'convert-to-pdf': {
            operation: 'convert',
            input: 'import-markdown',
            output_format: 'pdf',
          },
          'export-pdf': {
            operation: 'export/url',
            input: 'convert-to-pdf',
          },
        },
      }),
    });

    const job = await jobResponse.json();
    const uploadTask = job.data.tasks.find((t: any) => t.name === 'import-markdown');

    // Upload markdown content
    const formData = new FormData();
    formData.append('file', new Blob([params.content]), `${params.ticker}.md`);

    await fetch(uploadTask.result.form.url, {
      method: 'POST',
      body: formData,
    });

    // Poll for completion or use webhook
    const exportTask = job.data.tasks.find((t: any) => t.name === 'export-pdf');

    return {
      downloadUrl: exportTask.result.files[0].url,
      fileId: job.data.id,
      provider: 'cloudconvert',
    };
  }
}
```

-----

## Configuration

### Environment Variables

```bash
# PDF Provider Configuration
PDF_PROVIDER=anvil  # Options: anvil, cloudconvert, etc.

# Anvil (Default)
ANVIL_API_KEY=your_anvil_api_key

# CloudConvert (Alternative)
# CLOUDCONVERT_API_KEY=your_cloudconvert_api_key
```

### Railway Environment Variables

Add to both **Agent** and **MCP Server** (if separate):

```bash
# Agent Service
ANVIL_API_KEY=sk_live_xxxxx
PDF_PROVIDER=anvil

# Optional: For monitoring
PDF_COST_PER_GENERATION=0.10
PDF_FREE_TIER_LIMIT=500
```

-----

## Tool Registry Integration

```typescript
// libs/mcp/tools/src/lib/registry.ts
import { generatePDFTool } from './pdf/generate-pdf.tool';
import { fetchCompanyDataTool } from './data-fetching/fetch-company-data.tool';
// ... other tools

export function getToolsRegistry() {
  return [
    generatePDFTool,
    fetchCompanyDataTool,
    // ... other tools
  ];
}
```

-----

## Usage Examples

### From Agent Service

```typescript
// Agent Service automatically provides tools to Anthropic SDK
const stream = query(prompt, {
  systemPrompt: STOCK_VALUATION_FRAMEWORK,
  tools: getToolsRegistry(), // Includes generatePDFTool
});

// Claude calls the tool:
// generate_pdf({
//   ticker: "AAPL",
//   content: "# Analysis\n\nApple shows...",
//   reportType: "full"
// })
```

### Direct Tool Call Example

```typescript
const result = await generatePDFTool.handler({
  ticker: 'AAPL',
  reportType: 'full',
  content: `
# Apple Inc. Financial Analysis

## Executive Summary
Apple demonstrates strong fundamentals with consistent revenue growth...

## Financial Metrics
- Revenue: $394.3B
- Net Income: $97.0B
- P/E Ratio: 28.5
- Dividend Yield: 0.5%

## Key Strengths
1. Strong brand loyalty
2. Diversified revenue streams
3. Robust cash flow generation

## Recommendation
**BUY** - Strong fundamentals with growth potential.
  `,
});

// Returns:
// {
//   success: true,
//   ticker: 'AAPL',
//   reportType: 'full',
//   downloadUrl: 'https://app.useanvil.com/api/v1/download/eid_abc123',
//   fileId: 'eid_abc123',
//   provider: 'anvil',
//   generatedAt: '2025-01-15T10:30:00.000Z',
//   durationMs: 1234
// }
```

-----

## Framework Integration

### How Framework v2.3 Uses PDF Tool

```markdown
After completing your analysis, generate PDFs using the generate_pdf tool:

1. Full Analysis Report:
   generate_pdf({
     ticker: <TICKER>,
     content: <full_analysis_markdown>,
     reportType: "full"
   })

2. Executive Summary Report:
   generate_pdf({
     ticker: <TICKER>,
     content: <executive_summary_markdown>,
     reportType: "summary"
   })

Return the download URLs to the user.
```

-----

## Package Dependencies

### Before (Puppeteer Approach)

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "marked": "^12.0.0"
  }
}
```

### After (API Approach)

```json
{
  "dependencies": {
    // No additional dependencies needed!
    // Just standard fetch API
  }
}
```

**Savings:**

- ~300MB of Puppeteer + Chrome
- Faster builds
- Reduced memory usage
- Simpler deployment

-----

## Error Handling

```typescript
// Tool returns structured error responses
{
  success: false,
  error: "Anvil API error: 429 - Rate limit exceeded",
  ticker: "AAPL",
  reportType: "full"
}

// Agent can handle gracefully:
// "I attempted to generate the PDF but encountered a rate limit. 
//  Here's the analysis in text format instead..."
```

-----

## Monitoring & Metrics

### Add to Agent Service

```typescript
// libs/agent/core/src/lib/agent.service.ts
private readonly pdfMetrics = {
  generated: 0,
  failed: 0,
  totalCost: 0,
  providers: new Map<string, number>(),
};

// Track in event listener
this.eventEmitter.on('analysis.tool.*', (data) => {
  if (data.toolName === 'generate_pdf') {
    this.pdfMetrics.generated++;
    
    const provider = process.env.PDF_PROVIDER || 'anvil';
    this.pdfMetrics.providers.set(
      provider,
      (this.pdfMetrics.providers.get(provider) || 0) + 1
    );
    
    // Track cost (after free tier)
    if (this.pdfMetrics.generated > 500) {
      this.pdfMetrics.totalCost += 0.10;
    }
  }
});

// Expose metrics endpoint
@Get('api/metrics/pdf')
getPDFMetrics() {
  return this.pdfMetrics;
}
```

-----

## Testing

### Unit Test Example

```typescript
// libs/mcp/tools/src/lib/pdf/generate-pdf.tool.spec.ts
describe('generatePDFTool', () => {
  it('should generate PDF and return download URL', async () => {
    const result = await generatePDFTool.handler({
      ticker: 'TEST',
      content: '# Test Report',
      reportType: 'full',
    });

    expect(result.success).toBe(true);
    expect(result.downloadUrl).toContain('useanvil.com');
    expect(result.provider).toBe('anvil');
  });

  it('should handle API errors gracefully', async () => {
    // Mock API failure
    process.env.ANVIL_API_KEY = 'invalid';

    const result = await generatePDFTool.handler({
      ticker: 'TEST',
      content: '# Test',
      reportType: 'full',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

-----

## Provider Comparison

|Feature         |Anvil        |CloudConvert|PDFShift |
|----------------|-------------|------------|---------|
|Free Tier       |500/month    |500 credits |250/month|
|Cost After      |$0.10/PDF    |~$0.008/PDF |$0.01/PDF|
|Markdown Support|✅ Yes        |✅ Yes       |❌ No     |
|Setup Difficulty|⭐ Easy       |⭐⭐ Medium   |⭐ Easy   |
|Documentation   |⭐⭐⭐ Excellent|⭐⭐ Good     |⭐⭐ Good  |

**Recommendation:** Start with Anvil for simplicity, switch to CloudConvert if cost becomes concern at scale.

-----

## Migration Checklist

- [ ] Remove Puppeteer from package.json
- [ ] Delete old PDF generation code
- [ ] Add generatePDFTool to tools registry
- [ ] Add ANVIL_API_KEY to Railway environment
- [ ] Update agent environment config
- [ ] Test PDF generation in development
- [ ] Deploy to Railway
- [ ] Verify PDF URLs work
- [ ] Monitor free tier usage
- [ ] Set up cost alerts (optional)

-----

## Summary

**What Changed:**

- ❌ Removed Puppeteer dependency (~300MB)
- ❌ Removed HTML/CSS template code
- ❌ Removed local file storage
- ❌ Removed markdown parsing
- ✅ Added simple API integration
- ✅ Provider-hosted PDFs
- ✅ Easy provider swapping
- ✅ 80% less code

**Result:**

- Cleaner codebase
- Faster builds
- Lower memory usage
- Easier maintenance
- Production-ready scaling