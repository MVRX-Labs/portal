export type MetricStatus = "good" | "warning" | "bad" | "info";

export interface ScoreCategory {
  score: number;
  findings: string[];
  recommendations: string[];
}

export interface CriticalIssue {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
}

export interface ActionWeek {
  week: number;
  theme: string;
  actions: string[];
}

export interface GeoAuditContent {
  brandName: string;
  url: string;
  date: string;
  geoScore: number;

  scores: {
    citability: ScoreCategory;
    brandAuthority: ScoreCategory;
    contentEeat: ScoreCategory;
    technical: ScoreCategory;
    schema: ScoreCategory;
    platformOptimization: ScoreCategory;
  };

  executiveSummary: {
    overview: string;
    keyFindings: string[];
  };
  criticalIssues: CriticalIssue[];
  quickWins: string[];
  actionPlan: ActionWeek[];
}

export function scoreStatus(score: number): MetricStatus {
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "bad";
}
