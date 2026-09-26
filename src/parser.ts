import { TaskItem, TaskPriority, GTDSectionId, EisenhowerSectionId, RoleId, SortCriteria, ConfiguredRole } from './types';

const TASK_REGEX = /^(\s*[-*+]\s*\[)(.)(\]\s*)(.*)$/;
const DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const COMPLETED_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
const CREATED_DATE_REGEX = /➕\s*(\d{4}-\d{2}-\d{2})/;
const PRIORITY_EMOJI_REGEX = /[⏫🔺🔼🔽⏬]/gu;
const EISEN_TAG_REGEX = /#eisen\/[a-zA-Z0-9_-]+/g;
const TAG_REGEX = /#[a-zA-Z0-9_/-]+/g;
const SOMEDAY_REGEX = /#(someday|maybe)\b/i;
const WAITING_REGEX = /#waiting\b|@waiting\b|\bwaiting on\b|#blocked\b|#on-hold\b|#onhold\b/i;
const WIKILINK_REGEX = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
const ROLE_TAG_REGEX = /#role\/[a-zA-Z0-9_-]+/g;
const HIDDEN_COMMENT_REGEX = /<!--.*?-->/g;

export function parseTaskLine(line: string, filePath: string, lineNumber: number): TaskItem | null {
  const cleanLine = line.replace(/\r$/, '');
  const match = cleanLine.match(TASK_REGEX);
  if (!match) return null;

  const prefix = match[1];
  const statusChar = match[2];
  const body = match[4];
  const indent = cleanLine.slice(0, cleanLine.indexOf(prefix.trim()));

  const isCompleted = statusChar.toLowerCase() === 'x';

  // Extract Dates
  const dueMatch = body.match(DUE_DATE_REGEX);
  const dueDate = dueMatch ? dueMatch[1] : null;

  const scheduledMatch = body.match(SCHEDULED_DATE_REGEX);
  const scheduledDate = scheduledMatch ? scheduledMatch[1] : null;

  const startMatch = body.match(START_DATE_REGEX);
  const startDate = startMatch ? startMatch[1] : null;

  const completedMatch = body.match(COMPLETED_DATE_REGEX);
  const completedDate = completedMatch ? completedMatch[1] : null;

  const createdMatch = body.match(CREATED_DATE_REGEX);
  const createdDate = createdMatch ? createdMatch[1] : null;

  // Extract Priority
  let priority: TaskPriority = 'none';
  if (body.includes('⏫') || body.includes('🔺') || body.includes('#eisen/urgent-important')) {
    priority = 'highest';
  } else if (body.includes('🔼') || body.includes('#eisen/important-not-urgent')) {
    priority = 'high';
  } else if (body.includes('🔽') || body.includes('#eisen/urgent-not-important')) {
    priority = 'medium';
  } else if (body.includes('⏬') || body.includes('#eisen/not-urgent-not-important')) {
    priority = 'low';
  }

  // Extract Tags
  const tags: string[] = [];
  const tagMatches = body.match(TAG_REGEX);
  if (tagMatches) {
    tags.push(...tagMatches);
  }

  // Extract Linked Notes [[Note]]
  const linkedNotes: string[] = [];
  let linkMatch: RegExpExecArray | null;
  const linkRegex = new RegExp(WIKILINK_REGEX.source, 'g');
  while ((linkMatch = linkRegex.exec(body)) !== null) {
    const noteName = linkMatch[1]?.trim();
    if (noteName && !linkedNotes.includes(noteName)) {
      linkedNotes.push(noteName);
    }
  }

  // GTD State detection
  const isWaiting = statusChar === '?' || WAITING_REGEX.test(body);
  const isSomeday = SOMEDAY_REGEX.test(body) || priority === 'low';
  const isProject = filePath.replace(/\\/g, '/').includes('Projects/') || tags.includes('#project') || /\[\[Project [^\]]+\]\]/.test(body);

  // Clean description
  let description = body
    .replace(DUE_DATE_REGEX, '')
    .replace(SCHEDULED_DATE_REGEX, '')
    .replace(START_DATE_REGEX, '')
    .replace(COMPLETED_DATE_REGEX, '')
    .replace(CREATED_DATE_REGEX, '')
    .replace(PRIORITY_EMOJI_REGEX, '')
    .replace(HIDDEN_COMMENT_REGEX, '')
    .replace(/\s+/g, ' ')
    .trim();

  const fileName = filePath.split(/[/\\]/).pop()?.replace(/\.md$/, '') || filePath;

  return {
    id: `${filePath}:${lineNumber}`,
    filePath,
    fileName,
    lineNumber,
    rawText: line,
    indent,
    statusChar,
    isCompleted,
    description,
    priority,
    dueDate,
    scheduledDate,
    startDate,
    completedDate,
    createdDate,
    tags,
    isWaiting,
    isSomeday,
    isProject,
    linkedNotes,
    effectiveRole: 'untagged',
    roleSource: 'none'
  };
}

