import { Injectable, Logger } from '@nestjs/common';
import {
  ToolEvent,
  ToolResultEvent,
  ToolName,
  isToolName,
  FinancialDataType,
  FinancialDataTypeLabel,
  ReportType,
  ReportTypeLabel,
  PeriodType,
} from '@stock-analyzer/shared/types';

/**
 * ToolEventFormatterService - Format Tool Call and Result Messages
 *
 * SINGLE RESPONSIBILITY: Transform tool events into user-friendly messages
 *
 * Handles:
 * - Tool call notifications (what's being fetched)
 * - Tool result messages (what was retrieved)
 * - Rich context extraction from tool inputs
 */
@Injectable()
export class ToolEventFormatterService {
  private readonly logger = new Logger(ToolEventFormatterService.name);

  /**
   * Format tool call notification
   */
  formatToolCall(data: ToolEvent): string {
    const cleanToolName = this.getCleanToolName(data.toolName);
    const input = data.toolInput || {};

    if (isToolName(data.toolName, ToolName.FETCH_COMPANY_DATA)) {
      return this.formatFetchCompanyData(input, data.ticker);
    } else if (isToolName(data.toolName, ToolName.CALCULATE_DCF)) {
      return this.formatCalculateDCF(input, data.ticker);
    } else if (isToolName(data.toolName, ToolName.GENERATE_PDF)) {
      return this.formatGeneratePDF(input, data.ticker);
    } else {
      return `🔧 ${cleanToolName}...`;
    }
  }

  /**
   * Format tool result notification
   */
  formatToolResult(data: ToolResultEvent): string {
    if (!data.toolName) {
      return '✅ Tool completed successfully';
    }

    const input = data.toolInput || {};

    if (isToolName(data.toolName, ToolName.FETCH_COMPANY_DATA)) {
      const dataTypes = (input['dataTypes'] as string[]) || [];
      const period = (input['period'] as PeriodType) || PeriodType.QUARTERLY;
      const limit = (input['limit'] as number) || 4;

      let message = `✅ Financial data retrieved successfully!\n\n`;

      if (dataTypes.length > 0) {
        const typeLabels = dataTypes.map((type: string) => {
          return FinancialDataTypeLabel[type as FinancialDataType] || type;
        });
        message += `📊 Data fetched:\n`;
        typeLabels.forEach((label: string) => {
          message += `  • ${label}\n`;
        });
      }

      message += `\n⏱️ Period: ${period === PeriodType.QUARTERLY ? 'Last ' + limit + ' quarters' : 'Last ' + limit + ' years'}\n\n`;
      message += `⏰ Analysis may take 1-2 minutes. Please wait...`;

      return message;
    } else if (isToolName(data.toolName, ToolName.CALCULATE_DCF)) {
      const projectionYears = (input['projectionYears'] as number) || 5;
      const discountRate = (input['discountRate'] as number) || 0.10;

      return `✅ DCF valuation completed!\n\n` +
             `📈 Parameters:\n` +
             `  • Projection: ${projectionYears} years\n` +
             `  • Discount rate: ${(discountRate * 100).toFixed(1)}%`;
    } else if (isToolName(data.toolName, ToolName.GENERATE_PDF)) {
      const reportType = (input['reportType'] as ReportType) || ReportType.SUMMARY;
      const label = ReportTypeLabel[reportType as ReportType] || reportType;

      return `✅ ${label} PDF generated successfully!`;
    } else {
      return '✅ Tool completed successfully';
    }
  }

  /**
   * Format fetch_company_data tool call
   */
  private formatFetchCompanyData(input: Record<string, unknown>, ticker: string): string {
    const dataTypes = (input['dataTypes'] as string[]) || [];
    const period = (input['period'] as PeriodType) || PeriodType.QUARTERLY;
    const limit = (input['limit'] as number) || 4;

    let message = `📊 Fetching ${ticker} financial data...\n`;

    if (dataTypes.length > 0) {
      const typeLabels = dataTypes.map((type: string) => {
        return FinancialDataTypeLabel[type as FinancialDataType] || type;
      });
      message += `• Data: ${typeLabels.join(', ')}\n`;
    }

    message += `• Period: ${period === PeriodType.QUARTERLY ? 'Last ' + limit + ' quarters' : 'Last ' + limit + ' years'}`;

    return message;
  }

  /**
   * Format calculate_dcf tool call
   */
  private formatCalculateDCF(input: Record<string, unknown>, ticker: string): string {
    const projectionYears = (input['projectionYears'] as number) || 5;
    const discountRate = (input['discountRate'] as number) || 0.10;

    return `🧮 Running DCF valuation...\n` +
           `• Ticker: ${ticker}\n` +
           `• Projection: ${projectionYears} years\n` +
           `• Discount rate: ${(discountRate as number * 100).toFixed(1)}%`;
  }

  /**
   * Format generate_pdf tool call
   */
  private formatGeneratePDF(input: Record<string, unknown>, ticker: string): string {
    const reportType = (input['reportType'] as ReportType) || ReportType.SUMMARY;
    const label = ReportTypeLabel[reportType as ReportType] || reportType;

    return `📄 Generating ${label} PDF report for ${ticker}...`;
  }

  /**
   * Get clean tool name (remove MCP prefix)
   */
  private getCleanToolName(toolName: string): string {
    return toolName
      .replace('mcp__stock-analyzer__', '')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
