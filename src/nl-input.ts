import { DateAnchorField, EisenhowerSectionId, GTDSectionId, RoleId, TaskItem, TaskPriority, ViewMode } from './types';
import { getEisenhowerSection, getGTDSection } from './parser';
import { buildDateBuckets, getDateBucketId, DATE_BUCKET_UNDATED } from './view/date-buckets';

/** Structured result of the natural-language quick-add grammar. */
export interface ParsedInput {
  description: string;
  scheduledDate: string | null;
  priority: TaskPriority | null;
  role: RoleId | null;
}

const DATE_TOKEN_REGEX = /\b(today|tomorrow|next week)\b/i;
const PRIORITY_TOKEN_REGEX = /\bp([1-4])\b/i;
const ROLE_HASH_TOKEN_REGEX = /#(yomanager|josefselfcare|josef-selfcare|josef-self-care|rjsupportive|rj-supportive|untagged|yo|josef|rj)(?![-\w])/i;
const ROLE_PHRASE_REGEX = /\b(yo manager|josef self[- ]?care|rj supportive)\b/i;

const HASH_ROLE_MAP: Record<string, RoleId> = {
  yomanager: 'role/yo-manager',
  yo: 'role/yo-manager',
  josefselfcare: 'role/josef-selfcare',
  'josef-selfcare': 'role/josef-selfcare',
  'josef-self-care': 'role/josef-selfcare',
  josef: 'role/josef-selfcare',
  rjsupportive: 'role/rj-supportive',
  'rj-supportive': 'role/rj-supportive',
  rj: 'role/rj-supportive',
  untagged: 'untagged'
};

const PRIORITY_MAP: Record<string, TaskPriority> = {
  '1': 'highest',
  '2': 'high',
  '3': 'medium',
  '4': 'low'
};

/** UTC-stable day offset (mirrors date-buckets.addDays / task-transitions.addDays). */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Parses the quick-add grammar: today / tomorrow / next week, p1–p4, and role
 * tokens (#yo #yomanager #josef #josefselfcare #rj #rjsupportive #untagged or
 * the spaced phrase forms). Matched tokens are stripped from the description;
 * unknown tokens stay in the text. Falls back to the original trimmed input
 * when stripping empties the description.
 */
export function parseNaturalLanguageInput(text: string, todayStr: string): ParsedInput {
  const original = text.trim();
  let rest = text;
  let scheduledDate: string | null = null;
  let priority: TaskPriority | null = null;
  let role: RoleId | null = null;

  const dateMatch = rest.match(DATE_TOKEN_REGEX);
  if (dateMatch) {
    const word = dateMatch[1].toLowerCase();
    scheduledDate =
      word === 'today' ? todayStr : word === 'tomorrow' ? addDays(todayStr, 1) : addDays(todayStr, 7);
    rest = rest.replace(dateMatch[0], ' ');
  }

  const priorityMatch = rest.match(PRIORITY_TOKEN_REGEX);
  if (priorityMatch) {
    priority = PRIORITY_MAP[priorityMatch[1]];
    rest = rest.replace(priorityMatch[0], ' ');
  }

  const roleMatch = rest.match(ROLE_HASH_TOKEN_REGEX);
  if (roleMatch) {
    role = HASH_ROLE_MAP[roleMatch[1].toLowerCase()] ?? null;
    rest = rest.replace(roleMatch[0], ' ');
  } else {
    const genericRoleMatch = rest.match(/#role\/([a-zA-Z0-9_-]+)(?![-\w])/i);
    if (genericRoleMatch) {
      role = `role/${genericRoleMatch[1].toLowerCase()}`;
      rest = rest.replace(genericRoleMatch[0], ' ');
    } else {
      const phraseMatch = rest.match(ROLE_PHRASE_REGEX);
      if (phraseMatch) {
        const phrase = phraseMatch[1].toLowerCase();
        role = phrase.startsWith('yo')
          ? 'role/yo-manager'
          : phrase.startsWith('josef')
            ? 'role/josef-selfcare'
            : 'role/rj-supportive';
        rest = rest.replace(phraseMatch[0], ' ');
      }
    }
  }

  const description = rest.replace(/\s+/g, ' ').trim();
  return {
    description: description || original,
    scheduledDate,
    priority,
    role
  };
}

const GTD_LABELS: Record<GTDSectionId, string> = {
  'gtd-inbox': 'Inbox',
  'gtd-next-actions': 'Next Actions',
  'gtd-waiting': 'Waiting For',
  'gtd-scheduled': 'Scheduled',
  'gtd-someday': 'Someday',
  'gtd-completed': 'Completed Today'
};

const EISEN_LABELS: Record<EisenhowerSectionId, string> = {
  'eisen-q1': 'Q1',
  'eisen-q2': 'Q2',
  'eisen-q3': 'Q3',
  'eisen-q4': 'Q4',
  'eisen-inbox': 'Inbox',
  'eisen-completed': 'Completed Today'
};

const DATE_BUCKET_LABELS: Record<string, string> = {
  'date-past': 'Overdue',
  'date-soon': 'Soon',
  'date-someday': 'Someday',
  'date-undated': 'Undated',
  'date-completed': 'Completed Today'
};

/** Minimal TaskItem mirroring what the parsed tokens will write to disk. */
function buildPreviewTask(parsed: ParsedInput): TaskItem {
  const priority = parsed.priority ?? 'none';
  return {
    id: 'preview',
    filePath: '',
    fileName: '',
    lineNumber: 0,
    rawText: '',
    indent: '',
    statusChar: ' ',
    isCompleted: false,
    description: parsed.description,
    priority,
    dueDate: null,
    scheduledDate: parsed.scheduledDate,
    startDate: null,
    completedDate: null,
    createdDate: null,
    tags: [],
    isWaiting: false,
    isSomeday: priority === 'low',
    isProject: false,
    linkedNotes: [],
    effectiveRole: parsed.role ?? 'untagged',
    roleSource: 'none'
  };
}

/**
 * Short destination label for the parse preview chips ("Add to …").
 * Synthesizes a preview task from the parsed fields and runs the real
 * classifiers so the hint matches exactly where the renderer will file it.
 */
export function previewDestinationLabel(
  parsed: ParsedInput,
  viewMode: ViewMode,
  todayStr: string,
  dateAnchor: DateAnchorField
): string {
  const task = buildPreviewTask(parsed);

  if (viewMode === 'gtd') {
    const section = getGTDSection(task, todayStr) ?? 'gtd-inbox';
    return GTD_LABELS[section];
  }

  if (viewMode === 'eisenhower') {
    const section = getEisenhowerSection(task, todayStr) ?? 'eisen-inbox';
    return EISEN_LABELS[section];
  }

  const bucketId = getDateBucketId(task, dateAnchor, todayStr) ?? DATE_BUCKET_UNDATED;
  const fixedLabel = DATE_BUCKET_LABELS[bucketId];
  if (fixedLabel) return fixedLabel;

  const bucket = buildDateBuckets(todayStr).find((b) => b.id === bucketId);
  return bucket ? bucket.title.split('—')[0].trim() : 'Undated';
}
