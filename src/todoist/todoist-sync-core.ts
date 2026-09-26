import type { TaskItem, TaskPriority } from '../types';
import type { TodoistReconciliationPlan, TodoistTask } from './todoist-types';

const TODOIST_JSON_RE = /<!--\s*\{[^>]*?"todoistId"\s*:\s*"([^"]+)"[^>]*?\}\s*-->/;
const TODOIST_LEGACY_RE = /<!--\s*todoist-id:\s*([^\s>]+)\s*-->/;
const JSON_COMMENT_RE = /<!--\s*(\{.*?\})\s*-->/;

const HIDDEN_COMMENT_RE = /<!--.*?-->/g;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const DATE_EMOJI_RE = /[\u{1F4C5}\u{1F6EB}\u23F3\u2705]\s*\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2})?/gu;
const PRIO_EMOJI_RE = /[\u{1F53A}\u23EB\u{1F53C}\u{1F53D}]/gu;
const TAG_RE = /#[a-zA-Z0-9_/-]+/g;

export function isTodoistEligible(task: TaskItem): boolean {
  return !task.isCompleted && task.statusChar === ' ';
}

export function mapTaskPriorityToTodoist(priority: TaskPriority): number {
  switch (priority) {
    case 'highest':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    case 'lowest':
    case 'none':
    default:
      return 1;
  }
}

export function resolveFacetProjectName(task: TaskItem, defaultProject = 'Inbox'): string {
  if (task.effectiveRole === 'role/yo-manager') return 'Yo the Manager';
  if (task.effectiveRole === 'role/josef-selfcare') return 'Josef with Self Care';
  if (task.effectiveRole === 'role/rj-supportive') return 'RJ the Supportive';
  return defaultProject;
}

