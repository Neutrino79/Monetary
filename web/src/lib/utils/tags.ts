/** Mirrors the server's tag rules for feedback while typing; the server stays the authority. */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export function normaliseTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}
