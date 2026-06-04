export type AnalyticsStreakBucket = {
  days: number;
  users: number;
};

export type AnalyticsDauPoint = {
  date: string;
  dau: number;
};

export type ProductAnalyticsDashboard = {
  range: { from: string; to: string; days: number };
  dau: number;
  wau: number;
  avg_streak_days: number;
  max_streak_days: number;
  streak_distribution: AnalyticsStreakBucket[];
  review_completion_rate: number;
  review_started: number;
  review_completed: number;
  photo_count: number;
  daily_training_completion_rate: number;
  daily_training_total: number;
  daily_training_done: number;
  retention_d1: number;
  retention_d7: number;
  dau_series: AnalyticsDauPoint[];
};
