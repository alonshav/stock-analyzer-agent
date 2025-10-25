# Implementation Plan: Full Spec Alignment

**Created:** January 2025
**Goal:** Add missing commands from Product Spec v1.2
**Target:** 5 commands: `/disclaimer`, `/earnings`, `/earnings_summary`, `/sentiment`, `/news`

---

## Phase 1: FMP Sentiment Tools (Foundation)

### 1.1 Add FMP Sentiment Endpoints to FMPAdapter

**File:** `libs/mcp/integrations/src/lib/fmp/fmp.adapter.ts`

**New Methods to Add:**

```typescript
// 1. Stock News Sentiments RSS Feed
async getStockNewsSentiment(ticker: string): Promise<NewsSentiment[]> {
  // Endpoint: /stock-news-sentiments-rss-feed
  // Returns: Array of news with sentiment scores
}

// 2. Historical Social Sentiment
async getSocialSentiment(ticker: string): Promise<SocialSentiment | null> {
  // Endpoint: /historical/social-sentiment
  // Returns: Social media sentiment data (Reddit, Twitter, StockTwits)
}

// 3. Social Sentiment Changes
async getSocialSentimentChanges(ticker: string): Promise<SentimentChange[]> {
  // Endpoint: /social-sentiment/change
  // Returns: Changes in sentiment over time
}

// 4. Stock Grades (Analyst Sentiment)
async getStockGrades(ticker: string, limit = 10): Promise<StockGrade[]> {
  // Endpoint: /grade/{ticker}
  // Returns: Analyst grades/ratings
}
```

**Type Definitions Needed:**

```typescript
// libs/shared/types/src/lib/sentiment.types.ts
export interface NewsSentiment {
  symbol: string;
  title: string;
  publishedDate: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  url: string;
  text: string;
  site: string;
}

export interface SocialSentiment {
  symbol: string;
  date: string;
  stocktwitsPosts: number;
  twitterPosts: number;
  redditPosts: number;
  stocktwitsComments: number;
  twitterComments: number;
  redditComments: number;
  stocktwitsLikes: number;
  twitterLikes: number;
  redditLikes: number;
  stocktwitsImpressions: number;
  twitterImpressions: number;
  redditImpressions: number;
  sentiment: number; // -1 to 1
  sentimentClassification: 'bearish' | 'bullish' | 'neutral';
}

export interface SentimentChange {
  symbol: string;
  date: string;
  sentiment: number;
  sentimentChange: number;
  percentChange: number;
}

export interface StockGrade {
  symbol: string;
  date: string;
  gradingCompany: string;
  previousGrade: string;
  newGrade: string;
}
```

**Effort:** 3-4 hours

---

### 1.2 Create Sentiment Tool

**File:** `libs/mcp/tools/src/lib/sentiment/fetch-sentiment-tool.ts` (NEW)

**Purpose:** MCP tool that wraps FMP sentiment endpoints

**Tool Definition:**

```typescript
export const FetchSentimentTool: Tool = {
  name: 'fetch_sentiment_data',
  description: `Fetch sentiment analysis data for a stock ticker.

  Returns:
  - News sentiment from multiple sources
  - Social media sentiment (Twitter, Reddit, StockTwits)
  - Analyst ratings and grades
  - Sentiment trend changes

  Use this to gauge market mood and investor sentiment for investment decisions.`,

  inputSchema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock ticker symbol (e.g., AAPL, TSLA)'
      },
      includeNews: {
        type: 'boolean',
        description: 'Include news sentiment analysis',
        default: true
      },
      includeSocial: {
        type: 'boolean',
        description: 'Include social media sentiment',
        default: true
      },
      includeGrades: {
        type: 'boolean',
        description: 'Include analyst grades',
        default: true
      }
    },
    required: ['ticker']
  }
};

// Implementation calls FMPAdapter methods and aggregates results
```

**Register in ToolRegistry:**

```typescript
// libs/mcp/tools/src/lib/tool-registry.ts
getTools(): Tool[] {
  return [
    ...
    FetchSentimentTool,
  ];
}
```

**Effort:** 2 hours

---

### 1.3 Create News Tool

**File:** `libs/mcp/tools/src/lib/news/fetch-news-tool.ts` (NEW)

**Purpose:** Fetch recent news for ticker

**New FMPAdapter Method:**

```typescript
// libs/mcp/integrations/src/lib/fmp/fmp.adapter.ts
async getStockNews(ticker: string, limit = 20): Promise<StockNews[]> {
  // Endpoint: /stock_news
  // Returns: Recent news articles
}
```

**Tool Definition:**

