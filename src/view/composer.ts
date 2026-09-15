import { setIcon } from 'obsidian';
import { parseNaturalLanguageInput } from '../nl-input';
import type { ParsedInput } from '../nl-input';
import type { RoleId, SectionId, TaskPriority } from '../types';
import { buildDateBuckets } from './date-buckets';
import { getSectionShortTitle } from './types';
import type { ViewContext } from './types';

const NL_HINT =
  'Natural language: today · tomorrow · next week · p1–p4 · #yo #josef #rj #untagged';

const PRIORITY_CHIP_TEXT: Record<string, string> = {
  highest: 'P1',
  high: 'P2',
  medium: 'P3',
  low: 'P4'
};

const PRIORITY_CHIP_TITLE: Record<string, string> = {
  highest: 'Urgent · Important',
  high: 'Important',
  medium: 'Urgent',
  low: 'Low Priority'
};

const ROLE_LABELS: Record<RoleId, string> = {
  'role/yo-manager': 'Yo Manager',
  'role/josef-selfcare': 'Josef Self-Care',
  'role/rj-supportive': 'RJ Supportive',
  untagged: 'Untagged'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateChipLabel(dateStr: string, todayStr: string): string {
  const bucket = buildDateBuckets(todayStr).find((b) => b.dayDate === dateStr);
  if (bucket) return `⏳ ${bucket.title.split('—')[0].trim()}`;
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `⏳ ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Parse-preview chips under a quick-add input: date chip, priority chip,
 * role dot chip and the "Add to …" destination chip. Pass parsed=null for
 * the natural-language hint line. Typing only re-renders this container —
 * no setState — so focus and text survive each keystroke.
 */
export function renderParseChips(
  container: HTMLElement,
  parsed: ParsedInput | null,
  destLabel: string,
  todayStr: string
): void {
  container.empty();

  if (!parsed) {
    container.createSpan({ cls: 'gtd-nl-hint', text: NL_HINT });
    return;
  }

  if (parsed.scheduledDate) {
    container.createSpan({
      cls: 'gtd-nl-chip gtd-nl-chip-date',
      text: dateChipLabel(parsed.scheduledDate, todayStr)
    });
  }

  if (parsed.priority) {
    const chip = container.createSpan({
      cls: `gtd-nl-chip gtd-nl-chip-pri pri-${parsed.priority}`
    });
    chip.title = `Priority: ${PRIORITY_CHIP_TITLE[parsed.priority]}`;
    const icon = chip.createSpan({ cls: 'gtd-nl-chip-icon' });
    setIcon(icon, 'flag');
    chip.createSpan({ cls: 'gtd-nl-chip-label', text: PRIORITY_CHIP_TEXT[parsed.priority] });
  }

  if (parsed.role) {
    const chip = container.createSpan({
      cls: `gtd-nl-chip gtd-nl-chip-role role-${parsed.role.replace('role/', '')}`
    });
    chip.createSpan({ cls: 'gtd-nl-chip-dot' });
    chip.createSpan({ cls: 'gtd-nl-chip-label', text: ROLE_LABELS[parsed.role] });
  }

  container.createSpan({ cls: 'gtd-nl-chip gtd-nl-chip-dest', text: `⏎ Add to ${destLabel}` });
}

interface ComposerOptions {
  destLabel: string;
  placeholder: string;
  /** Collapsed mode (list sections): a "+ Add task" button reveals the editor. */
  collapsed: boolean;
  /** Show the natural-language hint while the editor is empty (list sections). */
  hintWhenEmpty: boolean;
  commit(parsed: ParsedInput): Promise<unknown>;
}

function renderComposer(host: HTMLElement, ctx: ViewContext, opts: ComposerOptions): void {
  const row = host.createDiv({ cls: 'gtd-composer' });
  let openBtn: HTMLButtonElement | null = null;
  let editor: HTMLDivElement | null = null;

  const closeEditor = (): void => {
    if (!editor) return;
    editor.remove();
    editor = null;
    openBtn?.removeClass('is-hidden');
  };

  const openEditor = (): void => {
    if (editor) {
      editor.querySelector('input')?.focus();
      return;
    }
    openBtn?.addClass('is-hidden');
    editor = row.createDiv({ cls: 'gtd-composer-editor' });
    const input = editor.createEl('input', {
      type: 'text',
      cls: 'gtd-quick-add-input',
      placeholder: opts.placeholder,
      attr: { 'aria-label': 'Add task' }
    });
    const chips = editor.createDiv({ cls: 'gtd-nl-chips' });

    const updateChips = (): void => {
      const value = input.value.trim();
      if (!value && !opts.hintWhenEmpty) {
        chips.empty();
        return;
      }
      const todayStr = ctx.getTodayDateString();
      renderParseChips(
        chips,
        value ? parseNaturalLanguageInput(value, todayStr) : null,
        opts.destLabel,
        todayStr
      );
    };
    updateChips();

    input.addEventListener('input', updateChips);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (opts.collapsed) {
          closeEditor();
        } else {
          input.value = '';
          updateChips();
        }
        return;
      }
      if (e.key !== 'Enter') return;
      const value = input.value.trim();
      if (!value) {
        if (opts.collapsed) closeEditor();
        return;
      }
      const parsed = parseNaturalLanguageInput(value, ctx.getTodayDateString());
      input.value = '';
      updateChips();
      void opts.commit(parsed).then(() => {
        if (opts.collapsed) closeEditor();
      });
    });

    if (opts.collapsed) input.focus();
  };

  if (opts.collapsed) {
    openBtn = row.createEl('button', { cls: 'gtd-composer-open', attr: { 'aria-label': 'Add task' } });
    const iconEl = openBtn.createSpan({ cls: 'gtd-composer-open-icon' });
    setIcon(iconEl, 'plus');
    openBtn.createSpan({ cls: 'gtd-composer-open-label', text: 'Add task' });
    openBtn.addEventListener('click', openEditor);
  } else {
    openEditor();
  }
}

/**
 * Section quick-add composer; roleTag binds quick-added tasks to a swimlane.
 * Board columns keep the editor visible; list sections pass collapsed=true.
 */
export function renderQuickAddRow(
  container: HTMLElement,
  secId: SectionId,
  roleTag: string | null | undefined,
  ctx: ViewContext,
  collapsed = false
): void {
  renderComposer(container, ctx, {
    destLabel: getSectionShortTitle(secId, secId),
    placeholder: '+ Add task (press Enter)...',
    collapsed,
    hintWhenEmpty: collapsed,
    commit: (parsed) =>
      ctx.taskMutator.quickAddTask(secId, parsed.description, (roleTag as RoleId) || null, parsed)
  });
}

/** Day-bucket quick-add composer; the anchor field is stamped with the bucket day. */
export function renderDateQuickAddRow(container: HTMLElement, dayDate: string, ctx: ViewContext): void {
  const todayStr = ctx.getTodayDateString();
  const bucket = buildDateBuckets(todayStr).find((b) => b.dayDate === dayDate);
  renderComposer(container, ctx, {
    destLabel: bucket ? bucket.title.split('—')[0].trim() : dayDate,
    placeholder: '+ Add task (press Enter)...',
    collapsed: false,
    hintWhenEmpty: false,
    commit: (parsed) =>
      ctx.taskMutator.quickAddTaskDated(
        parsed.description,
        dayDate,
        ctx.getState().dateAnchor,
        null,
        parsed
      )
  });
}
