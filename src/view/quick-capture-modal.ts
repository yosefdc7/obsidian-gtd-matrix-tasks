import { setIcon } from 'obsidian';
import { parseNaturalLanguageInput } from '../nl-input';
import { renderParseChips } from './composer';
import { getSectionShortTitle } from './types';
import type { ViewContext } from './types';
import type { RoleId, SectionId } from '../types';

/** Floating action button that opens the quick capture sheet. */
export function renderFloatingActionButton(container: HTMLElement, ctx: ViewContext): void {
  const fab = container.createEl('button', {
    cls: 'gtd-fab-btn',
    attr: { 'aria-label': 'Quick capture task' }
  });
  setIcon(fab, 'plus');
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.openQuickAddModal();
  });
}

/** Slide-up quick capture sheet with destination and role selectors. */
export function openQuickAddModal(ctx: ViewContext, sectionId?: SectionId): void {
  const backdrop = document.body.createDiv({ cls: 'gtd-modal-backdrop' });
  const sheet = backdrop.createDiv({ cls: 'gtd-modal-sheet' });

  // Header
  const header = sheet.createDiv({ cls: 'gtd-modal-title-row' });
  header.createSpan({ cls: 'gtd-modal-title', text: 'Quick Capture Task' });
  const closeBtn = header.createEl('button', {
    cls: 'gtd-modal-close-btn',
    attr: { 'aria-label': 'Close modal' }
  });
  setIcon(closeBtn, 'x');
  closeBtn.addEventListener('click', () => backdrop.remove());

  // Task Description Input
  const input = sheet.createEl('input', {
    type: 'text',
    cls: 'gtd-modal-input',
    placeholder: 'What needs to be done?',
    attr: {
      enterkeyhint: 'send'
    }
  });
  const chipsEl = sheet.createDiv({ cls: 'gtd-nl-chips gtd-modal-nl-chips' });

  // Destination Section Selector
  const secRow = sheet.createDiv({ cls: 'gtd-modal-options-row' });
  secRow.createSpan({ cls: 'gtd-modal-options-label', text: 'Destination' });
  const secChips = secRow.createDiv({ cls: 'gtd-modal-chips' });
  const sections: { id: SectionId; label: string }[] = [
    { id: 'gtd-next-actions', label: '⚡ Next Actions' },
    { id: 'gtd-inbox', label: '📥 Inbox' },
    { id: 'gtd-scheduled', label: '⏳ Scheduled' },
    { id: 'gtd-waiting', label: '🕒 Waiting' },
    { id: 'gtd-someday', label: '📦 Someday' }
  ];
  let selectedSecId: SectionId = sectionId ?? 'gtd-next-actions';
  const secButtons: HTMLElement[] = [];

  for (const sec of sections) {
    const chip = secChips.createEl('button', {
      cls: `gtd-modal-chip ${sec.id === selectedSecId ? 'is-active' : ''}`,
      text: sec.label
    });
    secButtons.push(chip);
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      selectedSecId = sec.id;
      secButtons.forEach((b) => b.removeClass('is-active'));
      chip.addClass('is-active');
      updateChips();
    });
  }

  // Role Selector
  const roleRow = sheet.createDiv({ cls: 'gtd-modal-options-row' });
  roleRow.createSpan({ cls: 'gtd-modal-options-label', text: 'Role' });
  const roleChips = roleRow.createDiv({ cls: 'gtd-modal-chips' });
  const roles: { id: RoleId | null; label: string }[] = [
    { id: 'role/yo-manager', label: '💼 Yo Manager' },
    { id: 'role/josef-selfcare', label: '❤️ Josef Self-Care' },
    { id: 'role/rj-supportive', label: '👥 RJ Supportive' },
    { id: null, label: '🏷️ None' }
  ];
  let selectedRole: RoleId | null = null;
  const roleButtons: HTMLElement[] = [];

  for (const role of roles) {
    const chip = roleChips.createEl('button', {
      cls: `gtd-modal-chip ${role.id === selectedRole ? 'is-active' : ''}`,
      text: role.label
    });
    roleButtons.push(chip);
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      selectedRole = role.id;
      roleButtons.forEach((b) => b.removeClass('is-active'));
      chip.addClass('is-active');
    });
  }

  // Natural-language parse chips under the input (hint while empty)
  function updateChips(): void {
    const value = input.value.trim();
    const todayStr = ctx.getTodayDateString();
    renderParseChips(
      chipsEl,
      value ? parseNaturalLanguageInput(value, todayStr) : null,
      getSectionShortTitle(selectedSecId, selectedSecId),
      todayStr
    );
  }
  updateChips();
  input.addEventListener('input', updateChips);

  // Submit Button
  const submitBtn = sheet.createEl('button', {
    cls: 'gtd-modal-submit-btn',
    text: 'Capture to Daily Jot'
  });

  const handleSave = async () => {
    const text = input.value.trim();
    if (!text) return;
    const parsed = parseNaturalLanguageInput(text, ctx.getTodayDateString());
    backdrop.remove();
    await ctx.taskMutator.quickAddTask(
      selectedSecId,
      parsed.description,
      parsed.role ?? selectedRole,
      parsed
    );
  };

  submitBtn.addEventListener('click', handleSave);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    } else if (e.key === 'Escape') {
      backdrop.remove();
    }
  });

  // Dismiss on backdrop click
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  setTimeout(() => input.focus(), 60);
}
