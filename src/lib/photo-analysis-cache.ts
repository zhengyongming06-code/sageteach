const CACHE_KEY = "sage_photo_analysis_v2";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 40;

type CacheEntry = {
  hash: string;
  markdown: string;
  at: number;
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeDataUrl(url: string): string {
  const comma = url.indexOf(",");
  return comma >= 0 ? url.slice(comma + 1) : url;
}

export async function hashPhotoAnalysisInput(
  imageDataUrls: string[],
  userHint: string,
): Promise<string> {
  const payload = [
    ...imageDataUrls.map(normalizeDataUrl),
    userHint.trim(),
  ].join("\n---\n");
  return sha256Hex(payload);
}

function readEntries(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CacheEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: CacheEntry[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    /* quota or private mode */
  }
}

export function getCachedPhotoAnalysis(hash: string): string | null {
  const now = Date.now();
  const entries = readEntries().filter((e) => now - e.at <= TTL_MS);
  writeEntries(entries);
  const hit = entries.find((e) => e.hash === hash);
  return hit?.markdown ?? null;
}

export function setCachedPhotoAnalysis(hash: string, markdown: string) {
  const now = Date.now();
  const kept = readEntries().filter((e) => now - e.at <= TTL_MS && e.hash !== hash);
  kept.unshift({ hash, markdown, at: now });
  writeEntries(kept);
}