```typescript
export const FetchNewsTool: Tool = {
  name: 'fetch_news',
  description: `Fetch recent news articles for a stock ticker.

  Returns up to 20 recent news articles with:
  - Headline and summary
  - Publication date and source
  - News URL
  - Related tickers

  Use this to understand recent developments affecting the stock.`,

  inputSchema: {
    type: 'object',
    properties: {
      ticker: {
        type: 'string',
        description: 'Stock ticker symbol'
      },
      limit: {
        type: 'number',
        description: 'Number of articles to fetch (max 20)',
        default: 10
      }
    },
    required: ['ticker']
  }
};
```

**Effort:** 1-2 hours

---

## Phase 2: Workflow System Prompts

### 2.1 Create EARNINGS Workflow

**File:** `libs/agent/core/src/lib/workflows/workflow-registry.ts`

**Add Workflow Type:**

```typescript
// libs/shared/types/src/lib/enums.ts
export enum WorkflowType {
  FULL_ANALYSIS = 'full_analysis',
  SENTIMENT = 'sentiment',
  DCF_VALUATION = 'dcf_valuation',
  PEER_COMPARISON = 'peer_comparison',
  EARNINGS = 'earnings',  // NEW
}
```

**Workflow Configuration:**

```typescript
[WorkflowType.EARNINGS]: {
  type: WorkflowType.EARNINGS,
  systemPrompt: `You are a quarterly earnings analysis expert specializing in financial reporting analysis.

Your goal is to provide comprehensive quarterly earnings analysis with beat/miss tracking, guidance evaluation, and YoY/QoQ trends.

## Available Tools

- **fetch_company_data**: Fetch financial data with dynamic period selection
  - Support both 'annual' and 'quarter' periods
  - Allow flexible limit (number of periods to fetch)
  - LLM can decide period and limit based on user's request

## Analysis Framework

1. **Determine Period Requirements:**
   - If user specifies quarter (e.g., "Q3 2024"), fetch that specific quarter
   - If no quarter specified, ASK USER: "Which quarter would you like to analyze? (e.g., Q3 2024, latest quarter)"
   - Default to latest quarter only if user says "latest" or "most recent"

2. **Beat/Miss Analysis:**
   - EPS: Actual vs Estimate with % beat/miss
   - Revenue: Actual vs Estimate with % beat/miss
   - Historical beat rate (last 4 quarters)

3. **Growth Metrics:**
   - Year-over-year (YoY) growth: Revenue, EPS, segments
   - Quarter-over-quarter (QoQ) trends
   - Growth acceleration/deceleration

4. **Profitability & Margins:**
   - Gross margin trends
   - Operating margin changes
   - Net margin analysis

5. **Management Guidance:**
   - Forward guidance provided (Y/N)
   - Guidance vs consensus
   - Key assumptions

6. **Earnings Call Highlights:**
   - Critical management commentary
   - Strategic announcements
   - Q&A themes

7. **Market Reaction:**
   - Price movement
   - Volume analysis
   - Analyst changes

## Output Format

Generate a detailed earnings analysis report in markdown format covering all 7 sections above.

## Critical Instructions

- **ASK USER for quarter if not specified** - DO NOT assume
- Use fetch_company_data with period='quarter' for quarterly analysis
- Fetch at least 8 quarters (2 years) for trend analysis: limit=8
- Be specific about which quarter you're analyzing
- Compare to same quarter last year (YoY) and previous quarter (QoQ)`,

  model: AnthropicModel.HAIKU_4_5,
  maxTurns: 20,
  maxThinkingTokens: 8000,
  enabledTools: ['fetch_company_data'],
}
```

**Effort:** 1-2 hours

---

### 2.2 Update SENTIMENT Workflow

**File:** `libs/agent/core/src/lib/workflows/workflow-registry.ts`

**Update Configuration:**

```typescript
[WorkflowType.SENTIMENT]: {
  type: WorkflowType.SENTIMENT,
  systemPrompt: `You are a market sentiment analyzer specializing in investor psychology and market mood assessment.

Your goal is to analyze market sentiment from multiple sources: news, social media, and analyst ratings.

## Available Tools

- **fetch_company_data**: Get company profile and basic data
- **fetch_sentiment_data**: Get comprehensive sentiment analysis
  - News sentiment from multiple sources
  - Social media sentiment (Twitter, Reddit, StockTwits)
  - Analyst ratings and grades
  - Sentiment trend changes

## Analysis Framework

1. **Overall Sentiment Score:**
   - Aggregate sentiment from all sources (-1 to +1 scale)
   - Classification: Bullish / Neutral / Bearish
   - Confidence level

2. **News Sentiment:**
   - Recent news articles sentiment
   - Key positive themes
   - Key negative themes
   - Sentiment by source (credibility weighting)

3. **Social Media Sentiment:**
   - Twitter/Reddit/StockTwits analysis
   - Mention volume and trends
   - Community sentiment shifts
   - Viral topics and discussions

4. **Analyst Sentiment:**
   - Recent upgrades/downgrades
   - Rating distribution (Strong Buy to Strong Sell)
   - Consensus vs outliers
   - Grading company credibility

