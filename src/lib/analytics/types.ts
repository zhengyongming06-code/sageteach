export type AnalyticsDauPoint = {
  date: string;
  dau: number;
};

export type AnalyticsFunnelStep = {
  key: string;
  label: string;
  users: number;
  rate_from_previous: number | null;
};

export type AnalyticsRankedItem = {
  label: string;
  subject?: string;
  count: number;
};

export type AnalyticsAiQuality = {
  photo_analysis_success_rate: number;
  photo_analysis_attempts: number;
  photo_analysis_successes: number;
  ai_output_anomaly_rate: number;
  ai_output_anomalies: number;
  knowledge_extraction_success_rate: number;
  knowledge_extraction_attempts: number;
  knowledge_extraction_successes: number;
};

export type AnalyticsFeedback = {
  top_weak_points: AnalyticsRankedItem[];
  top_mistake_patterns: AnalyticsRankedItem[];
  top_training_tasks: AnalyticsRankedItem[];
};

export type ProductAnalyticsDashboard = {
  range: { from: string; to: string; days: number };
  dau: number;
  wau: number;
  review_completion_rate: number;
  review_started: number;
  review_completed: number;
  photo_count: number;
  daily_training_completion_rate: number;
  daily_training_total: number;
  daily_training_done: number;
  dau_series: AnalyticsDauPoint[];
  funnel: AnalyticsFunnelStep[];
  ai_quality: AnalyticsAiQuality;
  feedback: AnalyticsFeedback;
  /** True when Supabase still runs the pre-validation RPC shape. */
  needs_validation_migration?: boolean;
};
