import { Injectable } from '@nestjs/common';

/**
 * HTMLFormatterService - Rich HTML Formatting for Telegram Messages
 *
 * Provides template functions for beautifully formatted messages using:
 * - HTML tags (bold, italic, code, etc.)
 * - Emojis for visual emphasis
 * - Box drawing characters for structure
 * - Monospace for numbers and data
 *
 * All messages use HTML parse_mode for reliability with financial data.
 */
@Injectable()
export class HTMLFormatterService {
  /**
   * Format analysis complete message with summary box
   */
  formatAnalysisComplete(params: {
    ticker: string;
    duration: number;
    model: string;
  }): string {
    const { ticker, duration, model } = params;

    return `
✅ <b>${ticker} Analysis Complete!</b>

⏱️ Duration: <code>${duration}s</code>
🤖 Model: <code>${model}</code>

💬 <b>What's next?</b>
  ▪ Ask follow-up questions
  ▪ Use /analyze for another stock
  ▪ Use /status to view session
`.trim();
  }

  /**
   * Format valuation summary box
   */
  formatValuationSummary(params: {
    ticker: string;
    currentPrice: number;
    fairValue: number;
    upside: number;
    rating: string;
  }): string {
    const { ticker, currentPrice, fairValue, upside, rating } = params;
    const upsideSign = upside >= 0 ? '+' : '';

    return `
┌─────────────────────────────
│ <b>📊 VALUATION: ${ticker}</b>
├─────────────────────────────
│ Current:  <code>$${currentPrice.toFixed(2)}</code>
│ Fair:     <code>$${fairValue.toFixed(2)}</code>
│ Upside:   <code>${upsideSign}${upside.toFixed(1)}%</code>
├─────────────────────────────
│ <b>Rating: ${rating}</b>
└─────────────────────────────
`.trim();
  }

  /**
   * Format tool call notification
   */
  formatToolCall(params: {
    toolName: string;
    ticker?: string;
    details?: string[];
    period?: string;
  }): string {
    const { toolName, ticker, details, period } = params;

    let message = `🔧 <b>${toolName}</b>\n`;

    if (ticker) {
      message += `\n<b>Ticker:</b> ${ticker}\n`;
    }

    if (details && details.length > 0) {
      message += `\n<b>Data:</b>\n`;
      details.forEach((detail) => {
        message += `  ▪ ${detail}\n`;
      });
    }

    if (period) {
      message += `\n<b>Period:</b> ${period}\n`;
    }

    message += `\n⏳ Processing...`;

    return message.trim();
  }

  /**
   * Format tool result with success confirmation
   */
  formatToolResult(params: {
    toolName: string;
    details?: string[];
    duration?: number;
  }): string {
    const { toolName, details, duration } = params;

    let message = `✅ <b>${toolName} Complete!</b>\n`;

    if (details && details.length > 0) {
      message += `\n<b>Retrieved:</b>\n`;
      details.forEach((detail) => {
        message += `  ▪ ${detail}\n`;
      });
    }

    if (duration) {
      message += `\n⏱️ <code>${duration}ms</code>`;
    }

    return message.trim();
  }

  /**
   * Format session status with workflow history
   */
  formatSessionStatus(params: {
    sessionId: string;
    status: string;
    createdAt: Date;
    messageCount: number;
    workflows: Array<{
      type: string;
      ticker?: string;
      completed: boolean;
      duration?: number;
    }>;
  }): string {
    const { sessionId, status, createdAt, messageCount, workflows } = params;

    const statusIcon = status === 'active' ? '🟢' : '⚪';
    const timeStr = this.formatTime(createdAt);

    let message = `
📊 <b>Session Status</b>

<b>Session ID:</b> <code>${sessionId}</code>
<b>Status:</b> ${statusIcon} ${this.capitalize(status)}
<b>Created:</b> ${timeStr}
`.trim();

    if (workflows.length > 0) {
      message += `\n\n<b>📈 Workflows:</b> ${workflows.length} total\n`;
      workflows.forEach((wf) => {
        const icon = wf.completed ? '✅' : '⏳';
        const tickerStr = wf.ticker ? ` (${wf.ticker})` : '';
        const durationStr = wf.duration ? ` - ${Math.round(wf.duration / 1000)}s` : '';
        message += `  ${icon} ${wf.type}${tickerStr}${durationStr}\n`;
      });
    }

    if (messageCount > 0) {
      message += `\n<b>💬 Messages:</b> ${messageCount} in conversation`;
    }

    return message;
  }

