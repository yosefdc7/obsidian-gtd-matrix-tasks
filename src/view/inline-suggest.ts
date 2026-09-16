import { setIcon, type App, type TFile } from 'obsidian';

export interface SuggestTrigger {
  type: 'wikilink' | 'tag';
  query: string;
  replaceStart: number;
}

export interface SuggestItem {
  title: string;
  subText?: string;
  value: string;
  type: 'wikilink' | 'tag';
}

/**
 * Detects if the cursor is in a wikilink (`[[...`) or tag (`#...`) trigger.
 */
export function detectSuggestTrigger(textBeforeCursor: string): SuggestTrigger | null {
  // Check wikilink trigger first: e.g. "task [[Note" or "[["
  const wikiMatch = textBeforeCursor.match(/(?:^|[^\w\]])\[\[([^\]\r\n]*)$/);
  if (wikiMatch) {
    const query = wikiMatch[1];
    // replaceStart is the index of the first '['
    const replaceStart = wikiMatch.index! + (wikiMatch[0].length - query.length - 2);
    return {
      type: 'wikilink',
      query,
      replaceStart
    };
  }

  // Check tag trigger: e.g. "task #work" or "#tag"
  const tagMatch = textBeforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_\-\/]*)$/);
  if (tagMatch) {
    const query = tagMatch[1];
    // replaceStart is the index of '#'
    const replaceStart = tagMatch.index! + (tagMatch[0].startsWith(' ') ? 1 : 0);
    return {
      type: 'tag',
      query,
      replaceStart
    };
  }

  return null;
}

/**
 * Filters and ranks vault files for wikilink autocomplete.
 */
export function filterVaultFiles(
  filePaths: string[],
  query: string,
  maxResults = 12
): SuggestItem[] {
  const cleanQuery = query.trim().toLowerCase();
  const candidates: { title: string; subText?: string; value: string; score: number }[] = [];

  for (const rawPath of filePaths) {
    // Only suggest markdown files
    if (!rawPath.endsWith('.md')) continue;

    const pathWithoutExt = rawPath.replace(/\.md$/, '');
    const parts = pathWithoutExt.split('/');
    const title = parts[parts.length - 1];
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;

    const titleLower = title.toLowerCase();
    const pathLower = pathWithoutExt.toLowerCase();

    if (!cleanQuery) {
      candidates.push({
        title,
        subText: folder,
        value: title,
        score: 100
      });
      continue;
    }

    if (titleLower === cleanQuery) {
      candidates.push({ title, subText: folder, value: title, score: 0 });
    } else if (titleLower.startsWith(cleanQuery)) {
      candidates.push({ title, subText: folder, value: title, score: 1 });
    } else if (titleLower.includes(cleanQuery)) {
      candidates.push({ title, subText: folder, value: title, score: 2 });
    } else if (pathLower.includes(cleanQuery)) {
      candidates.push({ title, subText: folder, value: title, score: 3 });
    }
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.title.localeCompare(b.title);
  });

  return candidates.slice(0, maxResults).map((c) => ({
    title: c.title,
    subText: c.subText,
    value: c.value,
    type: 'wikilink'
  }));
}

/**
 * Filters vault tags for tag autocomplete.
 */
export function filterTags(
  rawTags: string[],
  query: string,
  maxResults = 12
): SuggestItem[] {
  const cleanQuery = query.trim().toLowerCase();
  const normalizedTags = Array.from(
    new Set(
      rawTags.map((t) => (t.startsWith('#') ? t.slice(1) : t)).filter(Boolean)
    )
  );

  const candidates: { tag: string; score: number }[] = [];

  for (const tag of normalizedTags) {
    const tagLower = tag.toLowerCase();
    if (!cleanQuery) {
      candidates.push({ tag, score: 100 });
      continue;
    }

    if (tagLower === cleanQuery) {
      candidates.push({ tag, score: 0 });
    } else if (tagLower.startsWith(cleanQuery)) {
      candidates.push({ tag, score: 1 });
    } else if (tagLower.includes(cleanQuery)) {
      candidates.push({ tag, score: 2 });
    }
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.tag.localeCompare(b.tag);
  });

  return candidates.slice(0, maxResults).map((c) => ({
    title: `#${c.tag}`,
    value: c.tag,
    type: 'tag'
  }));
}

/**
 * Computes replacement text and new cursor offset when a suggestion is applied.
 */
export function computeReplacement(
  fullText: string,
  cursor: number,
  replaceStart: number,
  type: 'wikilink' | 'tag',
  value: string
): { newText: string; newCursor: number } {
  const before = fullText.slice(0, replaceStart);
  const after = fullText.slice(cursor);

  if (type === 'wikilink') {
    const hasClosingBrackets = after.startsWith(']]');
    const tail = hasClosingBrackets ? after.slice(2) : after;
    const inserted = `[[${value}]]`;
    return {
      newText: `${before}${inserted}${tail}`,
      newCursor: before.length + inserted.length
    };
  } else {
    const inserted = `#${value} `;
    return {
      newText: `${before}${inserted}${after}`,
      newCursor: before.length + inserted.length
    };
  }
}

