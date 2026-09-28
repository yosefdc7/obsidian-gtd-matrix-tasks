import { App, TFile } from 'obsidian';
import type { TodoistTask } from './todoist-types';

export function mapTodoistPriorityToEmoji(priority: number): string {
  switch (priority) {
    case 4:
      return ' 🔺';
    case 3:
      return ' 🔼';
    case 2:
      return ' 🔽';
    default:
      return '';
  }
}

export function resolveTargetSectionHeader(projectName: string): string {
  const norm = projectName.trim().toLowerCase();
  if (norm === 'yo the manager' || norm === 'yo-manager' || norm === 'work') {
    return '## [[Yo the Manager]]';
  }
  if (norm === 'josef with self care' || norm === 'josef-selfcare' || norm === 'self care') {
    return '## [[Josef with Self Care]]';
  }
  if (norm === 'rj the supportive' || norm === 'rj-supportive' || norm === 'family') {
    return '## [[RJ the Supportive]]';
  }
  // Default for Inbox and unmapped projects
  return '## [[Yo the Manager]]';
}

export function cleanTodoistTitle(content: string): string {
  // Replace newlines with spaces to avoid breaking task markdown syntax
  return content.replace(/[\r\n]+/g, ' ').trim();
}

export function formatInboundTaskBlock(remoteTask: TodoistTask, uuid: string): string {
  const title = cleanTodoistTitle(remoteTask.content);
  const prioEmoji = mapTodoistPriorityToEmoji(remoteTask.priority);
  const dueStr = remoteTask.due?.date ? ` 📅 ${remoteTask.due.date}` : '';

  // Extract non-system labels
  const rawLabels = remoteTask.labels ?? [];
  const tagList: string[] = [];
  for (const l of rawLabels) {
    const norm = l.toLowerCase().replace(/^#+/, '').replace(/[\s/]/g, '-').trim();
    if (
      !norm ||
      norm.startsWith('role-') ||
      norm.startsWith('role/') ||
      norm.startsWith('eisen-') ||
      norm.startsWith('eisen/') ||
      norm === 'role' ||
      norm === 'eisen'
    ) {
      continue;
    }
    tagList.push(`#${norm}`);
  }
  const tagsStr = tagList.length > 0 ? ` ${tagList.join(' ')}` : '';

  const commentStr = ` <!-- {"uuid":"${uuid}","todoistId":"${remoteTask.id}"} -->`;
  const taskLine = `- [ ] ${title}${prioEmoji}${dueStr}${tagsStr}${commentStr}`;

  // Process optional description lines
  // A managed Obsidian deep link means this description came from our outbound
  // projection. Reimporting it can turn vault code or stale notes into task children.
  if (remoteTask.description && remoteTask.description.trim() && !remoteTask.description.includes('obsidian://open?')) {
    const descLines = remoteTask.description
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l) => {
        const trimmed = l.trim();
        // Strip obsidian deep link footers, managed comment tags, and trailing dividers
        return (
          trimmed.length > 0 &&
          trimmed !== '---' &&
          !l.includes('obsidian://open?') &&
          !l.includes('<!--') &&
          !trimmed.startsWith('🔗')
        );
      });

    if (descLines.length > 0) {
      const formattedDesc = descLines.map((l) => (l.trim().length > 0 ? `  ${l}` : '')).join('\n');
      return `${taskLine}\n${formattedDesc}`;
    }
  }

  return taskLine;
}

export function insertTaskIntoDailyJotContent(
  content: string,
  targetHeader: string,
  taskBlock: string
): string {
  const isCrlf = content.includes('\r\n');
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const lines = normalizedContent.split('\n');

  // Locate the header line index
  const headerIdx = lines.findIndex((l) => l.trim().toLowerCase() === targetHeader.trim().toLowerCase());

  let insertIdx = -1;

  if (headerIdx !== -1) {
    // Scan downwards to find where this section terminates
    let terminatorIdx = lines.length;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line === '---' ||
        line.startsWith('## ') ||
        line.startsWith('```dataview') ||
        line.startsWith('![[')
      ) {
        terminatorIdx = i;
        break;
      }
    }

    // Find the last non-empty line before terminatorIdx
    let lastContentIdx = terminatorIdx - 1;
    while (lastContentIdx > headerIdx && lines[lastContentIdx].trim() === '') {
      lastContentIdx--;
    }

    if (lastContentIdx === headerIdx) {
      // Section is empty. Remove any existing empty lines between header and terminator
      lines.splice(headerIdx + 1, terminatorIdx - (headerIdx + 1));
      insertIdx = headerIdx + 1;
      // Insert with empty line above and empty line below
      const taskLines = ['', ...taskBlock.split('\n'), ''];
      lines.splice(insertIdx, 0, ...taskLines);
      return lines.join(isCrlf ? '\r\n' : '\n');
    } else {
      insertIdx = lastContentIdx + 1;
    }
  } else {
    // Target header wasn't found in note.
    const bottomEmbedIdx = lines.findIndex(
      (l) => l.trim().startsWith('![[') || l.trim().startsWith('```dataview')
    );
    if (bottomEmbedIdx !== -1) {
      insertIdx = bottomEmbedIdx;
    } else {
      const fmEnd = lines.indexOf('---', 1);
      insertIdx = fmEnd !== -1 ? fmEnd + 1 : lines.length;
    }
  }

  // Insert task block
  const taskLines = taskBlock.split('\n');
  lines.splice(insertIdx, 0, ...taskLines);

  const result = lines.join(isCrlf ? '\r\n' : '\n');
  return result;
}

export async function ensureDailyJotFile(app: App, dailyNoteFolder: string): Promise<TFile> {
  const d = new Date();
  const year = d.getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = months[d.getMonth()];
  const day = String(d.getDate()).padStart(2, '0');
  const dailyPath = `${dailyNoteFolder || 'Jots'}/${year}/${monthStr}/${monthStr} ${day} ${year}.md`;

  const existing = app.vault.getAbstractFileByPath(dailyPath);
  if (existing instanceof TFile) {
    return existing;
  }

  // Ensure folder structure exists
  const parts = dailyPath.split('/');
  parts.pop();
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      try {
        await app.vault.createFolder(current);
      } catch (e) {
        // already exists or concurrent
      }
    }
  }

  // Try to load template from System/Templates/Daily Note.md
  const templatePath = 'System/Templates/Daily Note.md';
  const templateAbstract = app.vault.getAbstractFileByPath(templatePath);
  let initialContent = '';
  if (templateAbstract instanceof TFile) {
    try {
      initialContent = await app.vault.read(templateAbstract);
    } catch {
      initialContent = '';
    }
  }

  if (!initialContent.trim()) {
    const nowIso = new Date().toISOString();
    initialContent = `---
tags: []
identities: []
type: ""
status: ""
created: ${nowIso}
about: ""
name: Daily Note
parent: Templates
area: ""
---
## [[Josef with Self Care]]

---
## [[RJ the Supportive]]

---
## [[Yo the Manager]]

![[Daily Tasks Query]]
---
`;
  }

  return await app.vault.create(dailyPath, initialContent);
}

