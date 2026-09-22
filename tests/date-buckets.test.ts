import { describe, it, expect } from 'vitest';
import { parseTaskLine } from '../src/parser';
import {
  buildDateBuckets,
  createDefaultCollapsedSections,
  dateBucketDayId,
  getDateBucketEmphasis,
  getAnchorDate,
  getDateBucketId,
  groupByDateBucket,
  DATE_BUCKET_COMPLETED,
  DATE_BUCKET_LATER,
  DATE_BUCKET_NEXT_WEEK,
  DATE_BUCKET_PAST,
  DATE_BUCKET_SOMEDAY,
  DATE_BUCKET_SOON,
  DATE_BUCKET_UNDATED
} from '../src/view/date-buckets';
import { DateAnchorField, TaskItem } from '../src/types';

const TODAY = '2026-09-15';
const HORIZON_TODAY = '2026-09-22';

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

  it('routes every Tuesday horizon boundary without gaps', () => {
    const cases: Array<[string, string]> = [
      ['2026-09-21', DATE_BUCKET_PAST],
      ['2026-09-22', dateBucketDayId('2026-09-22')],
      ['2026-09-23', dateBucketDayId('2026-09-23')],
      ['2026-09-24', DATE_BUCKET_LATER],
      ['2026-09-27', DATE_BUCKET_LATER],
      ['2026-09-28', DATE_BUCKET_NEXT_WEEK],
      ['2026-10-04', DATE_BUCKET_NEXT_WEEK],
      ['2026-10-05', DATE_BUCKET_SOON],
      ['2026-12-21', DATE_BUCKET_SOON],
      ['2026-12-22', DATE_BUCKET_SOMEDAY]
    ];

    for (const [date, expectedBucket] of cases) {
      expect(getDateBucketId(makeTask(`- [ ] Task 📅 ${date}`), 'scheduled', HORIZON_TODAY))
        .toBe(expectedBucket);
    }
  });

  it('gives Tomorrow precedence over Next Week when Today is Sunday', () => {
    const sunday = '2026-09-27';
    expect(getDateBucketId(makeTask('- [ ] Monday 📅 2026-09-28'), 'scheduled', sunday))
      .toBe(dateBucketDayId('2026-09-28'));
    expect(getDateBucketId(makeTask('- [ ] Tuesday 📅 2026-09-29'), 'scheduled', sunday))
      .toBe(DATE_BUCKET_NEXT_WEEK);
    expect(getDateBucketId(makeTask('- [ ] Sunday 📅 2026-10-04'), 'scheduled', sunday))
      .toBe(DATE_BUCKET_NEXT_WEEK);
    expect(getDateBucketId(makeTask('- [ ] Following Monday 📅 2026-10-05'), 'scheduled', sunday))
      .toBe(DATE_BUCKET_SOON);
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
    expect(getDateBucketId(task, 'scheduled', TODAY)).toBe(DATE_BUCKET_LATER);
    expect(getDateBucketId(task, 'start', TODAY)).toBe(DATE_BUCKET_PAST);
  });
});

describe('buildDateBuckets', () => {
  it('builds nine buckets in the approved order with visible range labels', () => {
    const buckets = buildDateBuckets(HORIZON_TODAY);
    expect(buckets.map((bucket) => bucket.id)).toEqual([
      DATE_BUCKET_PAST,
      dateBucketDayId('2026-09-22'),
      dateBucketDayId('2026-09-23'),
      DATE_BUCKET_LATER,
      DATE_BUCKET_NEXT_WEEK,
      DATE_BUCKET_SOON,
      DATE_BUCKET_SOMEDAY,
      DATE_BUCKET_UNDATED,
      DATE_BUCKET_COMPLETED
    ]);
    expect(buckets.map((bucket) => bucket.rangeLabel)).toEqual([
      null,
      null,
      null,
      'Sep 24–27',
      'Sep 28–Oct 4',
      'Oct 5–Dec 21',
      'Dec 22 onward',
      null,
      null
    ]);
  });

  it('shrinks the Sunday Next Week label after Tomorrow takes Monday', () => {
    const buckets = buildDateBuckets('2026-09-27');
    expect(buckets.find((bucket) => bucket.id === DATE_BUCKET_LATER)?.rangeLabel).toBeNull();
    expect(buckets.find((bucket) => bucket.id === DATE_BUCKET_NEXT_WEEK)?.rangeLabel)
      .toBe('Sep 29–Oct 4');
  });

  it('marks only Today and Tomorrow as exact-date drop targets', () => {
    const buckets = buildDateBuckets(HORIZON_TODAY);
    expect(buckets.filter((bucket) => bucket.dayDate !== null).map((bucket) => bucket.dayDate))
      .toEqual(['2026-09-22', '2026-09-23']);
  });

  it('identifies only Today and Tomorrow for restrained header emphasis', () => {
    const buckets = buildDateBuckets(TODAY);
    expect(getDateBucketEmphasis(buckets[1], TODAY)).toBe('current-day');
    expect(getDateBucketEmphasis(buckets[2], TODAY)).toBe('current-day');
    expect(getDateBucketEmphasis(buckets[3], TODAY)).toBeNull();
    expect(getDateBucketEmphasis(buckets[0], TODAY)).toBeNull();
  });
});

describe('createDefaultCollapsedSections', () => {
  it('starts every Completed group collapsed without collapsing other work', () => {
    const collapsed = createDefaultCollapsedSections();
    expect(collapsed).toEqual(new Set([
      DATE_BUCKET_COMPLETED,
      'gtd-completed',
      'eisen-completed'
    ]));
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

    const grouped = groupByDateBucket([later, sooner, overdue, undated, doneToday, doneOld], 'scheduled', TODAY);

    expect(grouped.size).toBe(9);
    expect(grouped.get(dateBucketDayId('2026-09-16'))).toEqual([sooner]);
    expect(grouped.get(DATE_BUCKET_LATER)).toEqual([later]);
    expect(grouped.get(DATE_BUCKET_PAST)).toEqual([overdue]);
    expect(grouped.get(DATE_BUCKET_UNDATED)).toEqual([undated]);
    expect(grouped.get(DATE_BUCKET_COMPLETED)).toEqual([doneToday]);

    const all = [...grouped.values()].flat();
    expect(all).not.toContain(doneOld);
  });

  it('sorts within a bucket by the sort criteria', () => {
    const lowPrio = makeTask('- [ ] Low 📅 2026-09-17');
    const highPrio = makeTask('- [ ] High 📅 2026-09-17 ⏫');
    const grouped = groupByDateBucket([lowPrio, highPrio], 'scheduled', TODAY);
    expect(grouped.get(DATE_BUCKET_LATER)).toEqual([lowPrio, highPrio]);
  });

  it('moves tasks between buckets when the anchor field changes', () => {
    const task = makeTask('- [ ] A ⏳ 2026-09-20 🛫 2026-09-10');
    const byScheduled = groupByDateBucket([task], 'scheduled', TODAY);
    expect(byScheduled.get(DATE_BUCKET_LATER)).toEqual([task]);

    const byStart = groupByDateBucket([task], 'start', TODAY);
    expect(byStart.get(DATE_BUCKET_PAST)).toEqual([task]);
  });
});
