import type { Subject } from "@/lib/subjects";
import type { GradeBand } from "@/lib/knowledge-points";

export type KnowledgeTopicVideo = {
  id: string;
  title: string;
  teacher: string;
  platform: "bilibili";
  url: string;
  duration?: string;
  note?: string;
};

export type KnowledgeTopicQuestion = {
  id: string;
  stem: string;
  source: string;
  difficulty?: 1 | 2 | 3;
  answerHint?: string;
};

export type KnowledgeTopicSection = {
  id: string;
  title: string;
  body: string;
};

export type KnowledgeTopicEntry = {
  subject: Subject;
  name: string;
  slug: string;
  gradeBand: GradeBand;
  eyebrow: string;
  summary: string;
  sections: KnowledgeTopicSection[];
  videos: KnowledgeTopicVideo[];
  practiceQuestions: KnowledgeTopicQuestion[];
  relatedNames: string[];
};
