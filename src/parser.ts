import { TaskItem, TaskPriority, SectionId } from './types';

const TASK_REGEX = /^(\s*[-*+]\s*\[)(.)(\]\s*)(.*)$/;
const DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const COMPLETED_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
// Must use 'u' flag for unicode emoji surrogate pairs
const PRIORITY_EMOJI_REGEX = /[⏫🔺🔼🔽⏬]/gu;
const EISEN_TAG_REGEX = /#eisen\/[a-zA-Z0-9_-]+/g;
const TAG_REGEX = /#[a-zA-Z0-9_/-]+/g;

export function parseTaskLine(line: string, filePath: string, lineNumber: number): TaskItem | null {
  const match = line.match(TASK_REGEX);
  if (!match) return null;

  const prefix = match[1];
  const statusChar = match[2];
  const body = match[4];
  const indent = line.slice(0, line.indexOf(prefix.trim()));

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

  // Clean description (stripping date emojis, priority emojis, but leaving general text/tags)
  let description = body
    .replace(DUE_DATE_REGEX, '')
    .replace(SCHEDULED_DATE_REGEX, '')
    .replace(START_DATE_REGEX, '')
    .replace(COMPLETED_DATE_REGEX, '')
    .replace(PRIORITY_EMOJI_REGEX, '')
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
    tags
  };
}

export function setTaskPriority(line: string, newPriority: TaskPriority): string {
  // Strip existing priority emojis and eisen tags
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

export function setTaskDueDate(line: string, dateStr: string | null): string {
  let clean = line.replace(DUE_DATE_REGEX, '').replace(/[ \t]+$/, '').trimEnd();
  if (dateStr) {
    return `${clean} 📅 ${dateStr}`;
  }
  return clean;
}

export function setTaskDescription(line: string, newDescription: string): string {
  const parsed = parseTaskLine(line, 'temp.md', 0);
  if (!parsed || !parsed.description) {
    const match = line.match(TASK_REGEX);
    if (!match) return line;
    return `${match[1]}${match[2]}${match[3]}${newDescription}`;
  }

  // Replace old description with new description
  return line.replace(parsed.description, newDescription.trim());
}

export function getTaskSection(task: TaskItem, todayStr: string): SectionId | null {
  if (task.isCompleted) {
    if (task.completedDate === todayStr) {
      return 'completed-today';
    }
    return null; // Historical completed tasks are omitted from the active GTD view
  }

  if (task.priority === 'highest') {
    return 'q1-do';
  }

  if (task.priority === 'high') {
    return 'q2-schedule';
  }

  if (task.priority === 'medium' || task.statusChar === '?') {
    return 'q3-delegate';
  }

  if (task.priority === 'low' || task.priority === 'lowest') {
    return 'q4-someday';
  }

  if (task.dueDate || task.scheduledDate) {
    return 'scheduled';
  }

  return 'inbox';
}
