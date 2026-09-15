import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../src/parser';
import {
  buildDateBuckets,
  dateBucketDayId,
  getAnchorDate,
  getDateBucketId,
  groupByDateBucket,
  DATE_BUCKET_COMPLETED,
  DATE_BUCKET_PAST,
  DATE_BUCKET_SOMEDAY,
  DATE_BUCKET_SOON,
  DATE_BUCKET_UNDATED
} from '../src/view/date-buckets';
import { DateAnchorField, TaskItem } from '../src/types';

const TODAY = '2026-09-15';

function makeTask(line: string, overrides: Partial<TaskItem> = {}): TaskItem {
  const task = parseTaskLine(line, 'Jots/2026/Sep/Sep 15 2026.md', 0);
  if (!task) throw new Error(`Unparseable task line: ${line}`);
  return { ...task, ...overrides };
}

describe('getAnchorDate', () => {
  it('uses the chosen field when set', () => {
    const task = makeTask('- [ ] A ⏳ 2026-09-20 📅 2026-09-25 🛫 2026-09-18');
    expect(getAnchorDate(task, 'start')).toBe('2026-09-18');
    expect(getAnchorDate(task, 'scheduled')).toBe('2026-09-20');
    expect(getAnchorDate(task, 'due')).toBe('2026-09-25');
  });

  it('falls back in Scheduled → Due → Start order when the chosen field is empty', () => {
    const noStart = makeTask('- [ ] A ⏳ 2026-09-20 📅 2026-09-25');
    expect(getAnchorDate(noStart, 'start')).toBe('2026-09-20');

    const noScheduledOrDue = makeTask('- [ ] B 🛫 2026-09-18');
    expect(getAnchorDate(noScheduledOrDue, 'due')).toBe('2026-09-18');

    const onlyDue = makeTask('- [ ] C 📅 2026-09-25');
    expect(getAnchorDate(onlyDue, 'scheduled')).toBe('2026-09-25');
  });

  it('returns null only for fully dateless tasks', () => {
    const dateless = makeTask('- [ ] No dates');
    expect(getAnchorDate(dateless, 'scheduled')).toBeNull();
  });
});

describe('getDateBucketId', () => {
  const anchors: DateAnchorField = 'scheduled';

  it('routes past, today, and +7 into their buckets', () => {
    expect(getDateBucketId(makeTask('- [ ] A 📅 2026-09-14'), anchors, TODAY)).toBe(DATE_BUCKET_PAST);
    expect(getDateBucketId(makeTask('- [ ] B 📅 2026-09-15'), anchors, TODAY)).toBe(
      dateBucketDayId('2026-09-15')
    );
    expect(getDateBucketId(makeTask('- [ ] C 📅 2026-09-22'), anchors, TODAY)).toBe(
      dateBucketDayId('2026-09-22')
    );
  });

  it('routes +8 and +90 into Soon, +91 into Someday', () => {
    expect(getDateBucketId(makeTask('- [ ] A 📅 2026-09-23'), anchors, TODAY)).toBe(DATE_BUCKET_SOON);
    expect(getDateBucketId(makeTask('- [ ] B 📅 2026-12-14'), anchors, TODAY)).toBe(DATE_BUCKET_SOON);
    expect(getDateBucketId(makeTask('- [ ] C 📅 2026-12-15'), anchors, TODAY)).toBe(DATE_BUCKET_SOMEDAY);
  });

  it('routes dateless tasks into Undated', () => {
    expect(getDateBucketId(makeTask('- [ ] No dates'), anchors, TODAY)).toBe(DATE_BUCKET_UNDATED);
  });

  it('shows only today-completed tasks in the completed bucket', () => {
    const doneToday = makeTask('- [x] Done ✅ 2026-09-15');
    const doneOld = makeTask('- [x] Done long ago ✅ 2026-09-01');
    expect(getDateBucketId(doneToday, anchors, TODAY)).toBe(DATE_BUCKET_COMPLETED);
    expect(getDateBucketId(doneOld, anchors, TODAY)).toBeNull();
  });

  it('respects the chosen anchor field', () => {
    const task = makeTask('- [ ] A ⏳ 2026-09-20 🛫 2026-09-11');
    expect(getDateBucketId(task, 'scheduled', TODAY)).toBe(dateBucketDayId('2026-09-20'));
    expect(getDateBucketId(task, 'start', TODAY)).toBe(DATE_BUCKET_PAST);
  });
});

