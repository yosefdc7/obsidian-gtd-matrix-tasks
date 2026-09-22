import { describe, expect, it } from 'vitest';
import { millisecondsUntilNextLocalMidnight } from '../src/view/date-rollover';

describe('millisecondsUntilNextLocalMidnight', () => {
  it('returns the remaining local-day duration', () => {
    expect(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 22, 23, 59, 59, 500)))
      .toBe(500);
  });

  it('returns one local day when called exactly at midnight', () => {
    expect(millisecondsUntilNextLocalMidnight(new Date(2026, 8, 22, 0, 0, 0, 0)))
      .toBe(new Date(2026, 8, 23, 0, 0, 0, 0).getTime() - new Date(2026, 8, 22, 0, 0, 0, 0).getTime());
  });
});
