/**
 * ContextLinker: Automatically discovers parent bullet and heading linked notes
 * and reconciles them onto child task lines.
 */

const TASK_REGEX = /^(\s*[-*+]\s*\[)(.)(\]\s*)(.*)$/;
const BULLET_REGEX = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;
const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;
const HORIZONTAL_RULE_REGEX = /^---+\s*$/;
const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const LEGACY_COMMENT_REGEX = /<!--\s*linked-note-tags:.*?-->/g;
const TRAILING_META_REGEX = /((?:\s*(?:[📅⏳🛫✅➕]\s*\d{4}-\d{2}-\d{2}|[⏫🔺🔼🔽⏬]|#eisen\/[a-zA-Z0-9_-]+|#role\/[a-zA-Z0-9_-]+))+)\s*$/u;

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

export interface ParentContext {
  link: string | null;
  type: 'bullet' | 'heading' | 'none';
}

export interface ReconcileResult {
  content: string;
  changesCount: number;
}

/**
 * Calculates visual indentation width where tabs count as 4 spaces.
 */
export function getIndentLevel(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === ' ') {
      count += 1;
    } else if (ch === '\t') {
      count += 4;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Extracts all wikilink note targets from a string.
 */
export function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  const regex = new RegExp(WIKILINK_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const target = match[1]?.trim();
    if (target && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}

/**
 * Prioritizes project/role links over generic notes if multiple links exist.
 */
export function pickBestLink(links: string[]): string {
  if (links.length === 0) return '';
  if (links.length === 1) return links[0];

  for (const link of links) {
    const lower = link.toLowerCase();
    if (
      lower.startsWith('roles/') ||
      lower.startsWith('projects/') ||
      lower === 'yo manager' ||
      lower === 'josef self-care' ||
      lower === 'rj supportive' ||
      lower.includes('project') ||
      lower.includes('role')
    ) {
      return link;
    }
  }

  return links[0];
}

/**
 * Searches upward from taskIndex to find the enclosing parent bullet wikilink,
 * or falls back to the nearest enclosing markdown heading wikilink.
 */
export function findParentContext(lines: string[], taskIndex: number): ParentContext {
  if (taskIndex < 0 || taskIndex >= lines.length) {
    return { link: null, type: 'none' };
  }

  const taskLine = lines[taskIndex];
  const taskIndent = getIndentLevel(taskLine);

  let minIndentSeen = taskIndent;
  let foundBulletLink: string | null = null;

  // 1. Search upward for parent bullet hierarchy
  for (let i = taskIndex - 1; i >= 0; i--) {
    const line = lines[i];

    // Horizontal rule separates sections in Daily Jots
    if (HORIZONTAL_RULE_REGEX.test(line.trim())) {
      break;
    }

    // Markdown heading terminates bullet outline
    if (HEADING_REGEX.test(line)) {
      break;
    }

    const bulletMatch = line.match(BULLET_REGEX);
    if (bulletMatch) {
      const bulletIndent = getIndentLevel(line);
      if (bulletIndent < minIndentSeen) {
        minIndentSeen = bulletIndent;
        const bulletContent = bulletMatch[2];
        const links = extractWikilinks(bulletContent);
        if (links.length > 0) {
          foundBulletLink = pickBestLink(links);
          break;
        }
        if (minIndentSeen === 0) {
          // Reached root bullet level without links
          break;
        }
      }
    }
  }

  if (foundBulletLink) {
    return { link: foundBulletLink, type: 'bullet' };
  }

  // 2. Fallback: Search upward for nearest markdown heading with a wikilink
  for (let i = taskIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      const headingContent = headingMatch[2];
      const links = extractWikilinks(headingContent);
      if (links.length > 0) {
        return { link: pickBestLink(links), type: 'heading' };
      }
    }
  }

  return { link: null, type: 'none' };
}

/**
 * Checks if the task line already contains the target link.
 */
export function hasExactLink(line: string, linkTarget: string): boolean {
  const cleanTarget = linkTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\[\\[${cleanTarget}(?:#[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]`, 'i');
  return regex.test(line);
}

/**
 * Injects contextLink into a task line cleanly, placing it before trailing dates/priority
 * and stripping any legacy comment tags.
 */
export function injectContextLink(line: string, contextLink: string): string {
  // Strip legacy comment tags
  let cleaned = line.replace(LEGACY_COMMENT_REGEX, '');
  const indentMatch = cleaned.match(/^(\s*)/);
  const indent = indentMatch ? indentMatch[1] : '';
  const body = cleaned.slice(indent.length).replace(/[ \t]{2,}/g, ' ').trimEnd();
  cleaned = indent + body;

  const formattedLink = `[[${contextLink}]]`;

  if (hasExactLink(cleaned, contextLink)) {
    return cleaned;
  }

  // Match trailing metadata (dates, priorities, role/eisen tags)
  const metaMatch = cleaned.match(TRAILING_META_REGEX);
  if (metaMatch && metaMatch.index !== undefined) {
    const beforeMeta = cleaned.slice(0, metaMatch.index).trimEnd();
    const metaPart = metaMatch[1].replace(/[ \t]{2,}/g, ' ');
    return `${beforeMeta} ${formattedLink} ${metaPart.trimStart()}`;
  }

  return `${cleaned} ${formattedLink}`;
}

/**
 * Parses date from daily jot file path.
 * Supports:
 * - Jots/2026/Sep/Sep 14 2026.md
 * - Jots/2026-09-14.md
 * - Jots/20260914.md
 */
export function extractDateFromPath(filePath: string): Date | null {
  const norm = filePath.replace(/\\/g, '/');

  // Pattern 1: MMM DD YYYY (e.g. Sep 14 2026.md or Sep 01 2026.md)
  const mmmMatch = norm.match(/(?:^|\/)([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})\.md$/i);
  if (mmmMatch) {
    const monthStr = mmmMatch[1].toLowerCase();
    const month = MONTH_MAP[monthStr];
    const day = parseInt(mmmMatch[2], 10);
    const year = parseInt(mmmMatch[3], 10);
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  // Pattern 2: YYYY-MM-DD
  const isoMatch = norm.match(/(?:^|\/)(\d{4})-(\d{2})-(\d{2})(?:\.md)?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day);
  }

  // Pattern 3: YYYYMMDD
  const compactMatch = norm.match(/(?:^|\/)(\d{4})(\d{2})(\d{2})(?:\.md)?$/);
  if (compactMatch) {
    const year = parseInt(compactMatch[1], 10);
    const month = parseInt(compactMatch[2], 10) - 1;
    const day = parseInt(compactMatch[3], 10);
    return new Date(year, month, day);
  }

  return null;
}

/**
 * Determines whether a file path falls within the active rolling window (e.g. 24 hours / today & yesterday).
 * If the file is not a daily note (no date in filename), returns true if allowNonDaily is true.
 */
export function isWithinActiveWindow(
  filePath: string,
  activeHours: number = 24,
  now: Date = new Date(),
  allowNonDaily: boolean = false
): boolean {
  const fileDate = extractDateFromPath(filePath);
  if (!fileDate) {
    return allowNonDaily;
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const fileDay = new Date(fileDate.getFullYear(), fileDate.getMonth(), fileDate.getDate()).getTime();

  // Difference in calendar days
  const diffDays = Math.round((today - fileDay) / (1000 * 60 * 60 * 24));

  const maxAllowedDays = Math.max(1, Math.ceil(activeHours / 24));

  // Allow today (0), yesterday (1), and tomorrow (-1 in case of early planning notes)
  return diffDays >= -1 && diffDays <= maxAllowedDays;
}

/**
 * Reconciles an entire note's content by discovering parent context for active tasks
 * and updating the lines accordingly.
 */
export function reconcileNoteContent(content: string): ReconcileResult {
  const isCrlf = content.includes('\r\n');
  const lines = content.split(/\r?\n/);
  let changesCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const taskMatch = line.match(TASK_REGEX);
    if (!taskMatch) continue;

    const statusChar = taskMatch[2];
    // Only reconcile active/incomplete tasks
    if (statusChar.toLowerCase() === 'x') continue;

    const context = findParentContext(lines, i);
    if (!context.link) {
      // If no context link, still clean legacy comments if present
      if (LEGACY_COMMENT_REGEX.test(line)) {
        const cleaned = line.replace(LEGACY_COMMENT_REGEX, '').trimEnd();
        if (cleaned !== line) {
          lines[i] = cleaned;
          changesCount++;
        }
      }
      continue;
    }

    const updated = injectContextLink(line, context.link);
    if (updated !== line) {
      lines[i] = updated;
      changesCount++;
    }
  }

  return {
    content: lines.join(isCrlf ? '\r\n' : '\n'),
    changesCount
  };
}