import { describe, it, expect } from 'vitest';
import { TASK_METADATA_REGEX, isTaskMetadataComment } from '../src/editor/task-metadata-decorator';

describe('Task Metadata Decorator Regex Matching', () => {
  it('matches full JSON comment with uuid and todoistId', () => {
    const text = '- [ ] Call client <!-- {"uuid":"12345","todoistId":"abcde"} -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Call client');
  });

  it('matches single uuid comment', () => {
    const text = '- [ ] Gym workout 📅 2026-09-28 <!-- {"uuid":"f3e8790e-0b8e"} -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Gym workout 📅 2026-09-28');
  });

  it('matches single todoistId comment', () => {
    const text = '- [ ] Buy groceries <!-- {"todoistId":"6hcpXjgQH8RR3MQ5"} -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Buy groceries');
  });

  it('matches legacy todoist-id comment', () => {
    const text = '- [ ] Follow up <!-- todoist-id:xyz_123 -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Follow up');
  });

  it('preserves normal user HTML comments', () => {
    const text = '- [ ] Draft article <!-- remember to cite source -->';
    expect(isTaskMetadataComment(text)).toBe(false);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe(text);
  });

  it('preserves unrelated JSON comments', () => {
    const text = '- [ ] Special note <!-- {"customKey":"value"} -->';
    expect(isTaskMetadataComment(text)).toBe(false);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe(text);
  });

  it('cleans trailing spaces cleanly before comment', () => {
    const text = '- [ ] Clean garage 🔺 #chore   <!-- {"uuid":"abc"} -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Clean garage 🔺 #chore');
  });

  it('matches comments with internal spaces and line variations', () => {
    const text = '- [ ] Long task <!--   { "uuid" : "abc" , "todoistId" : "123" }   -->';
    expect(isTaskMetadataComment(text)).toBe(true);
    expect(text.replace(TASK_METADATA_REGEX, '')).toBe('- [ ] Long task');
  });
});
