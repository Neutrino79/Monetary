/** Mirrors the server's tag rules for typing feedback; the server stays the authority. */
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export function normaliseTag(raw: string): string {
  return raw.trim().replace(/^#+/, "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/** Add one typed tag to a list: ignores blanks, commas, duplicates and anything past the limits. */
export function addTag(tags: string[], raw: string): string[] {
  const name = normaliseTag(raw.replace(/,/g, " "));
  if (!name || name.length > MAX_TAG_LENGTH || tags.includes(name) || tags.length >= MAX_TAGS) return tags;
  return [...tags, name];
}
