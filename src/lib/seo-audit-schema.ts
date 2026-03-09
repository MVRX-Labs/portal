export interface SEOAuditContent {
  websiteUrl: string;
  preparedDate: string;

  overallScore: {
    score: number;
    grade: string;
    summary: string;
    pagesAudited: number;
  };

  categoryBreakdown: Array<{
    category: string;
    score: number;
    weight: string;
    passCount: number;
    warnCount: number;
    failCount: number;
    topIssue?: string;
  }>;

  criticalIssues: Array<{
    severity: "fail" | "warn";
    category: string;
    rule: string;
    description: string;
    affectedUrls: string[];
    fixRecommendation: string;
  }>;

  strengthsAndWins: string[];

  prioritizedActionPlan: Array<{
    priority: number;
    category: string;
    action: string;
    expectedImpact: string;
    effort: "low" | "medium" | "high";
  }>;

  nextSteps: {
    immediateActions: string[];
    shortTermActions: string[];
    longTermActions: string[];
    ctaParagraph: string;
    mvrxValueProp: string;
  };
}
