/** Stored in coach_messages.content when the user message is image-only. */
export const SAGE_PHOTO_MESSAGE_MARKER = "__sage_photo_v1__";

const STORAGE_PREFIX = "sage-review-photo:";

function storageKey(sessionSlug: string, messageId: string) {
  return `${STORAGE_PREFIX}${sessionSlug}:${messageId}`;
}

export function isPhotoOnlyMessageContent(content: string): boolean {
  return content.trim() === SAGE_PHOTO_MESSAGE_MARKER;
}

export function savePhotoMessageImage(
  sessionSlug: string,
  messageId: string,
  dataUrl: string,
): void {
  try {
    sessionStorage.setItem(storageKey(sessionSlug, messageId), dataUrl);
  } catch (e) {
    console.warn("[review-photo] sessionStorage save failed", e);
  }
}

export function loadPhotoMessageImage(
  sessionSlug: string,
  messageId: string,
): string | null {
  try {
    return sessionStorage.getItem(storageKey(sessionSlug, messageId));
  } catch {
    return null;
  }
}
