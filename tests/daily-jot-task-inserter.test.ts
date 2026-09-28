import { describe, it, expect } from 'vitest';
import {
  mapTodoistPriorityToEmoji,
  resolveTargetSectionHeader,
  formatInboundTaskBlock,
  insertTaskIntoDailyJotContent
} from '../src/todoist/daily-jot-task-inserter';
import type { TodoistTask } from '../src/todoist/todoist-types';

describe('daily-jot-task-inserter', () => {
  it('maps priorities correctly to emojis', () => {
    expect(mapTodoistPriorityToEmoji(4)).toBe(' 🔺');
    expect(mapTodoistPriorityToEmoji(3)).toBe(' 🔼');
    expect(mapTodoistPriorityToEmoji(2)).toBe(' 🔽');
    expect(mapTodoistPriorityToEmoji(1)).toBe('');
    expect(mapTodoistPriorityToEmoji(0)).toBe('');
  });

  it('routes project names to correct Identity section headers', () => {
    expect(resolveTargetSectionHeader('Yo the Manager')).toBe('## [[Yo the Manager]]');
    expect(resolveTargetSectionHeader('yo-manager')).toBe('## [[Yo the Manager]]');
    expect(resolveTargetSectionHeader('work')).toBe('## [[Yo the Manager]]');

    expect(resolveTargetSectionHeader('Josef with Self Care')).toBe('## [[Josef with Self Care]]');
    expect(resolveTargetSectionHeader('self care')).toBe('## [[Josef with Self Care]]');

    expect(resolveTargetSectionHeader('RJ the Supportive')).toBe('## [[RJ the Supportive]]');
    expect(resolveTargetSectionHeader('family')).toBe('## [[RJ the Supportive]]');

    expect(resolveTargetSectionHeader('Inbox')).toBe('## [[Yo the Manager]]');
    expect(resolveTargetSectionHeader('random project')).toBe('## [[Yo the Manager]]');
  });

  it('formats inbound task line with priority, due date, tags, and hidden comment', () => {
    const remote: TodoistTask = {
      id: '998877',
      project_id: 'p1',
      content: 'Review quarterly budget plan',
      is_completed: false,
      priority: 4,
      due: { date: '2026-10-05' },
      labels: ['finance', 'urgent', 'role/yo-manager']
    };

    const formatted = formatInboundTaskBlock(remote, 'uuid-1234');
    expect(formatted).toBe(
      '- [ ] Review quarterly budget plan 🔺 📅 2026-10-05 #finance #urgent <!-- {"uuid":"uuid-1234","todoistId":"998877"} -->'
    );
  });

  it('does not reimport descriptions written by the Obsidian projection', () => {
    const remote: TodoistTask = {
      id: '554433',
      project_id: 'p1',
      content: 'Setup server environment',
      is_completed: false,
      priority: 1,
      description: 'Check SSH keys\nVerify open ports\n\n---\n🔗 [Open in Obsidian](obsidian://open?vault=...) <!-- {"managedBy":"gtd"} -->'
    };

    const formatted = formatInboundTaskBlock(remote, 'uuid-5678');
    expect(formatted).toBe('- [ ] Setup server environment <!-- {"uuid":"uuid-5678","todoistId":"554433"} -->');
  });

  it('keeps notes on tasks created directly in Todoist', () => {
    const remote: TodoistTask = {
      id: '554434', project_id: 'p1', content: 'Setup server environment',
      is_completed: false, priority: 1, description: 'Check SSH keys\nVerify open ports'
    };
    expect(formatInboundTaskBlock(remote, 'uuid-5679')).toContain('\n  Check SSH keys\n  Verify open ports');
  });

  it('safely inserts task under ## [[Yo the Manager]] before Dataview / Embeds', () => {
    const dailyNote = `---
tags: []
identities: []
---
## [[Josef with Self Care]]

---
## [[RJ the Supportive]]

---
## [[Yo the Manager]]

\`\`\`dataviewjs
// Sunday review
\`\`\`
![[Daily Tasks Query]]
---
\`\`\`dataviewjs
// 5-day reader
\`\`\``;

    const taskLine = '- [ ] Deploy microservice 🔺 📅 2026-09-30 <!-- {"uuid":"u1","todoistId":"t1"} -->';
    const updated = insertTaskIntoDailyJotContent(dailyNote, '## [[Yo the Manager]]', taskLine);

    expect(updated).toContain(
      `## [[Yo the Manager]]\n\n- [ ] Deploy microservice 🔺 📅 2026-09-30 <!-- {"uuid":"u1","todoistId":"t1"} -->\n\n\`\`\`dataviewjs`
    );
    expect(updated).toContain('![[Daily Tasks Query]]');
  });

  it('safely inserts task under ## [[Josef with Self Care]] before the section divider', () => {
    const dailyNote = `---
tags: []
---
## [[Josef with Self Care]]

Existing note

---
## [[RJ the Supportive]]

---
## [[Yo the Manager]]`;

    const taskLine = '- [ ] Morning 5k run 📅 2026-09-29 <!-- {"uuid":"u2","todoistId":"t2"} -->';
    const updated = insertTaskIntoDailyJotContent(dailyNote, '## [[Josef with Self Care]]', taskLine);

    expect(updated).toContain(
      `## [[Josef with Self Care]]\n\nExisting note\n- [ ] Morning 5k run 📅 2026-09-29 <!-- {"uuid":"u2","todoistId":"t2"} -->\n\n---`
    );
  });

  it('preserves CRLF line endings when inserting into Windows files', () => {
    const dailyNote = `---\r\ntags: []\r\n---\r\n## [[Yo the Manager]]\r\n\r\n---\r\n![[Daily Tasks Query]]`;
    const taskLine = '- [ ] Task 1 <!-- {"uuid":"u3","todoistId":"t3"} -->';
    const updated = insertTaskIntoDailyJotContent(dailyNote, '## [[Yo the Manager]]', taskLine);

    expect(updated).toContain('\r\n');
    expect(updated.indexOf('- [ ] Task 1')).toBeLessThan(updated.indexOf('![[Daily Tasks Query]]'));
  });
});
