export interface LinkedInAuditContent {
  personName: string;
  personTitle: string;
  linkedinSlug: string;
  preparedDate: string;
  executiveSummary: string[];
  overallScore: number;
  scorecard: ScorecardEntry[];
  sections: AuditSection[];
}

export interface ScorecardEntry {
  category: string;
  score: number;
  commentary: string;
}

export interface AuditSection {
  title: string;
  subsections?: AuditSubsection[];
  content?: ContentBlock[];
}

export interface AuditSubsection {
  title: string;
  content: ContentBlock[];
}

export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "labeled"; label: string; text: string }
  | { type: "bulletList"; items: BulletItem[] }
  | { type: "numberedList"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

export interface BulletItem {
  label?: string;
  text: string;
}

export interface TwitterAuditContent {
  personName: string;
  personTitle: string;
  twitterHandle: string;
  preparedDate: string;
  executiveSummary: string[];
  overallScore: number;
  scorecard: ScorecardEntry[];
  sections: AuditSection[];
}