5. **Sentiment vs Price Correlation:**
   - Does sentiment match price movement?
   - Potential contrarian signals
   - Sentiment leading vs lagging price

6. **Trend Analysis:**
   - Sentiment improving, stable, or declining?
   - Recent sentiment changes and catalysts
   - Forward-looking sentiment indicators

## Output Format

Generate a comprehensive sentiment analysis report covering all 6 sections above in markdown format.

## Critical Instructions

- Call fetch_sentiment_data for comprehensive sentiment data
- Analyze ALL sentiment sources (news, social, analysts)
- Identify contrarian opportunities (sentiment vs fundamentals mismatch)
- Be objective - both positive and negative sentiment matter`,

  model: AnthropicModel.HAIKU_4_5,
  maxTurns: 15,
  maxThinkingTokens: 7000,
  enabledTools: ['fetch_company_data', 'fetch_sentiment_data'],
}
```

**Effort:** 1 hour

---

### 2.3 Create NEWS Workflow

**File:** `libs/agent/core/src/lib/workflows/workflow-registry.ts`

**Add Workflow Configuration:**

```typescript
[WorkflowType.NEWS]: {
  type: WorkflowType.NEWS,
  systemPrompt: `You are a financial news analyst specializing in news impact assessment and market reaction analysis.

Your goal is to analyze recent news and assess its impact on the stock's valuation and trajectory.

## Available Tools

- **fetch_company_data**: Get company profile and current valuation
- **fetch_news**: Fetch recent news articles (up to 20)
- **fetch_sentiment_data**: Get news sentiment scores

## Analysis Framework

1. **News Summary:**
   - Curate 5-10 most important recent news items
   - Headline, date, source for each
   - Brief summary of key points

2. **Impact Assessment:**
   - Material vs non-material news
   - Positive, negative, or neutral impact
   - Short-term vs long-term implications
   - Revenue/earnings impact estimates

3. **Market Reaction:**
   - Price movement after news
   - Volume changes
   - Analyst reactions
   - Peer comparison (similar news for competitors)

4. **Key Themes:**
   - Recurring topics (e.g., supply chain, competition, regulation)
   - Management actions and strategy shifts
   - Industry trends affecting company

5. **Forward-Looking Implications:**
   - What does recent news suggest about future?
   - Risks vs opportunities identified
   - Catalysts to watch

6. **Investment Thesis Impact:**
   - How does news affect bull/bear case?
   - Valuation implications
   - Risk/reward changes

## Output Format

Generate a news impact analysis report covering all 6 sections above in markdown format.

## Critical Instructions

- Fetch at least 10 recent news articles
- Focus on MATERIAL news (not noise)
- Assess both qualitative and quantitative impact
- Connect news to fundamental valuation (not just sentiment)
- Identify forward-looking catalysts`,

  model: AnthropicModel.HAIKU_4_5,
  maxTurns: 15,
  maxThinkingTokens: 7000,
  enabledTools: ['fetch_company_data', 'fetch_news', 'fetch_sentiment_data'],
}
```

**Add WorkflowType Enum Value:**

```typescript
// libs/shared/types/src/lib/enums.ts
export enum WorkflowType {
  FULL_ANALYSIS = 'full_analysis',
  SENTIMENT = 'sentiment',
  DCF_VALUATION = 'dcf_valuation',
  PEER_COMPARISON = 'peer_comparison',
  EARNINGS = 'earnings',
  NEWS = 'news',  // NEW
}
```

**Effort:** 1-2 hours

---

## Phase 3: Bot Commands

### 3.1 Implement `/earnings` Command

**File:** `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Add Command Handler:**

```typescript
// Register command
this.bot.command('earnings', this.handleEarningsCommand.bind(this));

// Handler implementation
private async handleEarningsCommand(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const args = text.split(' ').slice(1); // Remove '/earnings'
  const ticker = args[0]?.toUpperCase();
  const quarter = args[1]?.toUpperCase(); // Optional: Q3, Q3-2024, etc.
  const chatId = ctx.chat?.id.toString();

  if (!ticker) {
    await ctx.reply(BotMessages.EARNINGS_USAGE);
    return;
  }

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  // Check if bot is currently responding
  if (this.streamManager.isResponding(chatId)) {
    await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.WAIT_FOR_RESPONSE);
    return;
  }

  try {
    await ctx.sendChatAction('typing');

    // Build user prompt
    let userPrompt = `Analyze quarterly earnings for ${ticker}`;
    if (quarter) {
      userPrompt += ` for ${quarter}`;
    } else {
      userPrompt += ` for the latest quarter`;
    }

    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.STARTING_EARNINGS_ANALYSIS(ticker, quarter)
    );

    // Execute workflow
    await this.streamManager.executeWorkflow(
      chatId,
      WorkflowType.EARNINGS,
      ticker,
      ctx,
      this.agentUrl,
      userPrompt
    );
  } catch (error) {
    this.logger.error(`[${chatId}] Error executing earnings workflow:`, error);
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.EARNINGS_ANALYSIS_FAILED(ticker)
    );
  }
}
```

**Add Messages:**

```typescript
// libs/bot/common/src/lib/messages.ts
EARNINGS_USAGE: `Usage: /earnings TICKER [QUARTER]
Examples:
  /earnings AAPL
  /earnings TSLA Q3
  /earnings MSFT Q4-2024`,

