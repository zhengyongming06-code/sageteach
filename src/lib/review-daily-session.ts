import { createSafeStorage, type SafeStorageAdapter } from "@/lib/safe-storage";

const STORAGE_KEY = "sage:review-daily-session-v1";

export type ReviewDailySession = {
  ymd: string;
  slug: string;
};

type ReviewDailySessionMap = Record<string, ReviewDailySession>;

const defaultStore = createSafeStorage(
  typeof localStorage !== "undefined" ? localStorage : undefined,
);

function readMap(store: SafeStorageAdapter): ReviewDailySessionMap {
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ReviewDailySessionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(store: SafeStorageAdapter, map: ReviewDailySessionMap) {
  store.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getReviewDailySession(
  subject: string,
  todayYmd: string,
  store: SafeStorageAdapter = defaultStore,
): string | null {
  const entry = readMap(store)[subject];
  if (!entry || entry.ymd !== todayYmd) return null;
  return entry.slug;
}

export function setReviewDailySession(
  subject: string,
  todayYmd: string,
  slug: string,
  store: SafeStorageAdapter = defaultStore,
) {
  const map = readMap(store);
  map[subject] = { ymd: todayYmd, slug };
  writeMap(store, map);
}

export function clearReviewDailySession(
  subject: string,
  store: SafeStorageAdapter = defaultStore,
) {
  const map = readMap(store);
  delete map[subject];
  writeMap(store, map);
}
