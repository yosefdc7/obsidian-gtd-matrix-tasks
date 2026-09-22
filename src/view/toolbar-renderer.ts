import { Menu, setIcon } from 'obsidian';
import { parseConfiguredRoles, getRoleColor } from '../parser';
import type { ViewContext } from './types';
import type { DateAnchorField, RoleId, SortCriteria, TaskItem } from '../types';

function getUniqueFolders(tasks: TaskItem[]): string[] {
  const set = new Set<string>();
  for (const t of tasks) {
    const parts = t.filePath.replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      set.add(parts[0]);
    }
  }
  return Array.from(set).sort();
}

/**
 * Stream toolbar: brand row (stats + search), segmented view tabs, By Date
 * anchor row, options disclosure (layout/sort/filter/quick chips/folder/
 * refresh), natural-language quick-add bar and the role chip row.
 */
export function renderToolbar(container: HTMLElement, allTasks: TaskItem[], ctx: ViewContext): void {
  const state = ctx.getState();
  const toolbar = container.createDiv({ cls: 'gtd-toolbar' });

  // Brand row: grid icon + title + stats + search
  const head = toolbar.createDiv({ cls: 'gtd-stream-head' });
  const brand = head.createDiv({ cls: 'gtd-brand' });
  const brandIcon = brand.createSpan({ cls: 'gtd-brand-icon' });
  setIcon(brandIcon, 'layout-grid');
  brand.createSpan({ cls: 'gtd-brand-label', text: 'GTD Matrix Tasks' });

  const openCount = allTasks.filter((t) => !t.isCompleted).length;
  const doneCount = allTasks.filter((t) => t.isCompleted).length;
  head.createDiv({ cls: 'gtd-stats-pill', text: `${openCount} open · ${doneCount} done` });

  const searchWrapper = head.createDiv({ cls: 'gtd-search-wrapper' });
  const searchIcon = searchWrapper.createSpan({ cls: 'gtd-search-icon' });
  setIcon(searchIcon, 'search');
  const searchInput = searchWrapper.createEl('input', {
    type: 'text',
    cls: 'gtd-search-input',
    placeholder: 'Search tasks...',
    attr: { 'aria-label': 'Search tasks' }
  });
  searchInput.value = state.searchQuery;
  searchInput.addEventListener('input', () => {
    const hadFocus = document.activeElement === searchInput;
    ctx.setState({ searchQuery: searchInput.value });
    if (hadFocus) {
      requestAnimationFrame(() => {
        const el = container.querySelector<HTMLInputElement>('.gtd-search-input');
        if (el && document.activeElement !== el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  });

  // Single tab row: [view tabs] [anchor tabs — By Date only] [⚙ options toggle]
  const tabRow = toolbar.createDiv({ cls: 'gtd-tab-row' });

  // Segmented view tabs
  const modeGroup = tabRow.createDiv({ cls: 'gtd-mode-switcher' });
  const gtdBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'gtd' ? 'is-active' : ''}`
  });
  gtdBtn.createSpan({ cls: 'gtd-mode-label-full', text: 'GTD Workflow' });
  gtdBtn.createSpan({ cls: 'gtd-mode-label-short', text: 'GTD' });
  gtdBtn.addEventListener('click', () => {
    if (state.viewMode !== 'gtd') {
      ctx.setState({ viewMode: 'gtd' });
    }
  });

  const eisenBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'eisenhower' ? 'is-active' : ''}`,
    text: 'Eisenhower'
  });
  eisenBtn.addEventListener('click', () => {
    if (state.viewMode !== 'eisenhower') {
      ctx.setState({ viewMode: 'eisenhower' });
    }
  });

  const dateBtn = modeGroup.createEl('button', {
    cls: `gtd-mode-btn ${state.viewMode === 'date' ? 'is-active' : ''}`,
    text: 'By Date'
  });
  dateBtn.title = 'By Date: tasks grouped into date buckets by anchor date';
  dateBtn.addEventListener('click', () => {
    if (state.viewMode !== 'date') {
      ctx.setState({ viewMode: 'date' });
    }
  });

  // Action buttons: [🛫 Anchor toggle (By Date)] [🔍 Search toggle (mobile)] [⚙ Options toggle]
  const actionsWrap = tabRow.createDiv({ cls: 'gtd-tab-actions' });

  // Anchor field selector icon button (By Date only)
  if (state.viewMode === 'date') {
    const currentAnchor = state.dateAnchor || 'start';
    const anchorIcon =
      currentAnchor === 'start'
        ? 'plane-takeoff'
        : currentAnchor === 'scheduled'
        ? 'hourglass'
        : 'calendar';

    const anchorLabel =
      currentAnchor === 'start'
        ? 'Start Date'
        : currentAnchor === 'scheduled'
        ? 'Scheduled Date'
        : 'Due Date';

    const anchorToggle = actionsWrap.createEl('button', {
      cls: 'gtd-anchor-toggle-btn',
      attr: { 'aria-label': `Anchor: ${anchorLabel} (tap to change)` }
    });
    setIcon(anchorToggle, anchorIcon);
    anchorToggle.title = `Anchor: ${anchorLabel} (tap to change)`;

    anchorToggle.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      const menu = new Menu();

      menu.addItem((item) => {
        item
          .setTitle('Start Date')
          .setIcon('plane-takeoff')
          .setChecked(currentAnchor === 'start')
          .onClick(() => {
            if (ctx.getState().dateAnchor !== 'start') {
              ctx.setState({ dateAnchor: 'start' });
            }
          });
      });

      menu.addItem((item) => {
        item
          .setTitle('Scheduled Date')
          .setIcon('hourglass')
          .setChecked(currentAnchor === 'scheduled')
          .onClick(() => {
            if (ctx.getState().dateAnchor !== 'scheduled') {
              ctx.setState({ dateAnchor: 'scheduled' });
            }
          });
      });

      menu.addItem((item) => {
        item
          .setTitle('Due Date')
          .setIcon('calendar')
          .setChecked(currentAnchor === 'due')
          .onClick(() => {
            if (ctx.getState().dateAnchor !== 'due') {
              ctx.setState({ dateAnchor: 'due' });
            }
          });
      });

      menu.showAtMouseEvent(e);
    });
  }

  // Mobile search toggle button
  const isSearchActive = Boolean(state.mobileSearchOpen || state.searchQuery);
  const searchToggle = actionsWrap.createEl('button', {
    cls: `gtd-search-toggle-btn ${isSearchActive ? 'is-active' : ''}`,
    attr: { 'aria-label': 'Search tasks' }
  });
  setIcon(searchToggle, 'search');
  searchToggle.title = 'Search tasks';
  searchToggle.addEventListener('click', () => {
    const current = ctx.getState();
    if (current.mobileSearchOpen || current.searchQuery) {
      ctx.setState({ mobileSearchOpen: false, searchQuery: '' });
    } else {
      ctx.setState({ mobileSearchOpen: true });
      requestAnimationFrame(() => {
        container.querySelector<HTMLInputElement>('.gtd-mobile-search-input')?.focus();
      });
    }
  });

  // Options disclosure toggle
  const optionsToggle = actionsWrap.createEl('button', {
    cls: `gtd-options-toggle ${state.optionsOpen ? 'is-active' : ''}`,
    attr: { 'aria-label': 'More options' }
  });
  setIcon(optionsToggle, 'sliders-horizontal');
  optionsToggle.title = 'More options';
  optionsToggle.addEventListener('click', () => {
    ctx.setState({ optionsOpen: !ctx.getState().optionsOpen });
  });

  // Expandable mobile search row
  const mobileSearchRow = toolbar.createDiv({
    cls: `gtd-mobile-search-row ${isSearchActive ? '' : 'is-hidden'}`
  });
  const mSearchWrapper = mobileSearchRow.createDiv({ cls: 'gtd-mobile-search-wrapper' });
  const mSearchIcon = mSearchWrapper.createSpan({ cls: 'gtd-search-icon' });
  setIcon(mSearchIcon, 'search');
  const mSearchInput = mSearchWrapper.createEl('input', {
    type: 'text',
    cls: 'gtd-mobile-search-input',
    placeholder: 'Search tasks...',
    attr: { 'aria-label': 'Search tasks' }
  });
  mSearchInput.value = state.searchQuery;
  mSearchInput.addEventListener('input', () => {
    const hadFocus = document.activeElement === mSearchInput;
    ctx.setState({ searchQuery: mSearchInput.value });
    if (hadFocus) {
      requestAnimationFrame(() => {
        const el = container.querySelector<HTMLInputElement>('.gtd-mobile-search-input');
        if (el && document.activeElement !== el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  });
  if (state.searchQuery) {
    const clearBtn = mSearchWrapper.createEl('button', {
      cls: 'gtd-search-clear-btn',
      attr: { 'aria-label': 'Clear search' }
    });
    setIcon(clearBtn, 'x');
    clearBtn.addEventListener('click', () => {
      ctx.setState({ searchQuery: '' });
      requestAnimationFrame(() => {
        container.querySelector<HTMLInputElement>('.gtd-mobile-search-input')?.focus();
      });
    });
  }

  const optionsRow = toolbar.createDiv({
    cls: `gtd-options-row ${state.optionsOpen ? '' : 'is-hidden'}`
  });

  // Layout Toggle (Board / List) — persists into settings.defaultLayoutMode
  const layoutGroup = optionsRow.createDiv({ cls: 'gtd-layout-switcher' });
  const boardBtn = layoutGroup.createEl('button', {
    cls: `gtd-layout-btn ${state.layoutMode === 'board' ? 'is-active' : ''}`,
    attr: { 'aria-label': 'Board view' }
  });
  setIcon(boardBtn, 'layout-dashboard');
  boardBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'board') {
      ctx.settings.defaultLayoutMode = 'board';
      void ctx.saveSettings();
      ctx.setState({ layoutMode: 'board' });
    }
  });
  const listBtn = layoutGroup.createEl('button', {
    cls: `gtd-layout-btn ${state.layoutMode === 'list' ? 'is-active' : ''}`,
    attr: { 'aria-label': 'List view' }
  });
  setIcon(listBtn, 'list');
  listBtn.addEventListener('click', () => {
    if (state.layoutMode !== 'list') {
      ctx.settings.defaultLayoutMode = 'list';
      void ctx.saveSettings();
      ctx.setState({ layoutMode: 'list' });
    }
  });

  // Sort Dropdown (date view has a fixed anchor-aware order)
  if (state.viewMode !== 'date') {
    const sortWrapper = optionsRow.createDiv({ cls: 'gtd-sort-wrapper' });
    const sortSelect = sortWrapper.createEl('select', { cls: 'gtd-sort-select' });
    const sortOptions: { id: SortCriteria; label: string }[] = [
      { id: 'date', label: 'Sort: Date (Earliest)' },
      { id: 'priority', label: 'Sort: Priority (Highest)' },
      { id: 'title', label: 'Sort: Title (A-Z)' },
      { id: 'created', label: 'Sort: Created (Newest)' }
    ];
    for (const opt of sortOptions) {
      const optionEl = sortSelect.createEl('option', { value: opt.id, text: opt.label });
      if (state.sortCriteria === opt.id) optionEl.selected = true;
    }
    sortSelect.addEventListener('change', () => {
      ctx.setState({ sortCriteria: sortSelect.value as SortCriteria });
    });
  }

  // Tag / Role View Mode Toggle [Filter | Swimlanes] — hidden while By Date is active
  if (state.viewMode !== 'date') {
    const tagModeGroup = optionsRow.createDiv({ cls: 'gtd-mode-switcher gtd-tagmode-switcher' });
    const filterBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${state.tagViewMode === 'filter' ? 'is-active' : ''}`,
      text: 'Filter'
    });
    filterBtn.title = 'Filter view: display matching tasks in standard columns';
    filterBtn.addEventListener('click', () => {
      if (state.tagViewMode !== 'filter') {
        ctx.setState({ tagViewMode: 'filter' });
      }
    });
    const swimlanesBtn = tagModeGroup.createEl('button', {
      cls: `gtd-mode-btn ${state.tagViewMode === 'swimlanes' ? 'is-active' : ''}`,
      text: 'Swimlanes'
    });
    swimlanesBtn.title = 'Swimlane view: divide board horizontally by role';
    swimlanesBtn.addEventListener('click', () => {
      if (state.tagViewMode !== 'swimlanes') {
        ctx.setState({ tagViewMode: 'swimlanes' });
      }
    });
  }

  // Quick Filter Chips Row
  const chipsWrapper = optionsRow.createDiv({ cls: 'gtd-chips-wrapper' });
  const chips: { id: 'all' | 'urgent' | 'important' | 'projects'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'important', label: 'Important' },
    { id: 'projects', label: 'Projects' }
  ];

  for (const chip of chips) {
    const chipBtn = chipsWrapper.createEl('button', {
      cls: `gtd-chip-btn ${state.activeChip === chip.id ? 'is-active' : ''}`,
      text: chip.label
    });
    chipBtn.addEventListener('click', () => {
      ctx.setState({ activeChip: chip.id });
    });
  }

  // Folder Filter
  const folders = getUniqueFolders(allTasks);
  if (folders.length > 0) {
    const select = optionsRow.createEl('select', { cls: 'gtd-folder-select' });
    const allOpt = select.createEl('option', { value: 'all', text: 'All Folders' });
    if (state.selectedFolder === 'all') allOpt.selected = true;

    for (const f of folders) {
      const opt = select.createEl('option', { value: f, text: f });
      if (state.selectedFolder === f) opt.selected = true;
    }

    select.addEventListener('change', () => {
      ctx.setState({ selectedFolder: select.value });
    });
  }

  // Refresh Button
  const refreshBtn = optionsRow.createEl('button', {
    cls: 'gtd-btn-icon',
    attr: { 'aria-label': 'Refresh tasks' }
  });
  setIcon(refreshBtn, 'refresh-cw');
  refreshBtn.addEventListener('click', async () => {
    setIcon(refreshBtn, 'loader');
    await ctx.rescan();
  });

  // Role chips row (All pill + configured role pills + Untagged pill)
  const roleChipsWrapper = toolbar.createDiv({ cls: 'gtd-role-chips-wrapper' });
  const configured = parseConfiguredRoles(ctx.settings.configuredRoleTags);
  const roleList: { id: RoleId; label: string; color: string }[] = [
    ...configured.map((c, i) => ({ id: c.id, label: c.label, color: getRoleColor(c.id, i) })),
    { id: 'untagged', label: 'Untagged', color: getRoleColor('untagged') }
  ];
  const allRoleIds = roleList.map((r) => r.id);
  const isAllActive = allRoleIds.every((id) => state.activeFilterRoles.has(id));

  // 1. "All" Pill
  const allPill = roleChipsWrapper.createEl('button', {
    cls: `gtd-role-chip-btn gtd-role-chip-all ${isAllActive ? 'is-active' : ''}`,
    attr: { 'aria-label': 'Show all roles' }
  });
  allPill.title = 'Show all roles';
  allPill.createSpan({ cls: 'gtd-role-chip-label', text: 'All' });
  allPill.addEventListener('click', () => {
    ctx.setState({ activeFilterRoles: new Set(allRoleIds) });
  });

  // 2. Role Pills
  for (const r of roleList) {
    const isSoloActive = state.activeFilterRoles.has(r.id) && state.activeFilterRoles.size === 1;
    const isActive = state.activeFilterRoles.has(r.id);
    const pill = roleChipsWrapper.createEl('button', {
      cls: `gtd-role-chip-btn ${isActive ? 'is-active' : ''} chip-${r.id.replace('/', '-')}`,
      attr: { 'aria-label': `Filter by ${r.label}` }
    });
    pill.style.setProperty('--role-color', r.color);
    pill.addClass('has-custom-color');
    pill.title = isSoloActive ? `Showing only ${r.label} (click to show all)` : `Filter by ${r.label}`;

    const dot = pill.createSpan({ cls: 'gtd-role-chip-dot' });
    dot.style.backgroundColor = r.color;
    pill.createSpan({ cls: 'gtd-role-chip-label', text: r.label });

    pill.addEventListener('click', (e: MouseEvent) => {
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        // Multi-select toggle
        const roles = new Set(ctx.getState().activeFilterRoles);
        if (roles.has(r.id)) {
          if (roles.size > 1) {
            roles.delete(r.id);
          }
        } else {
          roles.add(r.id);
        }
        ctx.setState({ activeFilterRoles: roles });
      } else {
        // Single-select (exclusive radio):
        // If clicking the active solo pill, toggle back to All
        const currentRoles = ctx.getState().activeFilterRoles;
        if (currentRoles.has(r.id) && currentRoles.size === 1) {
          ctx.setState({ activeFilterRoles: new Set(allRoleIds) });
        } else {
          ctx.setState({ activeFilterRoles: new Set([r.id]) });
        }
      }
    });
  }
}