STARTING_EARNINGS_ANALYSIS: (ticker: string, quarter?: string) =>
  quarter
    ? `📈 Analyzing ${quarter} earnings for ${ticker}...`
    : `📈 Analyzing latest earnings for ${ticker}...`,

EARNINGS_ANALYSIS_FAILED: (ticker: string) =>
  `Failed to analyze earnings for ${ticker}. Please try again.`,
```

**Effort:** 2 hours

---

### 3.2 Implement `/earnings_summary` Command

**File:** `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Purpose:** Quick earnings snapshot (text-only, no PDF, 30 seconds)

**Implementation Approach:** Direct API call, NOT streaming workflow

**Add Command Handler:**

```typescript
this.bot.command('earnings_summary', this.handleEarningsSummaryCommand.bind(this));

private async handleEarningsSummaryCommand(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const ticker = text.split(' ')[1]?.toUpperCase();
  const chatId = ctx.chat?.id.toString();

  if (!ticker) {
    await ctx.reply(BotMessages.EARNINGS_SUMMARY_USAGE);
    return;
  }

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  try {
    await ctx.sendChatAction('typing');

    // Call Agent API for quick summary (NOT workflow, just conversation mode)
    const history = this.sessionOrchestrator.getConversationHistory(chatId);

    await this.streamManager.startConversation(
      chatId,
      `Give me a quick earnings summary for ${ticker} latest quarter. Focus on: EPS beat/miss, Revenue beat/miss, YoY growth, guidance. Keep it under 200 words.`,
      history,
      ctx,
      this.agentUrl
    );
  } catch (error) {
    this.logger.error(`[${chatId}] Error fetching earnings summary:`, error);
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.EARNINGS_SUMMARY_FAILED(ticker)
    );
  }
}
```

**Effort:** 1-2 hours

---

### 3.3 Implement `/sentiment` Command

**File:** `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Add Command Handler:**

```typescript
this.bot.command('sentiment', this.handleSentimentCommand.bind(this));

private async handleSentimentCommand(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const ticker = text.split(' ')[1]?.toUpperCase();
  const chatId = ctx.chat?.id.toString();

  if (!ticker) {
    await ctx.reply(BotMessages.SENTIMENT_USAGE);
    return;
  }

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  if (this.streamManager.isResponding(chatId)) {
    await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.WAIT_FOR_RESPONSE);
    return;
  }

  try {
    await ctx.sendChatAction('typing');
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.STARTING_SENTIMENT_ANALYSIS(ticker)
    );

    await this.streamManager.executeWorkflow(
      chatId,
      WorkflowType.SENTIMENT,
      ticker,
      ctx,
      this.agentUrl
    );
  } catch (error) {
    this.logger.error(`[${chatId}] Error executing sentiment workflow:`, error);
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.SENTIMENT_ANALYSIS_FAILED(ticker)
    );
  }
}
```

**Effort:** 1 hour (workflow already defined, just wire command)

---

### 3.4 Implement `/news` Command

**File:** `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Add Command Handler:**

```typescript
this.bot.command('news', this.handleNewsCommand.bind(this));

private async handleNewsCommand(ctx: Context) {
  const message = ctx.message as any;
  const text = message?.text || '';
  const ticker = text.split(' ')[1]?.toUpperCase();
  const chatId = ctx.chat?.id.toString();

  if (!ticker) {
    await ctx.reply(BotMessages.NEWS_USAGE);
    return;
  }

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  if (this.streamManager.isResponding(chatId)) {
    await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.WAIT_FOR_RESPONSE);
    return;
  }

  try {
    await ctx.sendChatAction('typing');
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.STARTING_NEWS_ANALYSIS(ticker)
    );

    await this.streamManager.executeWorkflow(
      chatId,
      WorkflowType.NEWS,
      ticker,
      ctx,
      this.agentUrl
    );
  } catch (error) {
    this.logger.error(`[${chatId}] Error executing news workflow:`, error);
    await this.botMessaging.sendAndTrack(
      ctx,
      chatId,
      BotMessages.NEWS_ANALYSIS_FAILED(ticker)
    );
  }
}
```

**Effort:** 1 hour

---

### 3.5 Implement `/disclaimer` Command

**File:** `libs/bot/telegram/src/lib/telegram-bot.service.ts`

**Add Command Handler:**

```typescript
this.bot.command('disclaimer', this.handleDisclaimerCommand.bind(this));

private async handleDisclaimerCommand(ctx: Context) {
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.DISCLAIMER_FULL);
}
```

