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
var enums_exports = {};
__export(enums_exports, {
  AnalysisStatus: () => AnalysisStatus,
  DEFAULT_MAX_THINKING_TOKENS: () => DEFAULT_MAX_THINKING_TOKENS,
  DEFAULT_MAX_TURNS: () => DEFAULT_MAX_TURNS,
  DEFAULT_MODEL: () => DEFAULT_MODEL,
  FRAMEWORK_VERSION: () => FRAMEWORK_VERSION,
  FinancialDataType: () => FinancialDataType,
  FinancialDataTypeLabel: () => FinancialDataTypeLabel,
  MCPToolName: () => MCPToolName,
  MCP_TOOL_PREFIX: () => MCP_TOOL_PREFIX,
  PeriodType: () => PeriodType,
  ReportType: () => ReportType,
  ReportTypeLabel: () => ReportTypeLabel,
  StreamEventType: () => StreamEventType,
  TelegramLimits: () => TelegramLimits,
  TimeConstants: () => TimeConstants,
  ToolName: () => ToolName,
  createEventName: () => createEventName,
  isToolName: () => isToolName
});
module.exports = __toCommonJS(enums_exports);
var ToolName = /* @__PURE__ */ ((ToolName2) => {
  ToolName2["FETCH_COMPANY_DATA"] = "fetch_company_data";
  ToolName2["CALCULATE_DCF"] = "calculate_dcf";
  ToolName2["GENERATE_PDF"] = "generate_pdf";
  ToolName2["TEST_API_CONNECTION"] = "test_api_connection";
  return ToolName2;
})(ToolName || {});
const MCP_TOOL_PREFIX = "mcp__stock-analyzer__";
const MCPToolName = {
  FETCH_COMPANY_DATA: `${MCP_TOOL_PREFIX}${"fetch_company_data" /* FETCH_COMPANY_DATA */}`,
  CALCULATE_DCF: `${MCP_TOOL_PREFIX}${"calculate_dcf" /* CALCULATE_DCF */}`,
  GENERATE_PDF: `${MCP_TOOL_PREFIX}${"generate_pdf" /* GENERATE_PDF */}`,
  TEST_API_CONNECTION: `${MCP_TOOL_PREFIX}${"test_api_connection" /* TEST_API_CONNECTION */}`
};
var FinancialDataType = /* @__PURE__ */ ((FinancialDataType2) => {
  FinancialDataType2["PROFILE"] = "profile";
  FinancialDataType2["QUOTE"] = "quote";
  FinancialDataType2["INCOME_STATEMENT"] = "income-statement";
  FinancialDataType2["BALANCE_SHEET"] = "balance-sheet";
  FinancialDataType2["CASH_FLOW"] = "cash-flow";
  FinancialDataType2["KEY_METRICS"] = "key-metrics";
  FinancialDataType2["RATIOS"] = "ratios";
  return FinancialDataType2;
})(FinancialDataType || {});
const FinancialDataTypeLabel = {
  ["profile" /* PROFILE */]: "Company profile",
  ["quote" /* QUOTE */]: "Current quote",
  ["income-statement" /* INCOME_STATEMENT */]: "Income statements",
  ["balance-sheet" /* BALANCE_SHEET */]: "Balance sheets",
  ["cash-flow" /* CASH_FLOW */]: "Cash flow statements",
  ["key-metrics" /* KEY_METRICS */]: "Key metrics",
  ["ratios" /* RATIOS */]: "Financial ratios"
};
var ReportType = /* @__PURE__ */ ((ReportType2) => {
  ReportType2["FULL"] = "full";
  ReportType2["SUMMARY"] = "summary";
  return ReportType2;
})(ReportType || {});
const ReportTypeLabel = {
  ["full" /* FULL */]: "Full Analysis",
  ["summary" /* SUMMARY */]: "Executive Summary"
};
var PeriodType = /* @__PURE__ */ ((PeriodType2) => {
  PeriodType2["QUARTERLY"] = "quarterly";
  PeriodType2["ANNUAL"] = "annual";
  return PeriodType2;
})(PeriodType || {});
var StreamEventType = /* @__PURE__ */ ((StreamEventType2) => {
  StreamEventType2["CONNECTED"] = "connected";
  StreamEventType2["CHUNK"] = "chunk";
  StreamEventType2["THINKING"] = "thinking";
  StreamEventType2["TOOL"] = "tool";
  StreamEventType2["TOOL_RESULT"] = "tool_result";
  StreamEventType2["PDF"] = "pdf";
  StreamEventType2["COMPLETE"] = "complete";
  StreamEventType2["ERROR"] = "error";
  return StreamEventType2;
})(StreamEventType || {});
var AnalysisStatus = /* @__PURE__ */ ((AnalysisStatus2) => {
  AnalysisStatus2["PROCESSING"] = "processing";
  AnalysisStatus2["COMPLETE"] = "complete";
  AnalysisStatus2["ERROR"] = "error";
  return AnalysisStatus2;
})(AnalysisStatus || {});
const FRAMEWORK_VERSION = "v2.3";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TURNS = 20;
const DEFAULT_MAX_THINKING_TOKENS = 1e4;
const TimeConstants = {
  STREAM_UPDATE_INTERVAL: 500,
  // Update Telegram message every 500ms
  STREAM_CHUNK_THRESHOLD: 5,
  // Or every 5 chunks
  INTERVENTION_CHECK_INTERVAL: 15e3,
  // Check for interventions every 15s
  INTERVENTION_MIN_GAP: 15e3,
  // Minimum 15s between interventions
  INTERVENTION_30S: 3e4,
  // First intervention at 30s
  INTERVENTION_60S: 6e4,
  // Second intervention at 60s
  INTERVENTION_90S: 9e4,
  // Third intervention at 90s
  STREAM_TIMEOUT: 3e5
  // 5 minute timeout
};
const TelegramLimits = {
  MAX_MESSAGE_LENGTH: 4096,
  SAFE_MESSAGE_LENGTH: 4e3,
  TRUNCATED_MESSAGE_LENGTH: 3800
};
const createEventName = (type, sessionId) => {
  return `analysis.${type}.${sessionId}`;
};
const isToolName = (actual, expected) => {
  return actual === expected || actual === `${MCP_TOOL_PREFIX}${expected}`;
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnalysisStatus,
  DEFAULT_MAX_THINKING_TOKENS,
  DEFAULT_MAX_TURNS,
  DEFAULT_MODEL,
  FRAMEWORK_VERSION,
  FinancialDataType,
  FinancialDataTypeLabel,
  MCPToolName,
  MCP_TOOL_PREFIX,
  PeriodType,
  ReportType,
  ReportTypeLabel,
  StreamEventType,
  TelegramLimits,
  TimeConstants,
  ToolName,
  createEventName,
  isToolName
});