export function setTaskPriority(line: string, newPriority: TaskPriority): string {
  let updated = line
    .replace(PRIORITY_EMOJI_REGEX, '')
    .replace(EISEN_TAG_REGEX, '')
    .replace(/[ \t]+$/, '')
    .trimEnd();

  let emoji = '';
  switch (newPriority) {
    case 'highest':
      emoji = '⏫';
      break;
    case 'high':
      emoji = '🔼';
      break;
    case 'medium':
      emoji = '🔽';
      break;
    case 'low':
    case 'lowest':
      emoji = '⏬';
      break;
    case 'none':
    default:
      return updated;
  }

  return `${updated} ${emoji}`;
}

export function setTaskCompletion(line: string, completed: boolean, dateStr?: string): string {
  const match = line.match(TASK_REGEX);
  if (!match) return line;

  const prefix = match[1];
  const trailingBracket = match[3];
  const body = match[4];
  const newChar = completed ? 'x' : ' ';
  const newPrefix = `${prefix}${newChar}${trailingBracket}`;

  let cleanBody = body.replace(COMPLETED_DATE_REGEX, '').trimEnd();

  if (completed) {
    const d = dateStr || new Date().toISOString().slice(0, 10);
    return `${newPrefix}${cleanBody} ✅ ${d}`;
  } else {
    return `${newPrefix}${cleanBody}`;
  }
}

/**
 * Set the raw status character inside `- [?]` to `newChar`, keeping the ✅
 * completion date in sync (added when newChar === 'x', stripped otherwise).
 */
export function setTaskStatusChar(line: string, newChar: string, dateStr?: string): string {
  const match = line.match(TASK_REGEX);
  if (!match) return line;

  const prefix = match[1];
  const trailingBracket = match[3];
  const body = match[4];

  const newPrefix = `${prefix}${newChar}${trailingBracket}`;
  const cleanBody = body.replace(COMPLETED_DATE_REGEX, '').trimEnd();

  if (newChar === 'x') {
    const d = dateStr || new Date().toISOString().slice(0, 10);
    return `${newPrefix}${cleanBody} ✅ ${d}`;
  }
  return `${newPrefix}${cleanBody}`;
}