**Add Disclaimer Messages:**

```typescript
// libs/bot/common/src/lib/messages.ts
DISCLAIMER_FULL: `⚠️ FINANCIAL DISCLAIMER

Stock Analyzer Bot provides educational financial
analysis ONLY. This is NOT investment advice.

Key Points:
• We are NOT licensed financial advisors
• We do NOT recommend specific investments
• YOU are solely responsible for your decisions
• All investments carry risk (including loss of principal)
• Past performance ≠ future results
• Data may contain errors or delays

By using this bot, you acknowledge:
✓ You've read and understood this disclaimer
✓ You'll conduct your own research
✓ You'll consult licensed professionals before investing
✓ You accept all investment risks

📄 Full legal terms: https://stockanalyzer.bot/disclaimer

Questions? Email: legal@stockanalyzer.bot`,
```

**Update `/start` Command to Show Disclaimer:**

```typescript
private async handleStartCommand(ctx: Context) {
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    await ctx.reply(BotMessages.UNABLE_TO_IDENTIFY_CHAT);
    return;
  }

  // Check if user has seen disclaimer
  const session = this.sessionOrchestrator.getSession(chatId);
  const hasSeenDisclaimer = session?.metadata?.disclaimerSeen || false;

  if (!hasSeenDisclaimer) {
    // First time user
    await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.WELCOME_WITH_DISCLAIMER);

    // Mark disclaimer as seen
    const currentSession = this.sessionOrchestrator.getOrCreateSession(chatId);
    currentSession.metadata = {
      ...currentSession.metadata,
      disclaimerSeen: true,
    };
  } else {
    // Returning user
    await this.botMessaging.sendAndTrack(ctx, chatId, BotMessages.WELCOME_BACK);
  }
}
```

**Add Welcome Messages:**

```typescript
WELCOME_WITH_DISCLAIMER: `👋 Welcome to Stock Analyzer!

⚠️ DISCLAIMER
This bot provides educational analysis only.
NOT investment advice. You're responsible for
your investment decisions. Always consult a
licensed financial advisor.

By continuing, you acknowledge the above.

💬 Ask me anything about stocks
📊 Get comprehensive company analyses
📈 Analyze quarterly earnings reports
📰 Track news and sentiment

Quick start:
• Try: /analyze AAPL
• Try: /earnings TSLA
• Or just ask a question!

Type /disclaimer anytime to see full terms.`,

WELCOME_BACK: `👋 Welcome back to Stock Analyzer!

💬 Ask me anything about stocks
📊 Get comprehensive analyses
📈 Analyze quarterly earnings

Ready when you are!`,
```

**Effort:** 2 hours

---

## Phase 4: Update Help Command & Testing

### 4.1 Update `/help` Command

**File:** `libs/bot/common/src/lib/messages.ts`

```typescript
HELP_TEXT: `Stock Analyzer Bot

Commands:
/analyze TICKER - Full stock analysis
/earnings TICKER [Q] - Quarterly earnings analysis
/earnings_summary TICKER - Quick earnings snapshot
/sentiment TICKER - Market sentiment analysis
/news TICKER - Recent news impact analysis
/status - View session info
/disclaimer - View financial disclaimer
/new or /reset - Start fresh session
/help - Show this message

You can also ask me any financial questions directly!

Examples:
• "What's a P/E ratio?"
• "Compare AAPL to MSFT"
• "Explain DCF valuation"`,
```

**Effort:** 15 minutes

---

### 4.2 Testing Checklist

**Manual Testing:**

1. **Disclaimer:**
   - [ ] First `/start` shows disclaimer
   - [ ] Returning `/start` skips disclaimer
   - [ ] `/disclaimer` displays full text

2. **Earnings:**
   - [ ] `/earnings AAPL` analyzes latest quarter
   - [ ] `/earnings AAPL Q3` analyzes Q3
   - [ ] LLM asks for quarter if not specified
   - [ ] Analysis includes beat/miss, YoY/QoQ, guidance

3. **Earnings Summary:**
   - [ ] `/earnings_summary AAPL` returns text (not PDF)
   - [ ] Response is under 30 seconds
   - [ ] Includes key metrics

4. **Sentiment:**
   - [ ] `/sentiment TSLA` runs sentiment workflow
   - [ ] Calls fetch_sentiment_data tool
   - [ ] Generates PDF report
   - [ ] Includes news + social + analyst sentiment

5. **News:**
   - [ ] `/news NVDA` runs news workflow
   - [ ] Calls fetch_news tool
   - [ ] Generates PDF report
   - [ ] Analyzes impact of recent news

6. **Help:**
   - [ ] `/help` shows all commands
   - [ ] All new commands listed

**Effort:** 2-3 hours

---

## Phase 5: UX Improvements (Spec Section 8.3)

### 5.1 Problem Statement

