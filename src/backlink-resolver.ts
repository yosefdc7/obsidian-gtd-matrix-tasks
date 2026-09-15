import type { App, TFile, ReferenceCache } from 'obsidian';

export interface BacklinkMentionResult {
  hasBacklinks: boolean;
  sourceFile?: TFile;
  sourceTitle?: string;
  lineText?: string;
  cleanedText?: string;
  timestamp?: number;
  dateStr?: string;
}

export interface BacklinkCandidate {
  file: TFile;
  reference: ReferenceCache;
  timestamp: number;
  explicitDate?: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

/**
 * Parse a calendar date from a file path or title.
 * Supports MMM DD YYYY, YYYY-MM-DD, DD MMM YYYY, and Jots/YYYY/MMM/DD.md
 */
export function parseDateFromPath(filePath: string): Date | null {
  if (!filePath) return null;
  const fileName = filePath.split('/').pop() || '';
  const baseName = fileName.replace(/\.md$/i, '').trim();

  // 1. MMM DD YYYY: e.g. Sep 14 2026, Apr 10 2024
  const mmmMatch = baseName.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (mmmMatch) {
    const month = MONTH_MAP[mmmMatch[1].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(mmmMatch[2], 10);
      const year = parseInt(mmmMatch[3], 10);
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // 2. ISO format: YYYY-MM-DD
  const isoMatch = baseName.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  // 3. DD MMM YYYY: e.g. 14 Sep 2026
  const ddMmmMatch = baseName.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (ddMmmMatch) {
    const month = MONTH_MAP[ddMmmMatch[2].toLowerCase()];
    if (month !== undefined) {
      const day = parseInt(ddMmmMatch[1], 10);
      const year = parseInt(ddMmmMatch[3], 10);
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  // 4. Jots/YYYY/MMM/DD.md (legacy format)
  const legacyJotMatch = filePath.match(/Jots\/(\d{4})\/([A-Za-z]{3})\/(\d{1,2})\.md$/i);
  if (legacyJotMatch) {
    const year = parseInt(legacyJotMatch[1], 10);
    const month = MONTH_MAP[legacyJotMatch[2].toLowerCase()];
    const day = parseInt(legacyJotMatch[3], 10);
    if (month !== undefined) {
      return new Date(year, month, day, 12, 0, 0);
    }
  }

  return null;
}

/**
 * Extracts explicit task date (✅, ⏳, 📅, 🛫) from a line of text if present.
 */
export function extractExplicitDateFromLine(line: string): string | null {
  if (!line) return null;
  const match = line.match(/[✅⏳📅🛫]\s*(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Strips leading markdown list markers, checkboxes, and excess whitespace.
 * e.g. "- [ ] [[Note]] some text" -> "[[Note]] some text"
 */
export function cleanMentionLine(line: string, maxChars: number = 200): string {
  if (!line) return '';
  let cleaned = line
    .replace(/^\s*[-*+]\s+\[[ xX\?\>\<\!\-\/]\]\s*/, '') // Task checkbox
    .replace(/^\s*[-*+]\s+/, '')                           // Bullet point
    .replace(/^\s*\d+\.\s+/, '')                           // Numbered list
    .replace(/^\s*#+\s+/, '')                              // Heading markers
    .replace(/\s+/g, ' ')                                  // Multi-space normalization
    .trim();

  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars).trim() + '…';
  }

  return cleaned;
}

/**
 * Calculates a chronological ranking score (timestamp in ms) for a mention in a source note.
 */
export function computeMentionScore(
  filePath: string,
  lineText: string,
  mtime: number = 0
): { score: number; explicitDate?: string } {
  // 1. Task line with explicit date takes top priority
  const explicit = extractExplicitDateFromLine(lineText);
  if (explicit) {
    const d = new Date(`${explicit}T12:00:00Z`);
    if (!isNaN(d.getTime())) {
      return { score: d.getTime(), explicitDate: explicit };
    }
  }

  // 2. Daily note date parsed from file path or title
  const dateFromPath = parseDateFromPath(filePath);
  if (dateFromPath && !isNaN(dateFromPath.getTime())) {
    return { score: dateFromPath.getTime() };
  }

  // 3. Fallback to file modified time
  return { score: mtime || 0 };
}

export class BacklinkResolver {
  constructor(private app: App) {}

  /**
   * Resolves the latest backlink mention for a given link text or destination path.
   * @param linkText Target link string, e.g. "Pickle Ball" or "Pickle Ball.md"
   * @param currentFilePath Currently active note path (excluded if other backlinks exist)
   * @param maxChars Character truncation limit (default: 200)
   */
  async getLatestBacklinkMention(
    linkText: string,
    currentFilePath?: string,
    maxChars: number = 200
  ): Promise<BacklinkMentionResult> {
    const destFile = this.app.metadataCache.getFirstLinkpathDest(linkText, currentFilePath || '');
    if (!destFile || !destFile.path) {
      return { hasBacklinks: false };
    }

    const backlinksRecord = (this.app.metadataCache as any).getBacklinksForFile?.(destFile);
    if (!backlinksRecord || !backlinksRecord.data) {
      return { hasBacklinks: false };
    }

    const backlinksMap = backlinksRecord.data as Map<string, ReferenceCache[]>;
    const allSourcePaths = Array.from(backlinksMap.keys()) as string[];
    if (allSourcePaths.length === 0) {
      return { hasBacklinks: false };
    }

    // Filter out current active file if other backlinks exist
    let eligiblePaths = allSourcePaths;
    if (currentFilePath && allSourcePaths.length > 1) {
      eligiblePaths = allSourcePaths.filter((p) => p !== currentFilePath);
    }

    if (eligiblePaths.length === 0) {
      eligiblePaths = allSourcePaths;
    }

    // Read lines for each eligible source file and gather candidates
    const candidates: BacklinkCandidate[] = [];

    for (const srcPath of eligiblePaths) {
      const srcFile = this.app.vault.getAbstractFileByPath(srcPath) as TFile | null;
      if (!srcFile || !srcFile.path) continue;

      const refs = backlinksMap.get(srcPath);
      if (!refs || refs.length === 0) continue;

      try {
        const content = await this.app.vault.read(srcFile);
        const lines = content.split('\n');

        // Check references; pick each reference line
        for (const ref of refs) {
          const lineIndex = ref.position?.start?.line;
          const lineText = lineIndex !== undefined && lineIndex < lines.length ? lines[lineIndex] : '';

          const { score, explicitDate } = computeMentionScore(
            srcFile.path,
            lineText,
            srcFile.stat?.mtime || 0
          );

          candidates.push({
            file: srcFile,
            reference: ref,
            timestamp: score,
            explicitDate
          });
        }
      } catch (err) {
        console.warn(`[GTD Matrix] Failed reading backlink source ${srcPath}`, err);
      }
    }

    if (candidates.length === 0) {
      return { hasBacklinks: false };
    }

    // Sort descending by timestamp (newest first)
    candidates.sort((a, b) => b.timestamp - a.timestamp);

    const winningCandidate = candidates[0];
    const winningFile = winningCandidate.file;

    // Read full content to extract the exact line cleanly
    const fullContent = await this.app.vault.read(winningFile);
    const lines = fullContent.split('\n');
    const lineIndex = winningCandidate.reference.position?.start?.line ?? 0;
    const rawLine = lineIndex < lines.length ? lines[lineIndex] : '';

    const cleaned = cleanMentionLine(rawLine, maxChars);
    const sourceTitle = winningFile.name; // e.g. "Sep 08 2026.md"

    return {
      hasBacklinks: true,
      sourceFile: winningFile,
      sourceTitle,
      lineText: rawLine,
      cleanedText: cleaned,
      timestamp: winningCandidate.timestamp
    };
  }
}
