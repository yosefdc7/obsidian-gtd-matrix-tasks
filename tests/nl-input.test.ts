import { describe, it, expect } from 'vitest';
import { parseNaturalLanguageInput, previewDestinationLabel } from '../src/nl-input';

const TODAY = '2026-09-15';

describe('parseNaturalLanguageInput', () => {
  it('resolves date tokens relative to today', () => {
    expect(parseNaturalLanguageInput('Call mom today', TODAY).scheduledDate).toBe('2026-09-15');
    expect(parseNaturalLanguageInput('Call mom tomorrow', TODAY).scheduledDate).toBe('2026-09-16');
    expect(parseNaturalLanguageInput('Call mom next week', TODAY).scheduledDate).toBe('2026-09-22');
  });

  it('maps p1–p4 to priorities', () => {
    expect(parseNaturalLanguageInput('Task p1', TODAY).priority).toBe('highest');
    expect(parseNaturalLanguageInput('Task p2', TODAY).priority).toBe('high');
    expect(parseNaturalLanguageInput('Task p3', TODAY).priority).toBe('medium');
    expect(parseNaturalLanguageInput('Task p4', TODAY).priority).toBe('low');
  });

  it('maps hash role tokens', () => {
    expect(parseNaturalLanguageInput('Review #yo', TODAY).role).toBe('role/yo-manager');
    expect(parseNaturalLanguageInput('Review #yomanager', TODAY).role).toBe('role/yo-manager');
    expect(parseNaturalLanguageInput('Review #josef', TODAY).role).toBe('role/josef-selfcare');
    expect(parseNaturalLanguageInput('Review #josefselfcare', TODAY).role).toBe('role/josef-selfcare');
    expect(parseNaturalLanguageInput('Review #rj', TODAY).role).toBe('role/rj-supportive');
    expect(parseNaturalLanguageInput('Review #rjsupportive', TODAY).role).toBe('role/rj-supportive');
    expect(parseNaturalLanguageInput('Review #untagged', TODAY).role).toBe('untagged');
  });

  it('maps phrase role tokens', () => {
    expect(parseNaturalLanguageInput('Review yo manager', TODAY).role).toBe('role/yo-manager');
    expect(parseNaturalLanguageInput('Review josef self-care', TODAY).role).toBe('role/josef-selfcare');
    expect(parseNaturalLanguageInput('Review josef selfcare', TODAY).role).toBe('role/josef-selfcare');
    expect(parseNaturalLanguageInput('Review rj supportive', TODAY).role).toBe('role/rj-supportive');
  });

  it('parses the combined example', () => {
    const parsed = parseNaturalLanguageInput('Pay internet bill tomorrow p1 #rj', TODAY);

    expect(parsed).toEqual({
      description: 'Pay internet bill',
      scheduledDate: '2026-09-16',
      priority: 'highest',
      role: 'role/rj-supportive'
    });
  });

  it('is case-insensitive', () => {
    const parsed = parseNaturalLanguageInput('Review PR TOMORROW P2 #RJ', TODAY);

    expect(parsed.description).toBe('Review PR');
    expect(parsed.scheduledDate).toBe('2026-09-16');
    expect(parsed.priority).toBe('high');
    expect(parsed.role).toBe('role/rj-supportive');
  });

  it('keeps unknown tokens in the text', () => {
    const parsed = parseNaturalLanguageInput('Buy milk p5 #foo', TODAY);

    expect(parsed.description).toBe('Buy milk p5 #foo');
    expect(parsed.scheduledDate).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.role).toBeNull();
  });

  it('honors word boundaries and partial-token guards', () => {
    const parsed = parseNaturalLanguageInput('tomorrowland p10 #yofoo', TODAY);

    expect(parsed.description).toBe('tomorrowland p10 #yofoo');
    expect(parsed.scheduledDate).toBeNull();
    expect(parsed.priority).toBeNull();
    expect(parsed.role).toBeNull();
  });

  it('falls back to the original trimmed input when stripping empties the title', () => {
    const parsed = parseNaturalLanguageInput('  tomorrow p1  ', TODAY);

    expect(parsed.description).toBe('tomorrow p1');
    expect(parsed.scheduledDate).toBe('2026-09-16');
    expect(parsed.priority).toBe('highest');
  });

  it('strips tokens anywhere in the text and normalizes whitespace', () => {
    const parsed = parseNaturalLanguageInput('today   Review   the PR  #josef', TODAY);

    expect(parsed.description).toBe('Review the PR');
    expect(parsed.scheduledDate).toBe('2026-09-15');
    expect(parsed.role).toBe('role/josef-selfcare');
  });
});

describe('previewDestinationLabel', () => {
  const parsed = (text: string) => parseNaturalLanguageInput(text, TODAY);

  it('routes GTD labels through the real classifier', () => {
    expect(previewDestinationLabel(parsed('Call mom'), 'gtd', TODAY, 'scheduled')).toBe('Inbox');
    expect(previewDestinationLabel(parsed('Call mom today'), 'gtd', TODAY, 'scheduled')).toBe(
      'Next Actions'
    );
    expect(previewDestinationLabel(parsed('Call mom next week'), 'gtd', TODAY, 'scheduled')).toBe(
      'Scheduled'
    );
    expect(previewDestinationLabel(parsed('Call mom p1'), 'gtd', TODAY, 'scheduled')).toBe(
      'Next Actions'
    );
  });

  it('routes Eisenhower labels through the real classifier', () => {
    expect(previewDestinationLabel(parsed('Fix outage p1'), 'eisenhower', TODAY, 'scheduled')).toBe('Q1');
    expect(previewDestinationLabel(parsed('Fix outage p2'), 'eisenhower', TODAY, 'scheduled')).toBe('Q2');
    expect(previewDestinationLabel(parsed('Fix outage p3'), 'eisenhower', TODAY, 'scheduled')).toBe('Q3');
    expect(previewDestinationLabel(parsed('Fix outage p4'), 'eisenhower', TODAY, 'scheduled')).toBe('Q4');
    expect(previewDestinationLabel(parsed('Fix outage'), 'eisenhower', TODAY, 'scheduled')).toBe('Inbox');
  });

  it('routes By Date labels through the real day-bucket titles', () => {
    expect(previewDestinationLabel(parsed('Call mom today'), 'date', TODAY, 'scheduled')).toBe('Today');
    expect(previewDestinationLabel(parsed('Call mom tomorrow'), 'date', TODAY, 'scheduled')).toBe(
      'Tomorrow'
    );
    expect(previewDestinationLabel(parsed('Call mom'), 'date', TODAY, 'scheduled')).toBe('Undated');
  });
});