**Current UX Issues:**
- ❌ Message spam (each event creates new message)
- ❌ No progress visibility (no % complete or checkmarks)
- ❌ Typing indicator expires after 5 seconds (looks like bot crashed)
- ❌ No workflow-specific status emojis
- ❌ No update throttling (potential rate limits)

**Spec Requirements (Section 8.3):**
- ✅ Message editing (NOT spamming)
- ✅ Progress percentages (0-100%)
- ✅ Checkmarks for completed steps (✓)
- ✅ Typing indicator refresh every 4 seconds
- ✅ Update throttling (max 1/second)
- ✅ Workflow-specific emojis

---

### 5.2 Implement Progress Message Editing

**File:** `libs/bot/telegram/src/lib/stream-manager.service.ts`

**Add State Management:**

```typescript
private progressMessages = new Map<string, number>();    // chatId -> messageId
private lastUpdateTime = new Map<string, number>();      // chatId -> timestamp
private typingIntervals = new Map<string, NodeJS.Timeout>(); // chatId -> interval
private currentPhase = new Map<string, string>();        // chatId -> phase name
private completedSteps = new Map<string, string[]>();    // chatId -> completed steps
```

**Add Progress Tracking Method:**

```typescript
/**
 * Update progress message with throttling
 * Spec: Max 1 update per second, edit same message (don't spam)
 */
private async updateProgressMessage(
  ctx: Context,
  chatId: string,
  ticker: string,
  workflowType: WorkflowType,
  progress: number,
  currentStep?: string
): Promise<void> {
  const now = Date.now();
  const lastUpdate = this.lastUpdateTime.get(chatId) || 0;

  // Throttle: Max 1 update per second (Spec requirement)
  if (now - lastUpdate < 1000) {
    return;
  }

  this.lastUpdateTime.set(chatId, now);

  // Build progress message
  const emoji = this.getWorkflowEmoji(workflowType);
  const verb = this.getWorkflowVerb(workflowType);
  const completed = this.completedSteps.get(chatId) || [];

  let message = `${emoji} ${verb} ${ticker}... (${progress}%)\n\n`;

  // Add completed steps with checkmarks
  if (completed.length > 0) {
    message += completed.map(step => `${step} ✓`).join('\n') + '\n';
  }

  // Add current step (in progress)
  if (currentStep) {
    message += `${currentStep}...`;
  }

  try {
    const messageId = this.progressMessages.get(chatId);

    if (messageId) {
      // Edit existing message (Spec: don't spam)
      await ctx.telegram.editMessageText(
        ctx.chat?.id,
        messageId,
        undefined,
        message
      );
    } else {
      // Send initial progress message
      const sent = await ctx.reply(message);
      this.progressMessages.set(chatId, sent.message_id);
    }
  } catch (error) {
    // Ignore edit errors (message too old, etc.)
    this.logger.debug(`Failed to edit progress message: ${error.message}`);
  }
}

/**
 * Get workflow-specific emoji (Spec Section 8.3.3)
 */
private getWorkflowEmoji(workflowType: WorkflowType): string {
  const emojiMap: Record<WorkflowType, string> = {
    [WorkflowType.FULL_ANALYSIS]: '📊',
    [WorkflowType.EARNINGS]: '📈',
    [WorkflowType.SENTIMENT]: '📰',
    [WorkflowType.NEWS]: '📰',
    [WorkflowType.DCF_VALUATION]: '💰',
    [WorkflowType.PEER_COMPARISON]: '📊',
  };
  return emojiMap[workflowType] || '⏳';
}

/**
 * Get workflow-specific verb
 */
private getWorkflowVerb(workflowType: WorkflowType): string {
  const verbMap: Record<WorkflowType, string> = {
    [WorkflowType.FULL_ANALYSIS]: 'Analyzing',
    [WorkflowType.EARNINGS]: 'Analyzing earnings for',
    [WorkflowType.SENTIMENT]: 'Checking sentiment for',
    [WorkflowType.NEWS]: 'Fetching news for',
    [WorkflowType.DCF_VALUATION]: 'Calculating DCF for',
    [WorkflowType.PEER_COMPARISON]: 'Comparing',
  };
  return verbMap[workflowType] || 'Processing';
}

/**
 * Mark step as completed
 */
private markStepCompleted(chatId: string, step: string): void {
  const completed = this.completedSteps.get(chatId) || [];
  if (!completed.includes(step)) {
    completed.push(step);
    this.completedSteps.set(chatId, completed);
  }
}
```

**Update Event Handlers to Use Progress Tracking:**