describe('buildDateBuckets', () => {
  it('builds 13 buckets in chronological order', () => {
    const buckets = buildDateBuckets(TODAY);
    expect(buckets).toHaveLength(13);
    expect(buckets[0].id).toBe(DATE_BUCKET_PAST);

    const dayDates = buckets.slice(1, 9).map((b) => b.dayDate);
    expect(dayDates).toEqual([
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
      '2026-09-22'
    ]);

    expect(buckets[9].id).toBe(DATE_BUCKET_SOON);
    expect(buckets[10].id).toBe(DATE_BUCKET_SOMEDAY);
    expect(buckets[11].id).toBe(DATE_BUCKET_UNDATED);
    expect(buckets[12].id).toBe(DATE_BUCKET_COMPLETED);
  });

  it('labels the first two day buckets Today and Tomorrow', () => {
    const buckets = buildDateBuckets(TODAY);
    expect(buckets[1].title.startsWith('Today')).toBe(true);
    expect(buckets[2].title.startsWith('Tomorrow')).toBe(true);
    expect(buckets[3].title.startsWith('Thu')).toBe(true);
  });

  it('marks only day buckets as drop targets', () => {
    const buckets = buildDateBuckets(TODAY);
    const droppable = buckets.filter((b) => b.dayDate !== null);
    expect(droppable).toHaveLength(8);
    expect(buckets[0].dayDate).toBeNull();
    expect(buckets[12].dayDate).toBeNull();
  });
});

describe('groupByDateBucket', () => {
  it('initializes every bucket and places tasks pre-sorted', () => {
    const later = makeTask('- [ ] Later 📅 2026-09-18');
    const sooner = makeTask('- [ ] Sooner 📅 2026-09-16');
    const overdue = makeTask('- [ ] Overdue 📅 2026-09-01');
    const undated = makeTask('- [ ] No dates');
    const doneToday = makeTask('- [x] Done ✅ 2026-09-15');
    const doneOld = makeTask('- [x] Ancient ✅ 2026-08-01');

    const grouped = groupByDateBucket(
      [later, sooner, overdue, undated, doneToday, doneOld],
      'scheduled',
      TODAY,
      'date'
    );

    expect(grouped.size).toBe(13);
    expect(grouped.get(dateBucketDayId('2026-09-16'))).toEqual([sooner]);
    expect(grouped.get(dateBucketDayId('2026-09-18'))).toEqual([later]);
    expect(grouped.get(DATE_BUCKET_PAST)).toEqual([overdue]);
    expect(grouped.get(DATE_BUCKET_UNDATED)).toEqual([undated]);
    expect(grouped.get(DATE_BUCKET_COMPLETED)).toEqual([doneToday]);

    const all = [...grouped.values()].flat();
    expect(all).not.toContain(doneOld);
  });

  it('sorts within a bucket by the sort criteria', () => {
    const lowPrio = makeTask('- [ ] Low 📅 2026-09-17');
    const highPrio = makeTask('- [ ] High 📅 2026-09-17 ⏫');
    const grouped = groupByDateBucket([lowPrio, highPrio], 'scheduled', TODAY, 'priority');
    expect(grouped.get(dateBucketDayId('2026-09-17'))).toEqual([highPrio, lowPrio]);
  });

  it('moves tasks between buckets when the anchor field changes', () => {
    const task = makeTask('- [ ] A ⏳ 2026-09-20 🛫 2026-09-10');
    const byScheduled = groupByDateBucket([task], 'scheduled', TODAY, 'date');
    expect(byScheduled.get(dateBucketDayId('2026-09-20'))).toEqual([task]);

    const byStart = groupByDateBucket([task], 'start', TODAY, 'date');
    expect(byStart.get(DATE_BUCKET_PAST)).toEqual([task]);
  });
});
