import { describe, expect, it } from 'vitest';
import { ensureHiddenTaskUuid } from '../src/calendar/task-identity';

describe('hidden calendar task identity', () => {
  it('adds a UUID in a hidden JSON comment without changing visible task text', () => {
    expect(
      ensureHiddenTaskUuid(
        '- [ ] Buy milk 🛫 2026-09-22',
        () => '123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toEqual({
      line: '- [ ] Buy milk 🛫 2026-09-22 <!-- {"uuid":"123e4567-e89b-12d3-a456-426614174000"} -->',
      uuid: '123e4567-e89b-12d3-a456-426614174000',
      changed: true,
    });
  });

  it('reuses an existing UUID without rewriting the line', () => {
    const line = '- [ ] Buy milk <!-- {"uuid":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"} --> 🛫 2026-09-22';
    expect(ensureHiddenTaskUuid(line, () => 'unused')).toEqual({
      line,
      uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      changed: false,
    });
  });

  it('adds uuid to an existing hidden JSON object instead of adding another comment', () => {
    expect(
      ensureHiddenTaskUuid(
        '- [ ] Buy milk <!-- {"dismissedAt":123} --> 🛫 2026-09-22',
        () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ).line,
    ).toBe(
      '- [ ] Buy milk <!-- {"dismissedAt":123,"uuid":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"} --> 🛫 2026-09-22',
    );
  });
});