```typescript
// In setupWorkflowEventHandlers(), replace CHUNK handler:
client.on(StreamEventType.CHUNK, async (data) => {
  // Don't send CHUNK content as separate messages
  // Just accumulate in buffer
  if (data.content) {
    const currentBuffer = this.streamBuffers.get(chatId) || '';
    this.streamBuffers.set(chatId, currentBuffer + data.content);
  }

  // Update progress message instead
  await this.updateProgressMessage(
    ctx,
    chatId,
    ticker,
    workflowType,
    50, // Progress estimation
    this.currentPhase.get(chatId)
  );
});

// Update TOOL handler to mark steps:
client.on(StreamEventType.TOOL, async (data) => {
  const toolName = this.extractToolName(data.toolName);
  this.currentPhase.set(chatId, toolName);

  await this.updateProgressMessage(
    ctx,
    chatId,
    ticker,
    workflowType,
    30, // Estimate based on tool
    toolName
  );
});

// Update TOOL_RESULT handler to mark completed:
client.on(StreamEventType.TOOL_RESULT, async (data) => {
  const toolName = this.extractToolName(data.toolName);
  this.markStepCompleted(chatId, toolName);

  await this.updateProgressMessage(
    ctx,
    chatId,
    ticker,
    workflowType,
    70, // Post-tool progress
    undefined
  );
});
```

**Effort:** 3-4 hours

---

### 5.3 Implement Typing Indicator Refresh

**File:** `libs/bot/telegram/src/lib/stream-manager.service.ts`

**Add Refresh Loop:**

```typescript
/**
 * Start typing indicator refresh loop
 * Spec: Refresh every 4 seconds (expires after 5 seconds)
 */
private startTypingRefresh(ctx: Context, chatId: string): void {
  // Clear any existing interval
  this.stopTypingRefresh(chatId);

  const interval = setInterval(async () => {
    // Stop if no longer responding
    if (!this.isResponding(chatId)) {
      this.stopTypingRefresh(chatId);
      return;
    }

    try {
      await ctx.sendChatAction('typing');
    } catch (error) {
      this.logger.debug(`Failed to refresh typing indicator: ${error.message}`);
    }
  }, 4000); // Every 4 seconds (Spec requirement)

  this.typingIntervals.set(chatId, interval);
}

/**
 * Stop typing indicator refresh loop
 */
private stopTypingRefresh(chatId: string): void {
  const interval = this.typingIntervals.get(chatId);
  if (interval) {
    clearInterval(interval);
    this.typingIntervals.delete(chatId);
  }
}
```

**Update Workflow Start:**

```typescript
private async startWorkflowStream(...) {
  // ... existing code ...

  // Start typing refresh loop (Spec requirement)
  this.startTypingRefresh(ctx, chatId);

  // Connect to Agent's workflow endpoint
  client.connect({...});
}
```

**Update Cleanup:**

```typescript
private cleanup(chatId: string): void {
  // ... existing cleanup ...

  // Stop typing refresh
  this.stopTypingRefresh(chatId);

  // Clear progress tracking
  this.progressMessages.delete(chatId);
  this.lastUpdateTime.delete(chatId);
  this.currentPhase.delete(chatId);
  this.completedSteps.delete(chatId);
}
```

**Effort:** 1-2 hours

---

### 5.4 Add Progress Percentage Estimation

**File:** `libs/bot/telegram/src/lib/stream-manager.service.ts`

**Progress Estimation Logic:**

```typescript
/**
 * Estimate progress based on workflow phase
 */
private estimateProgress(workflowType: WorkflowType, event: string): number {
  // Simple progress estimation based on typical workflow phases
  const progressMap: Record<string, number> = {
    'connected': 0,
    'system': 5,
    'tool_fetch_company_data': 20,
    'tool_result_fetch_company_data': 40,
    'tool_calculate_dcf': 50,
    'tool_result_calculate_dcf': 70,
    'tool_fetch_sentiment_data': 30,
    'tool_result_fetch_sentiment_data': 60,
    'tool_fetch_news': 25,
    'tool_result_fetch_news': 55,
    'chunk': 80,  // Generating analysis
    'pdf': 90,    // Generating PDFs
    'complete': 100,
  };

  return progressMap[event] || 50;
}
```

**Update Event Handlers to Use Estimation:**

```typescript
client.on(StreamEventType.TOOL, async (data) => {
  const progress = this.estimateProgress(workflowType, `tool_${data.toolName}`);
  await this.updateProgressMessage(ctx, chatId, ticker, workflowType, progress, ...);
});

client.on(StreamEventType.TOOL_RESULT, async (data) => {
  const progress = this.estimateProgress(workflowType, `tool_result_${data.toolName}`);
  await this.updateProgressMessage(ctx, chatId, ticker, workflowType, progress, ...);
});

client.on(StreamEventType.PDF, async (data) => {
  await this.updateProgressMessage(ctx, chatId, ticker, workflowType, 90, 'Generating PDF');
  // ... send PDF ...
});
```

**Effort:** 1 hour

---

### 5.5 Clean Up Status Messages on Completion

**Update COMPLETE Handler:**

