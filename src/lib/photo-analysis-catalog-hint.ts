import {
  getKnowledgeTopicEntry,
  listPublishedTopicEntries,
} from "@/lib/knowledge-topics/catalog";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/topic-types";
import type { PhotoRecognition } from "@/lib/photo-analysis-recognition";

const METHOD_KEYWORDS = [
  "弦长",
  "椭圆",
  "双曲线",
  "抛物线",
  "圆锥曲线",
  "导数",
  "联立",
  "韦达",
  "离心率",
  "单调",
  "恒成立",
  "洛伦兹",
  "平衡",
  "遗传",
  "立意",
  "长难句",
];

function scoreEntry(
  entry: KnowledgeTopicEntry,
  recognition: PhotoRecognition,
): number {
  let score = 0;
  if (entry.subject !== recognition.subject) return 0;

  for (const kp of recognition.knowledge_points) {
    if (entry.name === kp) score += 20;
    else if (entry.name.includes(kp) || kp.includes(entry.name)) score += 10;
    if (entry.relatedNames.some((r) => r === kp || r.includes(kp) || kp.includes(r))) {
      score += 8;
    }
  }

  const type = recognition.question_type;
  if (type) {
    if (entry.name.includes(type) || type.includes(entry.name)) score += 6;
    if (entry.summary.includes(type)) score += 4;
  }

  for (const kw of METHOD_KEYWORDS) {
    if (!type.includes(kw) && !recognition.question_summary.includes(kw)) continue;
    if (entry.name.includes(kw) || entry.summary.includes(kw)) score += 5;
    for (const section of entry.sections) {
      if (section.title.includes(kw) || section.body.includes(kw)) score += 3;
    }
  }

  if (entry.sections.length >= 2) score += 2;
  return score;
}

function formatCatalogHint(entry: KnowledgeTopicEntry): string {
  const lines = [
    `【题库命中】${entry.subject} · ${entry.name}`,
    entry.summary,
    ...entry.sections.map((s) => `- ${s.title}：${s.body}`),
  ];
  return lines.join("\n");
}

/** P3: Prefer curated catalog method paths when recognition matches a topic. */
export function buildCatalogMethodHint(recognition: PhotoRecognition): string | null {
  let best: { entry: KnowledgeTopicEntry; score: number } | null = null;

  for (const kp of recognition.knowledge_points) {
    const direct = getKnowledgeTopicEntry(recognition.subject, kp);
    if (direct?.sections.length) {
      const score = 25 + direct.sections.length;
      if (!best || score > best.score) best = { entry: direct, score };
    }
  }

  for (const entry of listPublishedTopicEntries()) {
    const score = scoreEntry(entry, recognition);
    if (score >= 8 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  if (!best) return null;
  return formatCatalogHint(best.entry);
}
