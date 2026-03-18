import { z } from "zod";
import { dateString } from "./common";

// ---------------------------------------------------------------------------
// Risk signal schemas
// ---------------------------------------------------------------------------

export const riskSeveritySchema = z.enum(["high", "medium", "low"]);
export type RiskSeverity = z.infer<typeof riskSeveritySchema>;

export const riskSignalSchema = z.object({
  type: z.enum(["calendar", "knowledge", "linkedin", "action"]),
  severity: riskSeveritySchema,
  message: z.string(),
  data: z.record(z.unknown()),
});
export type RiskSignal = z.infer<typeof riskSignalSchema>;

export const overallRiskSchema = z.enum(["high", "medium", "low", "healthy"]);
export type OverallRisk = z.infer<typeof overallRiskSchema>;

export const accountRiskProfileSchema = z.object({
  accountId: z.string(),
  accountName: z.string(),
  mrr: z.number(),
  mrrCurrency: z.string(),
  signals: z.array(riskSignalSchema),
  overallRisk: overallRiskSchema,
});
export type AccountRiskProfile = z.infer<typeof accountRiskProfileSchema>;

// ---------------------------------------------------------------------------
// API request / response schemas
// ---------------------------------------------------------------------------

// POST /api/tools/risk-alerts
export const riskAlertsBodySchema = z.object({
  accountId: z.string().optional(),
});
export type RiskAlertsBody = z.infer<typeof riskAlertsBodySchema>;

export const riskAlertsResponseSchema = z.object({
  profiles: z.array(accountRiskProfileSchema),
  evaluatedAt: dateString,
});
export type RiskAlertsResponse = z.infer<typeof riskAlertsResponseSchema>;
