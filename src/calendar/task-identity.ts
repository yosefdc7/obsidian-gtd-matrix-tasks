import { extractTaskUuid } from './sync-core';

const JSON_COMMENT_RE = /<!--\s*(\{.*?\})\s*-->/;

export interface HiddenTaskUuidResult {
  line: string;
  uuid: string;
  changed: boolean;
}

export function ensureHiddenTaskUuid(
  line: string,
  createUuid: () => string = () => crypto.randomUUID(),
): HiddenTaskUuidResult {
  const existing = extractTaskUuid(line);
  if (existing) return { line, uuid: existing, changed: false };

  const uuid = createUuid().toLowerCase();
  const comment = line.match(JSON_COMMENT_RE);
  if (comment) {
    try {
      const metadata = JSON.parse(comment[1]) as Record<string, unknown>;
      metadata.uuid = uuid;
      return {
        line: line.replace(comment[0], `<!-- ${JSON.stringify(metadata)} -->`),
        uuid,
        changed: true,
      };
    } catch {
      // Preserve malformed or non-JSON comments and append a valid identity comment.
    }
  }

  return {
    line: `${line.trimEnd()} <!-- ${JSON.stringify({ uuid })} -->`,
    uuid,
    changed: true,
  };
}
