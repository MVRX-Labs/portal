export interface GTMStrategyContent {
  companyName: string;
  industry: string;
  targetAudience: string;
  preparedDate: string;
  preparedFor: string;

  situationOverview: SituationOverview;
  presenceAudit: PresenceAudit;
  competitiveLandscape: CompetitiveLandscape;
  channelStrategyOverview: ChannelStrategyOverview;
  channelDetails: ChannelDetail[];
  executionRoadmap: ExecutionRoadmap;
  successMetrics: SuccessMetrics;
  nextSteps: NextSteps;
}

export interface SituationOverview {
  summaryIntro: string;
  summaryPoints: string[];
  whatsWorking: string[];
  theChallenge: string[];
  keyObservation: string;
  strategicPriorities: string[];
}

export interface PresenceAudit {
  websiteScore: number;
  websiteAssessment: string;
  seoScore: number;
  seoAssessment: string;
  socialMediaScore: number;
  socialMediaAssessment: string;
  overallAssessment: string[];
}

export interface CompetitorEntry {
  name: string;
  positioning: string;
  strengths: string[];
  weaknesses: string[];
  keyTakeaway: string;
}

export interface CompetitiveLandscape {
  competitors: CompetitorEntry[];
  strategicPosition: string[];
  positioningTakeaways: string[];
}

export interface RecommendedChannel {
  name: string;
  fitScore: number;
  rationale: string;
}

export interface ChannelStrategyOverview {
  recommendedChannels: RecommendedChannel[];
  whyNotOtherChannels: string[];
  howChannelsWorkTogether: string[];
}

export interface WeekPlan {
  week: string;
  actions: string[];
}

export interface ChannelDetail {
  channelName: string;
  investment: string;
  timeToResults: string;
  keyMetric: string;
  strategicRationale: string[];
  keyTactics: string[];
  twelveWeekPlan: WeekPlan[];
}

export interface RoadmapMonth {
  month: string;
  theme: string;
  actions: string[];
  checkpoint: string;
}

export interface ExecutionRoadmap {
  months: RoadmapMonth[];
}

export interface GrowthTarget {
  metric: string;
  current: string;
  day30: string;
  day60: string;
  day90: string;
}

export interface SuccessMetrics {
  growthTargets: GrowthTarget[];
  trackingNotes: string[];
}

export interface NextSteps {
  immediateActions: string[];
  ctaParagraph: string;
  mvrxValueProp: string;
}