export interface InlineSuggestHandle {
  destroy: () => void;
  isOpen: () => boolean;
}

/**
 * Attaches custom inline auto-complete popover to an HTMLInputElement for wikilinks and tags.
 */
export function attachInlineSuggest(input: HTMLInputElement, app: App): InlineSuggestHandle {
  let popover: HTMLElement | null = null;
  let currentItems: SuggestItem[] = [];
  let selectedIndex = 0;
  let activeTrigger: SuggestTrigger | null = null;

  function isOpen(): boolean {
    return popover !== null && currentItems.length > 0;
  }

  function getAvailableFiles(): string[] {
    if (app?.vault?.getMarkdownFiles) {
      const files: TFile[] = app.vault.getMarkdownFiles();
      if (files && files.length > 0) {
        return files.map((f) => f.path);
      }
    }
    const metaCache = app?.metadataCache as any;
    if (metaCache?.getCachedFiles) {
      return metaCache.getCachedFiles();
    }
    return [];
  }

  function getAvailableTags(): string[] {
    const metaCache = app?.metadataCache as any;
    if (metaCache?.getTags) {
      const tagsObj = metaCache.getTags();
      if (tagsObj) {
        return Object.keys(tagsObj);
      }
    }
    return [];
  }

  function closePopover(): void {
    if (popover) {
      popover.remove();
      popover = null;
    }
    currentItems = [];
    selectedIndex = 0;
    activeTrigger = null;
  }

  function renderPopover(): void {
    if (currentItems.length === 0) {
      closePopover();
      return;
    }

    if (!popover) {
      popover = document.createElement('div');
      popover.className = 'gtd-suggest-popover';
      popover.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });
      document.body.appendChild(popover);
    }

    popover.empty();

    const rect = input.getBoundingClientRect();
    const top = rect.bottom + window.scrollY + 4;
    const left = rect.left + window.scrollX;
    const minWidth = Math.max(220, rect.width);

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    popover.style.minWidth = `${minWidth}px`;

    currentItems.forEach((item, index) => {
      const itemEl = popover!.createDiv({
        cls: `gtd-suggest-item ${index === selectedIndex ? 'is-selected' : ''}`
      });

      const iconEl = itemEl.createSpan({ cls: 'gtd-suggest-icon' });
      if (item.type === 'wikilink') {
        setIcon(iconEl, 'file-text');
      } else {
        setIcon(iconEl, 'tag');
      }

      const contentEl = itemEl.createDiv({ cls: 'gtd-suggest-content' });
      contentEl.createSpan({ cls: 'gtd-suggest-title', text: item.title });
      if (item.subText) {
        contentEl.createSpan({ cls: 'gtd-suggest-sub', text: item.subText });
      }

      itemEl.addEventListener('mouseenter', () => {
        selectedIndex = index;
        updateSelectedClass();
      });

      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        applySelection(item);
      });
    });

    scrollSelectedIntoView();
  }

  function updateSelectedClass(): void {
    if (!popover) return;
    const items = popover.querySelectorAll('.gtd-suggest-item');
    items.forEach((el, idx) => {
      if (idx === selectedIndex) {
        el.addClass('is-selected');
      } else {
        el.removeClass('is-selected');
      }
    });
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView(): void {
    if (!popover) return;
    const activeEl = popover.querySelector('.gtd-suggest-item.is-selected') as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function applySelection(item: SuggestItem): void {
    if (!activeTrigger) return;
    const cursor = input.selectionStart ?? input.value.length;
    const { newText, newCursor } = computeReplacement(
      input.value,
      cursor,
      activeTrigger.replaceStart,
      item.type,
      item.value
    );

    input.value = newText;
    input.setSelectionRange(newCursor, newCursor);
    closePopover();

    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function updateSuggestions(): void {
    const cursor = input.selectionStart ?? input.value.length;
    const textBefore = input.value.slice(0, cursor);
    const trigger = detectSuggestTrigger(textBefore);

    if (!trigger) {
      closePopover();
      return;
    }

    activeTrigger = trigger;
    selectedIndex = 0;

    if (trigger.type === 'wikilink') {
      const files = getAvailableFiles();
      currentItems = filterVaultFiles(files, trigger.query);
    } else {
      const tags = getAvailableTags();
      currentItems = filterTags(tags, trigger.query);
    }

    renderPopover();
  }

  function onInput(): void {
    updateSuggestions();
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (!isOpen()) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedIndex = (selectedIndex + 1) % currentItems.length;
      updateSelectedClass();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectedIndex = (selectedIndex - 1 + currentItems.length) % currentItems.length;
      updateSelectedClass();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (currentItems[selectedIndex]) {
        applySelection(currentItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closePopover();
    }
  }

  function onBlur(): void {
    setTimeout(() => {
      closePopover();
    }, 150);
  }

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown, true);
  input.addEventListener('blur', onBlur);

  return {
    destroy: () => {
      closePopover();
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onKeyDown, true);
      input.removeEventListener('blur', onBlur);
    },
    isOpen
  };
}
