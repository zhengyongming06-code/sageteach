import { SUBJECTS, type Subject } from "@/lib/subjects";
import { SUBJECT_KNOWLEDGE_BY_GRADE, type GradeBand } from "@/lib/knowledge-points";
import { buildAllCatalogEntries } from "@/lib/knowledge-topics/catalog-seeds";
import type { KnowledgeTopicEntry } from "@/lib/knowledge-topics/topic-types";

export type {
  KnowledgeTopicEntry,
  KnowledgeTopicQuestion,
  KnowledgeTopicSection,
  KnowledgeTopicVideo,
} from "@/lib/knowledge-topics/topic-types";

const ENTRIES = buildAllCatalogEntries();

const byKey = new Map<string, KnowledgeTopicEntry>();
for (const e of ENTRIES) {
  byKey.set(topicKey(e.subject, e.name), e);
}

export function topicKey(subject: string, name: string) {
  return `${subject}\0${name}`;
}

export function getKnowledgeTopicEntry(
  subject: string,
  name: string,
): KnowledgeTopicEntry | null {
  return byKey.get(topicKey(subject, name)) ?? null;
}

export function getKnowledgeTopicBySlug(slug: string): KnowledgeTopicEntry | null {
  return ENTRIES.find((e) => e.slug === slug) ?? null;
}

export function listPublishedTopicEntries(): KnowledgeTopicEntry[] {
  return [...ENTRIES];
}

export function listCatalogTopicNames(subject: Subject): string[] {
  const bands = SUBJECT_KNOWLEDGE_BY_GRADE[subject];
  const out: string[] = [];
  for (const band of Object.keys(bands) as GradeBand[]) {
    for (const n of bands[band] ?? []) {
      if (!out.includes(n)) out.push(n);
    }
  }
  return out;
}

export function listTopicsForSubject(subject: Subject): {
  name: string;
  hasContent: boolean;
  slug?: string;
}[] {
  return listCatalogTopicNames(subject).map((name) => {
    const entry = getKnowledgeTopicEntry(subject, name);
    return {
      name,
      hasContent: !!entry,
      slug: entry?.slug,
    };
  });
}

export function isValidLearnSubject(value: string | undefined): value is Subject {
  return !!value && (SUBJECTS as readonly string[]).includes(value);
}

export function resolveLearnTopic(subject: Subject, topic?: string) {
  if (!topic) return null;
  const entry = getKnowledgeTopicEntry(subject, topic);
  if (entry) return entry;
  const bySlug = getKnowledgeTopicBySlug(topic);
  if (bySlug && bySlug.subject === subject) return bySlug;
  return null;
}
