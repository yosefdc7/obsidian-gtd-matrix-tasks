import { describe, it, expect } from 'vitest';
import {
  detectSuggestTrigger,
  filterVaultFiles,
  filterTags,
  computeReplacement
} from '../src/view/inline-suggest';

describe('detectSuggestTrigger', () => {
  it('detects wikilink trigger with empty query', () => {
    const trigger = detectSuggestTrigger('See notes [[');
    expect(trigger).toEqual({
      type: 'wikilink',
      query: '',
      replaceStart: 10
    });
  });

  it('detects wikilink trigger with partial query', () => {
    const trigger = detectSuggestTrigger('Important task [[Proje');
    expect(trigger).toEqual({
      type: 'wikilink',
      query: 'Proje',
      replaceStart: 15
    });
  });

  it('detects wikilink at start of input', () => {
    const trigger = detectSuggestTrigger('[[My Note');
    expect(trigger).toEqual({
      type: 'wikilink',
      query: 'My Note',
      replaceStart: 0
    });
  });

  it('does not trigger on completed wikilink', () => {
    const trigger = detectSuggestTrigger('See [[My Note]] and then');
    expect(trigger).toBeNull();
  });

  it('detects tag trigger at start of input', () => {
    const trigger = detectSuggestTrigger('#work');
    expect(trigger).toEqual({
      type: 'tag',
      query: 'work',
      replaceStart: 0
    });
  });

  it('detects tag trigger after space', () => {
    const trigger = detectSuggestTrigger('finish review #role/yo');
    expect(trigger).toEqual({
      type: 'tag',
      query: 'role/yo',
      replaceStart: 14
    });
  });

  it('detects tag trigger with empty query right after hash', () => {
    const trigger = detectSuggestTrigger('task #');
    expect(trigger).toEqual({
      type: 'tag',
      query: '',
      replaceStart: 5
    });
  });

  it('returns null when not in wikilink or tag', () => {
    expect(detectSuggestTrigger('regular task description')).toBeNull();
    expect(detectSuggestTrigger('task with #tag already finished ')).toBeNull();
  });
});

describe('filterVaultFiles', () => {
  const sampleFiles = [
    'References/Topics/Trading.md',
    'References/Projects/Alpha Project.md',
    'Projects/Beta Project.md',
    'Roles/Yo Manager.md',
    'README.md',
    'image.png'
  ];

  it('ignores non-markdown files', () => {
    const results = filterVaultFiles(sampleFiles, '');
    expect(results.some((r) => r.title.includes('png'))).toBe(false);
  });

  it('returns all markdown files when query is empty', () => {
    const results = filterVaultFiles(sampleFiles, '');
    expect(results.length).toBe(5);
  });

  it('ranks title startsWith before path match', () => {
    const results = filterVaultFiles(sampleFiles, 'beta');
    expect(results[0].title).toBe('Beta Project');
  });

  it('extracts folder as subText', () => {
    const results = filterVaultFiles(sampleFiles, 'Trading');
    expect(results[0]).toEqual({
      title: 'Trading',
      subText: 'References/Topics',
      value: 'Trading',
      type: 'wikilink'
    });
  });
});

describe('filterTags', () => {
  const sampleTags = ['#role/yo-manager', '#work', '#urgent', '#role/josef-selfcare'];

  it('strips leading hashes and matches prefix', () => {
    const results = filterTags(sampleTags, 'role');
    expect(results.length).toBe(2);
    expect(results[0].title).toBe('#role/josef-selfcare');
    expect(results[1].title).toBe('#role/yo-manager');
  });

  it('returns all tags sorted when query is empty', () => {
    const results = filterTags(sampleTags, '');
    expect(results.length).toBe(4);
  });
});

describe('computeReplacement', () => {
  it('replaces wikilink query and closes brackets', () => {
    const fullText = 'Check [[proj and call later';
    // cursor is at 12 (after 'proj'), replaceStart is 6 (at '[')
    const { newText, newCursor } = computeReplacement(fullText, 12, 6, 'wikilink', 'Project Alpha');
    expect(newText).toBe('Check [[Project Alpha]] and call later');
    expect(newCursor).toBe('Check [[Project Alpha]]'.length);
  });

  it('does not duplicate closing brackets if already present', () => {
    const fullText = 'Check [[proj]] and call later';
    const { newText, newCursor } = computeReplacement(fullText, 12, 6, 'wikilink', 'Project Alpha');
    expect(newText).toBe('Check [[Project Alpha]] and call later');
    expect(newCursor).toBe('Check [[Project Alpha]]'.length);
  });

  it('replaces tag query with space after', () => {
    const fullText = 'Call #yo for update';
    // cursor at 8 (after 'yo'), replaceStart at 5 (at '#')
    const { newText, newCursor } = computeReplacement(fullText, 8, 5, 'tag', 'role/yo-manager');
    expect(newText).toBe('Call #role/yo-manager  for update');
    expect(newCursor).toBe('Call #role/yo-manager '.length);
  });
});