  /**
   * Format error message with actionable steps
   */
  formatError(params: {
    title: string;
    reason?: string;
    ticker?: string;
    actions?: string[];
  }): string {
    const { title, reason, ticker, actions } = params;

    let message = `⚠️ <b>${title}</b>\n`;

    if (ticker) {
      message += `\n<b>Ticker:</b> ${ticker}\n`;
    }

    if (reason) {
      message += `\n<b>Reason:</b> ${reason}\n`;
    }

    if (actions && actions.length > 0) {
      message += `\n<b>What to try:</b>\n`;
      actions.forEach((action) => {
        message += `▪ ${action}\n`;
      });
    }

    message += `\n<i>Use /help if you need assistance</i>`;

    return message.trim();
  }

  /**
   * Format progress indicator
   */
  formatProgress(steps: Array<{ label: string; status: 'done' | 'active' | 'pending' }>): string {
    let message = '<b>📊 Analysis Progress</b>\n\n';

    steps.forEach((step) => {
      let icon: string;
      switch (step.status) {
        case 'done':
          icon = '✅';
          break;
        case 'active':
          icon = '⏳';
          break;
        case 'pending':
          icon = '⏹';
          break;
      }
      message += `${icon} ${step.label}\n`;
    });

    return message.trim();
  }

  /**
   * Format help menu with commands
   */
  formatHelp(): string {
    return `
🤖 <b>Stock Analyzer Bot</b>

<b>📊 Analysis Commands</b>
/analyze TICKER - Full stock analysis
  <i>Example: /analyze AAPL</i>

<b>💬 Conversation</b>
Ask me anything about stocks!
  <i>Example: "What's a good P/E ratio?"</i>

<b>🔧 Session Management</b>
/status - View current session
/new or /reset - Start fresh
/stop - Stop analysis

<b>ℹ️ Help</b>
/help - Show this message
`.trim();
  }

  /**
   * Format data table with monospace
   */
  formatDataTable(params: {
    title: string;
    rows: Array<{ label: string; value: string; change?: string }>;
  }): string {
    const { title, rows } = params;

    let message = `<b>${title}</b>\n\n<pre>`;

    const maxLabelLength = Math.max(...rows.map((r) => r.label.length));

    rows.forEach((row) => {
      const paddedLabel = row.label.padEnd(maxLabelLength);
      const changeStr = row.change ? `  (${row.change})` : '';
      message += `${paddedLabel}  ${row.value}${changeStr}\n`;
    });

    message += `</pre>`;

    return message.trim();
  }

  /**
   * Format financial metrics
   */
  formatMetrics(params: {
    ticker: string;
    metrics: Record<string, string | number>;
  }): string {
    const { ticker, metrics } = params;

    let message = `<b>💰 ${ticker} Key Metrics</b>\n\n`;

    Object.entries(metrics).forEach(([key, value]) => {
      const label = this.formatLabel(key);
      message += `<b>${label}:</b> <code>${value}</code>\n`;
    });

    return message.trim();
  }

  /**
   * Format new session welcome message
   */
  formatNewSession(): string {
    return `
✨ <b>New Session Started!</b>

<b>What you can do:</b>
  ▪ Ask financial questions
  ▪ Use /analyze TICKER for analysis
  ▪ Use /status to view session
  ▪ Use /help for all commands

<i>Let's analyze some stocks! 📈</i>
`.trim();
  }

  /**
   * Format context compaction notice
   */
  formatContextCompacted(): string {
    return `
🔄 <b>Context Optimized</b>

Your conversation history grew large and was compacted to maintain performance.

<b>You can:</b>
  ▪ Continue chatting normally
  ▪ Use /new for a fresh start

<i>All your data is still available!</i>
`.trim();
  }

  /**
   * Format thinking indicator
   */
  formatThinking(): string {
    return '💭 <b>Thinking...</b>';
  }

  // --- Helper Methods ---

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private formatTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  }

  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  /**
   * Escape HTML special characters
   */
  escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