export function cleanTodoistTaskTitle(rawDescription: string): string {
  return rawDescription
    .replace(HIDDEN_COMMENT_RE, '')
    .replace(DATE_EMOJI_RE, '')
    .replace(PRIO_EMOJI_RE, '')
    .replace(WIKILINK_RE, (_match, target: string, alias?: string) => alias || target.split('/').pop() || target)
    .replace(MD_LINK_RE, '$1')
    .replace(TAG_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractTodoistId(rawText: string): string | null {
  const jsonMatch = rawText.match(TODOIST_JSON_RE);
  if (jsonMatch) return jsonMatch[1];
  const legacyMatch = rawText.match(TODOIST_LEGACY_RE);
  return legacyMatch ? legacyMatch[1] : null;
}

export function ensureTodoistIdentity(
  line: string,
  todoistId: string,
  defaultUuid: string = crypto.randomUUID().toLowerCase()
): string {
  const commentMatch = line.match(JSON_COMMENT_RE);
  if (commentMatch) {
    try {
      const metadata = JSON.parse(commentMatch[1]) as Record<string, unknown>;
      metadata.todoistId = todoistId;
      if (!metadata.uuid) metadata.uuid = defaultUuid;
      return line.replace(commentMatch[0], `<!-- ${JSON.stringify(metadata)} -->`);
    } catch {
      // Malformed comment; fall through to append
    }
  }

  return `${line.trimEnd()} <!-- ${JSON.stringify({ uuid: defaultUuid, todoistId })} -->`;
}

export function extractTodoistLabels(task: TaskItem): string[] {
  const tags = task.tags ?? [];
  const labels: string[] = [];

  for (const tag of tags) {
    const clean = tag.replace(/^#+/, '').trim();
    if (!clean) continue;

    const lower = clean.toLowerCase();
    // Exclude internal routing tags (roles and Eisenhower matrix tags)
    if (
      lower.startsWith('role/') ||
      lower.startsWith('eisen/') ||
      lower === 'role' ||
      lower === 'eisen'
    ) {
      continue;
    }

    // Convert slashes to hyphens because Todoist label names cannot contain slashes
    const labelName = lower.replace(/\//g, '-').replace(/[\s@]/g, '-');
    if (labelName && !labels.includes(labelName)) {
      labels.push(labelName);
    }
  }

  return labels.sort();
}

export function mergeTodoistLabelsToLocalLine(line: string, remoteLabels: string[]): string {
  if (!remoteLabels || remoteLabels.length === 0) return line;

  const hasCr = line.endsWith('\r');
  const cleanLine = line.replace(/\r$/, '');

  // Extract existing tags from line to avoid duplicates
  const existingTags = (cleanLine.match(TAG_RE) ?? []).map((t) =>
    t.replace(/^#+/, '').replace(/\//g, '-').toLowerCase()
  );

  const newTagsToAppend: string[] = [];
  for (const label of remoteLabels) {
    const norm = label.replace(/^#+/, '').replace(/[\s/]/g, '-').toLowerCase().trim();
    if (!norm) continue;
    if (
      norm.startsWith('role/') ||
      norm.startsWith('eisen/') ||
      norm === 'role' ||
      norm === 'eisen'
    ) {
      continue;
    }
    if (!existingTags.includes(norm)) {
      newTagsToAppend.push(`#${norm}`);
      existingTags.push(norm);
    }
  }

  if (newTagsToAppend.length === 0) return line;

  const tagString = newTagsToAppend.join(' ');

  // Insert before trailing comment if present
  const commentMatch = cleanLine.match(/\s*(<!--.*?-->)\s*$/);
  let updatedLine: string;
  if (commentMatch && commentMatch.index !== undefined) {
    const beforeComment = cleanLine.slice(0, commentMatch.index).trimEnd();
    const comment = commentMatch[1];
    updatedLine = `${beforeComment} ${tagString} ${comment}`;
  } else {
    updatedLine = `${cleanLine.trimEnd()} ${tagString}`;
  }

  return hasCr ? `${updatedLine}\r` : updatedLine;
}

export function cleanTodoistDescription(rawText: string, maxLines = 50, maxChars = 2000): string {
  const lines = rawText.split('\n');
  const keptLines: string[] = [];
  let isTruncated = false;

  for (let i = 0; i < lines.length; i++) {
    if (keptLines.length >= maxLines) {
      isTruncated = true;
      break;
    }
    const cleaned = lines[i]
      .replace(HIDDEN_COMMENT_RE, '')
      .replace(WIKILINK_RE, (_match, target: string, alias?: string) => alias || target.split('/').pop() || target)
      .trimEnd();
    keptLines.push(cleaned);
  }

  let result = keptLines.join('\n').trim();
  if (result.length > maxChars) {
    result = result.slice(0, maxChars).trim() + '\n... (truncated)';
  } else if (isTruncated) {
    result += '\n... (truncated)';
  }

  return result;
}

export function buildTodoistTaskDescription(task: TaskItem, vaultName: string): string {
  const deepLink = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(task.filePath)}`;
  const linkFooter = `🔗 [Open in Obsidian](${deepLink})`;

  if (task.childNotes && task.childNotes.trim().length > 0) {
    const cleaned = cleanTodoistDescription(task.childNotes);
    if (cleaned.length > 0) {
      return `${cleaned}\n\n---\n${linkFooter}`;
    }
  }

  return linkFooter;
}

export function resolveTodoistDueDate(task: TaskItem): string | undefined {
  // Option A: Start date (🛫) takes precedence so tasks alert when work begins.
  // Fallback order: startDate ?? scheduledDate ?? dueDate
  return (task.startDate ?? task.scheduledDate ?? task.dueDate) ?? undefined;
}

export function planTodoistReconciliation(
  localTasks: TaskItem[],
  remoteTasks: TodoistTask[],
  defaultProject = 'Inbox',
  vaultName = ''
): TodoistReconciliationPlan {
  const plan: TodoistReconciliationPlan = {
    create: [],
    update: [],
    move: [],
    closeTodoistIds: [],
    completeLocalTasks: [],
    updateLocalLabels: [],
  };

  const remoteTaskMap = new Map<string, TodoistTask>();
  for (const r of remoteTasks) {
    remoteTaskMap.set(r.id, r);
  }

  const localTaskById = new Map<string, TaskItem>();
  for (const t of localTasks) {
    localTaskById.set(t.id, t);
  }

  for (const task of localTasks) {
    const todoistId = extractTodoistId(task.rawText);

    if (todoistId) {
      const remote = remoteTaskMap.get(todoistId);
      if (remote) {
        if (task.isCompleted && !remote.is_completed) {
          // Local task was checked off; close in Todoist
          plan.closeTodoistIds.push(remote.id);
        } else if (!task.isCompleted && remote.is_completed) {
          // Remote task was completed in Todoist; complete in Obsidian
          plan.completeLocalTasks.push({ task });
        } else if (!task.isCompleted && !remote.is_completed) {
          // Compare content, due date, priority, description, labels
          const expectedTitle = cleanTodoistTaskTitle(task.description);
          const expectedPrio = mapTaskPriorityToTodoist(task.priority);
          const expectedDueDate = resolveTodoistDueDate(task);
          const expectedDesc = vaultName ? buildTodoistTaskDescription(task, vaultName) : undefined;
          const expectedLabels = extractTodoistLabels(task);
          const remoteDueDate = remote.due?.date;
          const remoteDesc = remote.description ?? '';
          const remoteLabels = (remote.labels ?? []).map((l) => l.toLowerCase().replace(/\//g, '-')).sort();

          // Check for labels added in Todoist that are missing locally
          const labelsToAddLocally = remoteLabels.filter((rl) => !expectedLabels.includes(rl));
          if (labelsToAddLocally.length > 0) {
            plan.updateLocalLabels?.push({
              task,
              labelsToAdd: labelsToAddLocally,
            });
          }

          // Check if remote is missing any labels present locally
          const labelsMissingInRemote = expectedLabels.filter((el) => !remoteLabels.includes(el));

          let needsUpdate =
            remote.content !== expectedTitle ||
            remote.priority !== expectedPrio ||
            remoteDueDate !== expectedDueDate ||
            labelsMissingInRemote.length > 0;

          if (expectedDesc !== undefined && remoteDesc !== expectedDesc) {
            needsUpdate = true;
          }

          if (needsUpdate) {
            plan.update.push({
              todoistId,
              task,
              projectName: resolveFacetProjectName(task, defaultProject),
            });
          }

          // Check if parent_id needs moving in Todoist
          if (task.parentTaskId) {
            const parent = localTaskById.get(task.parentTaskId);
            if (parent) {
              const parentTodoistId = extractTodoistId(parent.rawText);
              if (parentTodoistId && remote.parent_id !== parentTodoistId) {
                plan.move?.push({
                  todoistId,
                  parentId: parentTodoistId,
                });
              }
            }
          }
        }
      }
    } else if (isTodoistEligible(task)) {
      plan.create.push({
        task,
        projectName: resolveFacetProjectName(task, defaultProject),
      });
    }
  }

  // Ensure root parent tasks come before child subtasks in create plan
  plan.create.sort((a, b) => {
    const aHasParent = a.task.parentTaskId ? 1 : 0;
    const bHasParent = b.task.parentTaskId ? 1 : 0;
    if (aHasParent !== bHasParent) return aHasParent - bHasParent;
    return a.task.lineNumber - b.task.lineNumber;
  });

  return plan;
}