export function setTaskDueDate(line: string, dateStr: string | null): string {
  let clean = line.replace(DUE_DATE_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  if (dateStr) {
    return `${clean} 📅 ${dateStr}`;
  }
  return clean;
}

export function setTaskScheduledDate(line: string, dateStr: string | null): string {
  let clean = line.replace(SCHEDULED_DATE_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  if (dateStr) {
    return `${clean} ⏳ ${dateStr}`;
  }
  return clean;
}

export function setTaskStartDate(line: string, dateStr: string | null): string {
  let clean = line.replace(START_DATE_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  if (dateStr) {
    return `${clean} 🛫 ${dateStr}`;
  }
  return clean;
}

export function setTaskWaiting(line: string, waiting: boolean): string {
  const match = line.match(TASK_REGEX);
  if (!match) return line;

  const prefix = match[1];
  const trailingBracket = match[3];
  let body = match[4];

  if (waiting) {
    // Change checkbox character to '?'
    const newPrefix = `${prefix}?${trailingBracket}`;
    return `${newPrefix}${body}`;
  } else {
    // Restore checkbox character to ' ' and strip #waiting
    const newPrefix = `${prefix} ${trailingBracket}`;
    body = body.replace(/#waiting\b/gi, '').replace(/\s+/g, ' ').trim();
    return `${newPrefix}${body}`;
  }
}

export function setTaskSomeday(line: string, someday: boolean): string {
  let clean = line.replace(SOMEDAY_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  if (someday) {
    return `${clean} #someday`;
  }
  return clean;
}

export function setTaskDescription(line: string, newDescription: string): string {
  const hiddenComments = line.match(HIDDEN_COMMENT_REGEX) ?? [];
  const visibleLine = line.replace(HIDDEN_COMMENT_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  const parsed = parseTaskLine(visibleLine, 'temp.md', 0);
  if (!parsed || !parsed.description) {
    const match = visibleLine.match(TASK_REGEX);
    if (!match) return line;
    const updated = `${match[1]}${match[2]}${match[3]}${newDescription}`;
    return hiddenComments.length ? `${updated} ${hiddenComments.join(' ')}` : updated;
  }

  const updated = visibleLine.replace(parsed.description, newDescription.trim()).trimEnd();
  return hiddenComments.length ? `${updated} ${hiddenComments.join(' ')}` : updated;
}

export function getGTDSection(task: TaskItem, todayStr: string): GTDSectionId | null {
  if (task.isCompleted) {
    if (task.completedDate === todayStr) {
      return 'gtd-completed';
    }
    return null; // Omit older completed tasks
  }

  // 1. Waiting For: statusChar='?' OR #waiting/#blocked/#on-hold tags
  if (task.isWaiting) {
    return 'gtd-waiting';
  }

  // Build a helper: how many days from today is a date string?
  const daysDiff = (dateStr: string): number => {
    const todayMs = new Date(todayStr).getTime();
    const targetMs = new Date(dateStr).getTime();
    return Math.round((targetMs - todayMs) / 86400000);
  };

  // Use the earliest of dueDate / scheduledDate / startDate
  const relevantDate = task.dueDate || task.scheduledDate || task.startDate;

  // 2. Someday: explicit #someday/#maybe tag OR date is more than 90 days away
  if (task.isSomeday || (relevantDate && daysDiff(relevantDate) > 90)) {
    return 'gtd-someday';
  }

  // 3. Next Actions: date within 0–3 days from today (overdue counts as next action)
  if (relevantDate && daysDiff(relevantDate) <= 3) {
    return 'gtd-next-actions';
  }

  // 4. Scheduled: date 4–90 days from today
  if (relevantDate && daysDiff(relevantDate) <= 90) {
    return 'gtd-scheduled';
  }

  // 5. Tasks with priority or #next tag but no date → Next Actions
  if (task.priority !== 'none' || task.isProject || task.tags.includes('#next')) {
    return 'gtd-next-actions';
  }

  // 6. Raw unprocessed capture
  return 'gtd-inbox';
}


export function getEisenhowerSection(task: TaskItem, todayStr: string): EisenhowerSectionId | null {
  if (task.isCompleted) {
    if (task.completedDate === todayStr) {
      return 'eisen-completed';
    }
    return null;
  }

  if (task.priority === 'highest') {
    return 'eisen-q1';
  }

  if (task.priority === 'high') {
    return 'eisen-q2';
  }

  if (task.priority === 'medium' || task.isWaiting) {
    return 'eisen-q3';
  }

  if (task.priority === 'low' || task.priority === 'lowest' || task.isSomeday) {
    return 'eisen-q4';
  }

  return 'eisen-inbox';
}

export function formatRoleLabel(tag: string): string {
  let clean = tag.replace(/^#+/, '').trim();
  clean = clean.replace(/^(roles?\/)/i, '');
  const lower = clean.toLowerCase();
  if (
    lower === 'yo-manager' ||
    lower === 'yo manager' ||
    lower === 'yo the manager' ||
    lower === 'yo_manager'
  ) {
    return 'Yo the Manager';
  }
  if (
    lower === 'josef-selfcare' ||
    lower === 'josef-self-care' ||
    lower === 'josefselfcare' ||
    lower === 'josef self-care' ||
    lower === 'josef with self care' ||
    lower === 'josef_selfcare'
  ) {
    return 'Josef with Self Care';
  }
  if (
    lower === 'rj-supportive' ||
    lower === 'rjsupportive' ||
    lower === 'rj supportive' ||
    lower === 'rj the supportive' ||
    lower === 'rj_supportive'
  ) {
    return 'RJ the Supportive';
  }
  clean = clean.replace(/[-_/]+/g, ' ').trim();
  return clean
    .split(/\s+/)
    .map((word) => {
      if (word.toLowerCase() === 'rj') return 'RJ';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export const DEFAULT_ROLE_DEFS: ConfiguredRole[] = [
  { id: 'role/yo-manager', label: 'Yo the Manager', tag: 'role/yo-manager' },
  { id: 'role/josef-selfcare', label: 'Josef with Self Care', tag: 'role/josef-selfcare' },
  { id: 'role/rj-supportive', label: 'RJ the Supportive', tag: 'role/rj-supportive' }
];

export function parseConfiguredRoles(csv?: string): ConfiguredRole[] {
  if (!csv || !csv.trim()) {
    return DEFAULT_ROLE_DEFS;
  }
  const parts = csv
    .split(',')
    .map((s) => s.trim().replace(/^#+/, '').trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return DEFAULT_ROLE_DEFS;
  }
  return parts.map((rawTag) => {
    const norm = rawTag.toLowerCase();
    const id = norm.startsWith('role/') ? norm : `role/${norm}`;
    return {
      id,
      label: formatRoleLabel(rawTag),
      tag: norm
    };
  });
}

export const ROLE_COLOR_PALETTE = [
  'var(--color-blue, #3b82f6)',
  'var(--color-green, #10b981)',
  'var(--color-purple, #8b5cf6)',
  'var(--color-orange, #f59e0b)',
  'var(--color-cyan, #06b6d4)',
  'var(--color-red, #ef4444)',
  'var(--color-pink, #ec4899)',
  'var(--color-yellow, #eab308)'
];

export function getRoleColor(roleId: string, index?: number): string {
  if (roleId === 'untagged') return 'var(--text-faint, #94a3b8)';
  if (roleId === 'role/yo-manager') return 'var(--color-blue, #3b82f6)';
  if (roleId === 'role/josef-selfcare') return 'var(--color-green, #10b981)';
  if (roleId === 'role/rj-supportive') return 'var(--color-purple, #8b5cf6)';
  if (typeof index === 'number' && index >= 0) {
    return ROLE_COLOR_PALETTE[index % ROLE_COLOR_PALETTE.length];
  }
  let hash = 0;
  for (let i = 0; i < roleId.length; i++) {
    hash = (hash << 5) - hash + roleId.charCodeAt(i);
    hash |= 0;
  }
  return ROLE_COLOR_PALETTE[Math.abs(hash) % ROLE_COLOR_PALETTE.length];
}

export const ROLE_IDS: RoleId[] = [
  'role/yo-manager',
  'role/josef-selfcare',
  'role/rj-supportive'
];

export function extractRoleFromTags(tags: string[], configuredRoles?: ConfiguredRole[]): RoleId | null {
  const roles = configuredRoles && configuredRoles.length > 0 ? configuredRoles : DEFAULT_ROLE_DEFS;
  for (const tag of tags) {
    const cleanTag = tag.replace(/^#/, '').toLowerCase().trim();
    for (const r of roles) {
      if (cleanTag === r.id || cleanTag === r.tag) return r.id;
      if (r.id.startsWith('role/') && cleanTag === r.id.slice(5)) return r.id;
      if (!cleanTag.startsWith('role/') && `role/${cleanTag}` === r.id) return r.id;
      const hypLabel = r.label.toLowerCase().replace(/\s+/g, '-');
      if (cleanTag === hypLabel || cleanTag === `role/${hypLabel}`) return r.id;
      if (r.id === 'role/yo-manager') {
        if (
          cleanTag === 'role/yo-manager' ||
          cleanTag === 'yo-manager' ||
          cleanTag === 'role/yo-the-manager' ||
          cleanTag === 'yo-the-manager' ||
          cleanTag === 'yo the manager'
        ) {
          return 'role/yo-manager';
        }
      }
      if (r.id === 'role/josef-selfcare') {
        if (
          cleanTag === 'role/josef-selfcare' ||
          cleanTag === 'josef-selfcare' ||
          cleanTag === 'role/josef-self-care' ||
          cleanTag === 'josef-self-care' ||
          cleanTag === 'role/josef-with-self-care' ||
          cleanTag === 'josef with self care'
        ) {
          return 'role/josef-selfcare';
        }
      }
      if (r.id === 'role/rj-supportive') {
        if (
          cleanTag === 'role/rj-supportive' ||
          cleanTag === 'rj-supportive' ||
          cleanTag === 'role/rj-the-supportive' ||
          cleanTag === 'rj the supportive'
        ) {
          return 'role/rj-supportive';
        }
      }
    }
  }
  return null;
}

export function extractRoleFromIdentities(identities: unknown, configuredRoles?: ConfiguredRole[]): RoleId | null {
  if (!identities) return null;
  const roles = configuredRoles && configuredRoles.length > 0 ? configuredRoles : DEFAULT_ROLE_DEFS;
  const list: string[] = Array.isArray(identities)
    ? identities.map(String)
    : typeof identities === 'string'
    ? [identities]
    : [];

  for (const item of list) {
    const clean = item.replace(/\[\[|\]\]/g, '').replace(/\|.*$/, '').trim().toLowerCase();
    if (!clean) continue;
    for (const r of roles) {
      if (clean === r.id.toLowerCase()) return r.id;
      if (clean === r.label.toLowerCase()) return r.id;
      if (clean === r.tag.toLowerCase()) return r.id;
      if (r.id.startsWith('role/') && clean === r.id.slice(5).toLowerCase()) return r.id;
      const formatted = formatRoleLabel(clean);
      if (formatted.toLowerCase() === r.label.toLowerCase()) return r.id;
      if (r.id === 'role/yo-manager' && (clean === 'yo the manager' || clean === 'yo manager' || clean === 'yo-manager')) return r.id;
      if (r.id === 'role/josef-selfcare' && (clean === 'josef with self care' || clean === 'josef self-care' || clean === 'josef-selfcare')) return r.id;
      if (r.id === 'role/rj-supportive' && (clean === 'rj the supportive' || clean === 'rj supportive' || clean === 'rj-supportive')) return r.id;
    }
  }
  return null;
}

export function extractRoleFromPath(filePath: string, configuredRoles?: ConfiguredRole[]): RoleId | null {
  const norm = filePath.replace(/\\/g, '/');
  const roles = configuredRoles && configuredRoles.length > 0 ? configuredRoles : DEFAULT_ROLE_DEFS;
  for (const r of roles) {
    if (norm.includes(`00 Identity/${r.label}/`) || norm.includes(`/${r.label}/`)) return r.id;
    if (norm.startsWith(`Roles/${r.label}/`)) return r.id;
    if (r.tag.startsWith('role/')) {
      const raw = r.tag.slice(5);
      if (norm.includes(`/${raw}/`)) return r.id;
    }
    if (norm.includes(`/${r.tag}/`)) return r.id;

    if (r.id === 'role/yo-manager' && (norm.includes('Yo the Manager') || norm.includes('Yo Manager'))) return r.id;
    if (r.id === 'role/josef-selfcare' && (norm.includes('Josef with Self Care') || norm.includes('Josef Self-Care') || norm.includes('Josef-Selfcare'))) return r.id;
    if (r.id === 'role/rj-supportive' && (norm.includes('RJ the Supportive') || norm.includes('RJ Supportive') || norm.includes('RJ-Supportive'))) return r.id;
  }
  return null;
}

export function setTaskRole(line: string, newRole: RoleId | null, configuredRoles?: ConfiguredRole[]): string {
  const roles = configuredRoles && configuredRoles.length > 0 ? configuredRoles : DEFAULT_ROLE_DEFS;

  // 1. Strip legacy #role/... tags
  let clean = line.replace(ROLE_TAG_REGEX, '');

  // 2. Identify if an existing identity wikilink exists
  let replaced = false;
  const roleDef = newRole && newRole !== 'untagged'
    ? (roles.find((r) => r.id === newRole || r.tag === newRole) ?? { label: formatRoleLabel(newRole) })
    : null;
  const newIdentityLink = roleDef ? `[[${roleDef.label}]]` : '';

  clean = clean.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (match, noteName) => {
    const roleId = extractRoleFromIdentities([noteName], roles);
    if (roleId) {
      if (!replaced && newIdentityLink) {
        replaced = true;
        return newIdentityLink;
      }
      return '';
    }
    return match;
  });

  clean = clean.replace(/[ \t]{2,}/g, ' ').trimEnd();

  if (!newRole || newRole === 'untagged') {
    return clean;
  }

  if (!replaced && newIdentityLink) {
    return `${clean} ${newIdentityLink}`;
  }

  return clean;
}


export function sortTasks(tasks: TaskItem[], criteria: SortCriteria): TaskItem[] {
  const list = [...tasks];
  switch (criteria) {
    case 'date':
      return list.sort((a, b) => {
        const dateA = a.scheduledDate || a.dueDate || a.startDate;
        const dateB = b.scheduledDate || b.dueDate || b.startDate;
        if (dateA && dateB) {
          const cmp = dateA.localeCompare(dateB);
          if (cmp !== 0) return cmp;
        } else if (dateA && !dateB) {
          return -1;
        } else if (!dateA && dateB) {
          return 1;
        }
        return a.fileName.localeCompare(b.fileName);
      });

    case 'priority': {
      const weight: Record<TaskPriority, number> = {
        highest: 5,
        high: 4,
        medium: 3,
        low: 2,
        lowest: 1,
        none: 0
      };
      return list.sort((a, b) => {
        const diff = (weight[b.priority] ?? 0) - (weight[a.priority] ?? 0);
        if (diff !== 0) return diff;
        const dateA = a.scheduledDate || a.dueDate || a.startDate;
        const dateB = b.scheduledDate || b.dueDate || b.startDate;
        if (dateA && dateB) return dateA.localeCompare(dateB);
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;
        return a.fileName.localeCompare(b.fileName);
      });
    }

    case 'title':
      return list.sort((a, b) => {
        return a.description.localeCompare(b.description, undefined, { sensitivity: 'base' });
      });

    case 'created':
      return list.sort((a, b) => {
        const cA = a.createdDate;
        const cB = b.createdDate;
        if (cA && cB) {
          const cmp = cB.localeCompare(cA); // Newest first
          if (cmp !== 0) return cmp;
        } else if (cA && !cB) {
          return -1;
        } else if (!cA && cB) {
          return 1;
        }
        return a.fileName.localeCompare(b.fileName);
      });

    default:
      return list;
  }
}

export function getIndentWidth(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count += 1;
    else if (ch === '\t') count += 4;
    else break;
  }
  return count;
}

export function parseFileTasks(lines: string[], filePath: string): TaskItem[] {
  const tasks: TaskItem[] = [];
  const stack: { task: TaskItem; indentWidth: number }[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx].replace(/\r$/, '');

    // Markdown headings (#, ##, etc.) reset the task outline stack
    if (/^#{1,6}\s/.test(rawLine.trimStart())) {
      stack.length = 0;
      continue;
    }

    const task = parseTaskLine(rawLine, filePath, lineIdx);
    if (task) {
      const lineIndent = getIndentWidth(rawLine);

      // Pop stack entries that are at or deeper than current task's indent level
      while (stack.length > 0 && stack[stack.length - 1].indentWidth >= lineIndent) {
        stack.pop();
      }

      // If stack has an entry, that entry is this task's immediate parent
      if (stack.length > 0) {
        const parent = stack[stack.length - 1].task;
        task.parentLineNumber = parent.lineNumber;
        task.parentTaskId = parent.id;
      }

      tasks.push(task);
      stack.push({ task, indentWidth: lineIndent });
    } else if (rawLine.trim().length > 0 && stack.length > 0) {
      const lineIndent = getIndentWidth(rawLine);
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].indentWidth < lineIndent) {
          const parent = stack[i].task;
          if (!parent.childNotesLines) {
            parent.childNotesLines = [];
          }
          if (parent.childNotesLines.length < 50) {
            const parentWidth = stack[i].indentWidth;
            let stripped = 0;
            let idx = 0;
            while (idx < rawLine.length && stripped < parentWidth) {
              if (rawLine[idx] === ' ') {
                stripped += 1;
                idx += 1;
              } else if (rawLine[idx] === '\t') {
                stripped += 4;
                idx += 1;
              } else {
                break;
              }
            }
            parent.childNotesLines.push(rawLine.slice(idx));
          }
          break;
        }
      }
    }
  }

  for (const t of tasks) {
    if (t.childNotesLines && t.childNotesLines.length > 0) {
      const nonEmptyLines = t.childNotesLines.filter((l) => l.trim().length > 0);
      let minIndent = Infinity;
      for (const l of nonEmptyLines) {
        const w = getIndentWidth(l) - getIndentWidth(l.trimStart());
        if (w < minIndent) minIndent = w;
      }

      if (minIndent > 0 && Number.isFinite(minIndent)) {
        t.childNotes = t.childNotesLines
          .map((l) => {
            if (l.trim().length === 0) return '';
            let stripped = 0;
            let idx = 0;
            while (idx < l.length && stripped < minIndent) {
              if (l[idx] === ' ') {
                stripped += 1;
                idx += 1;
              } else if (l[idx] === '\t') {
                stripped += 4;
                idx += 1;
              } else {
                break;
              }
            }
            return l.slice(idx);
          })
          .join('\n');
      } else {
        t.childNotes = t.childNotesLines.join('\n');
      }
    }
  }

  return tasks;
}