```typescript
client.on(StreamEventType.COMPLETE, async (data) => {
  const duration = Math.round(data.metadata.duration / 1000);
  const fullAnalysis = this.streamBuffers.get(chatId) || '';

  // Delete progress message (cleanup)
  try {
    const messageId = this.progressMessages.get(chatId);
    if (messageId) {
      await ctx.telegram.deleteMessage(ctx.chat?.id, messageId);
    }
  } catch (error) {
    this.logger.debug(`Failed to delete progress message: ${error.message}`);
  }

  // Send completion message
  await this.botMessaging.sendAndTrack(
    ctx,
    chatId,
    `✅ Analysis complete!\n\n` +
    `⏱️ Duration: ${duration}s\n` +
    `🤖 Model: ${data.metadata.model}\n\n` +
    `💬 You can now ask follow-up questions!`
  );

  // ... rest of completion logic ...
});
```

**Effort:** 30 minutes

---

### 5.6 Update Testing Checklist

**Add UX Tests:**

7. **UX & Status Indicators:**
   - [ ] Progress message edits (not new messages)
   - [ ] Progress percentage shows (0-100%)
   - [ ] Completed steps show checkmarks (✓)
   - [ ] Typing indicator persists during workflow
   - [ ] Workflow-specific emojis (📊, 📈, 📰)
   - [ ] Updates throttled (max 1/second)
   - [ ] Progress message deleted on completion
   - [ ] No message spam during 2-3 min workflows

**Effort:** 1 hour (testing)

---

### 5.7 Summary: UX Phase Effort

| Task | Effort |
|------|--------|
| Progress message editing | 3-4 hours |
| Typing indicator refresh | 1-2 hours |
| Progress percentage estimation | 1 hour |
| Cleanup on completion | 30 min |
| Testing | 1 hour |
| **Total UX Phase** | **6.5-8.5 hours** |

---

## Summary: Total Effort Estimate

| Phase | Task | Effort |
|-------|------|--------|
| **Phase 1** | FMP Sentiment Endpoints | 3-4 hours |
| | Sentiment Tool | 2 hours |
| | News Tool | 1-2 hours |
| **Phase 2** | EARNINGS Workflow | 1-2 hours |
| | SENTIMENT Workflow | 1 hour |
| | NEWS Workflow | 1-2 hours |
| **Phase 3** | `/earnings` Command | 2 hours |
| | `/earnings_summary` Command | 1-2 hours |
| | `/sentiment` Command | 1 hour |
| | `/news` Command | 1 hour |
| | `/disclaimer` Command | 2 hours |
| **Phase 4** | Update Help | 15 min |
| | Testing | 2-3 hours |
| **Phase 5** | Progress message editing | 3-4 hours |
| | Typing indicator refresh | 1-2 hours |
| | Progress estimation | 1 hour |
| | Cleanup on completion | 30 min |
| | UX Testing | 1 hour |
| **Total** | | **26.5-34.5 hours** |

**Timeline:** 4-5 days for one developer

---

## Implementation Order (Recommended)

### Day 1: Foundation
1. Add FMP sentiment endpoints (4 hours)
2. Create sentiment tool (2 hours)
3. Create news tool (2 hours)

### Day 2: Workflows
4. Create EARNINGS workflow (2 hours)
5. Update SENTIMENT workflow (1 hour)
6. Create NEWS workflow (2 hours)
7. Add `/disclaimer` command (2 hours)

### Day 3: Commands
8. Add `/earnings` command (2 hours)
9. Add `/sentiment` command (1 hour)
10. Add `/news` command (1 hour)
11. Add `/earnings_summary` command (2 hours)

### Day 4: UX Improvements
12. Implement progress message editing (4 hours)
13. Add typing indicator refresh (2 hours)
14. Progress estimation logic (1 hour)

### Day 5: Polish & Testing
15. Cleanup on completion (30 min)
16. Update `/help` command (15 min)
17. Testing all commands + UX (3 hours)
18. Bug fixes and polish (remaining time)

---

## Critical Success Factors

1. **FMP Sentiment API Access:** Verify API key has access to sentiment endpoints
2. **LLM Quarter Handling:** Earnings workflow must ASK USER if quarter not specified
3. **Tool Registration:** All new tools must be registered in ToolRegistry
4. **Workflow Registration:** All workflow types must be in enum + registry
5. **Message Templates:** All bot messages centralized in BotMessages
6. **Disclaimer Tracking:** Session metadata stores disclaimerSeen flag
7. **Error Handling:** Graceful failures for all API calls
8. **Message Editing (NOT spam):** Progress messages must EDIT, not create new messages
9. **Update Throttling:** Max 1 update per second to avoid rate limits
10. **Typing Refresh:** Refresh every 4 seconds during workflows (Telegram expires after 5s)

---

## Next Steps

1. Review this plan with team
2. Verify FMP API access to sentiment endpoints
3. Begin Phase 1 implementation
4. Test incrementally (tool → workflow → command)
5. Deploy to Railway after full testing

---

**END OF PLAN**
