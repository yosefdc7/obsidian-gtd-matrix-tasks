import { setIcon } from 'obsidian';
import { getEisenhowerSection, getGTDSection, sortTasks } from '../parser';
import { renderBoardCard, renderDateQuickAddRow, renderQuickAddRow } from './card-renderer';
import type { DateBucketDefinition } from './date-buckets';
import { ROLE_SWIMLANES } from './types';
import type { ViewContext } from './types';
import type { RoleId, SectionDefinition, SectionId, TaskItem } from '../types';

function getSectionShortTitle(secId: SectionId, defaultTitle: string): string {
  const titles: Record<string, string> = {
    'gtd-inbox': 'Inbox',
    'gtd-next-actions': 'Next Actions',
    'gtd-waiting': 'Waiting',
    'gtd-scheduled': 'Scheduled',
    'gtd-someday': 'Someday',
    'gtd-completed': 'Done',
    'eisen-q1': 'Q1 Urgent',
    'eisen-q2': 'Q2 Important',
    'eisen-q3': 'Q3 Delegate',
    'eisen-q4': 'Q4 Low',
    'eisen-inbox': 'Inbox',
    'eisen-completed': 'Done'
  };
  return titles[secId] || defaultTitle.split('—')[0].trim();
}

/** Kanban board with mobile column tabs, drop zones and per-column quick add. */
export function renderBoard(
  container: HTMLElement,
  sections: SectionDefinition[],
  grouped: Map<SectionId, TaskItem[]>,
  ctx: ViewContext
): void {
  // Render mobile column tabs carousel
  const tabsWrapper = container.createDiv({ cls: 'gtd-mobile-col-tabs' });
  const tabButtons = new Map<SectionId, HTMLButtonElement>();

  for (const sec of sections) {
    const colTasks = grouped.get(sec.id) || [];
    const tabBtn = tabsWrapper.createEl('button', {
      cls: 'gtd-mobile-tab-btn',
      attr: { 'data-target-section': sec.id }
    });
    const iconSpan = tabBtn.createSpan({ cls: 'gtd-mobile-tab-icon' });
    setIcon(iconSpan, sec.icon);

    const shortTitle = getSectionShortTitle(sec.id, sec.title);
    tabBtn.createSpan({ cls: 'gtd-mobile-tab-label', text: shortTitle });
    tabBtn.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

    tabBtn.addEventListener('click', () => {
      const targetCol = board.querySelector(`[data-section-id="${sec.id}"]`);
      if (targetCol) {
        targetCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      tabButtons.forEach((btn) => btn.removeClass('is-active'));
      tabBtn.addClass('is-active');
    });

    tabButtons.set(sec.id, tabBtn);
  }

  if (sections.length > 0) {
    tabButtons.get(sections[0].id)?.addClass('is-active');
  }

  const board = container.createDiv({ cls: 'gtd-board' });

  // Sync horizontal scroll with mobile tabs
  let scrollTimer: number | null = null;
  board.addEventListener('scroll', () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const boardRect = board.getBoundingClientRect();
      const boardCenter = boardRect.left + boardRect.width / 2;
      let closestSecId: SectionId | null = null;
      let minDistance = Infinity;

      const cols = board.querySelectorAll<HTMLElement>('.gtd-board-column');
      cols.forEach((col) => {
        const rect = col.getBoundingClientRect();
        const colCenter = rect.left + rect.width / 2;
        const dist = Math.abs(colCenter - boardCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestSecId = col.getAttribute('data-section-id') as SectionId;
        }
      });

      if (closestSecId && tabButtons.has(closestSecId)) {
        tabButtons.forEach((btn) => btn.removeClass('is-active'));
        const activeBtn = tabButtons.get(closestSecId);
        if (activeBtn) {
          activeBtn.addClass('is-active');
          activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }, 75);
  });

  for (const sec of sections) {
    const colTasks = grouped.get(sec.id) || [];
    const col = board.createDiv({ cls: `gtd-board-column ${sec.badgeClass}` });
    col.setAttribute('data-section-id', sec.id);

    // Column header
    const colHeader = col.createDiv({ cls: 'gtd-board-col-header' });
    const iconSpan = colHeader.createSpan({ cls: 'gtd-board-col-icon' });
    setIcon(iconSpan, sec.icon);
    colHeader.createSpan({ cls: 'gtd-board-col-title', text: sec.title });
    colHeader.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

    // Drop zone
    const dropZone = col.createDiv({ cls: 'gtd-board-drop-zone' });
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      dropZone.addClass('gtd-drag-over');
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.removeClass('gtd-drag-over');
    });
    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.removeClass('gtd-drag-over');
      const taskId = e.dataTransfer?.getData('text/plain');
      if (!taskId) return;
      const task = ctx.taskStore.getTasks().find((t) => t.id === taskId);
      if (!task) return;
      await ctx.handleTaskDrop(task, sec.id);
    });

    // Sort tasks
    const sorted = sortTasks(colTasks, ctx.getState().sortCriteria);

    if (sorted.length === 0) {
      dropZone.createDiv({ cls: 'gtd-board-empty', text: 'Drop a task here' });
    } else {
      for (const task of sorted) {
        renderBoardCard(dropZone, task, ctx);
      }
    }

    // Quick-add inside board column
    renderQuickAddRow(col, sec.id, undefined, ctx);
  }
}

/** Role swimlanes, each rendering a full board grid of the active sections. */
export function renderSwimlaneBoard(
  container: HTMLElement,
  sections: SectionDefinition[],
  tasks: TaskItem[],
  todayStr: string,
  ctx: ViewContext
): void {
  const state = ctx.getState();
  const swimlanesContainer = container.createDiv({ cls: 'gtd-swimlanes-container' });

  for (const lane of ROLE_SWIMLANES) {
    if (!state.activeFilterRoles.has(lane.id)) continue;

    const laneTasks = tasks.filter((t) => t.effectiveRole === lane.id);
    if (lane.id === 'untagged' && laneTasks.length === 0) continue;

    const isCollapsed = state.collapsedSwimlanes.has(lane.id);
    const laneEl = swimlanesContainer.createDiv({
      cls: `gtd-swimlane-row ${lane.badgeClass} ${isCollapsed ? 'is-collapsed' : ''}`
    });

    // Swimlane Header Bar
    const laneHeader = laneEl.createDiv({ cls: 'gtd-swimlane-header' });
    const toggleIcon = laneHeader.createSpan({ cls: 'gtd-toggle-icon' });
    setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

    const iconSpan = laneHeader.createSpan({ cls: 'gtd-swimlane-icon' });
    setIcon(iconSpan, lane.icon);

    const titleGroup = laneHeader.createDiv({ cls: 'gtd-swimlane-title-group' });
    titleGroup.createSpan({ cls: 'gtd-swimlane-title', text: lane.title });
    titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(laneTasks.length) });

    laneHeader.createDiv({ cls: 'gtd-swimlane-subtitle', text: lane.subtitle });

    laneHeader.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      const collapsed = new Set(ctx.getState().collapsedSwimlanes);
      if (collapsed.has(lane.id)) {
        collapsed.delete(lane.id);
      } else {
        collapsed.add(lane.id);
      }
      ctx.setState({ collapsedSwimlanes: collapsed });
    });

    if (isCollapsed) continue;

    // Group lane tasks by section
    const laneGrouped = new Map<SectionId, TaskItem[]>();
    for (const sec of sections) {
      laneGrouped.set(sec.id, []);
    }
    for (const t of laneTasks) {
      const secId =
        state.viewMode === 'gtd'
          ? getGTDSection(t, todayStr)
          : getEisenhowerSection(t, todayStr);
      if (secId) {
        laneGrouped.get(secId)?.push(t);
      }
    }

    // Board Grid inside swimlane
    const grid = laneEl.createDiv({ cls: 'gtd-board gtd-swimlane-board' });
    for (const sec of sections) {
      const colTasks = laneGrouped.get(sec.id) || [];
      const col = grid.createDiv({ cls: `gtd-board-column ${sec.badgeClass}` });
      col.setAttribute('data-section-id', sec.id);

      // Column header
      const colHeader = col.createDiv({ cls: 'gtd-board-col-header' });
      const colIcon = colHeader.createSpan({ cls: 'gtd-board-col-icon' });
      setIcon(colIcon, sec.icon);
      colHeader.createSpan({ cls: 'gtd-board-col-title', text: sec.title });
      colHeader.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

      // Drop zone
      const dropZone = col.createDiv({ cls: 'gtd-board-drop-zone' });
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        dropZone.addClass('gtd-drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.removeClass('gtd-drag-over');
      });
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.removeClass('gtd-drag-over');
        const taskId = e.dataTransfer?.getData('text/plain');
        if (!taskId) return;
        const task = ctx.taskStore.getTasks().find((t) => t.id === taskId);
        if (!task) return;

        // Cross-swimlane drops fold the role change into the single transition write
        await ctx.handleTaskDrop(task, sec.id, lane.roleTag as RoleId | null);
      });

      const sorted = sortTasks(colTasks, state.sortCriteria);
      if (sorted.length === 0) {
        dropZone.createDiv({ cls: 'gtd-board-empty', text: 'Drop a task here' });
      } else {
        for (const task of sorted) {
          renderBoardCard(dropZone, task, ctx);
        }
      }

      // Quick add inside column with swimlane role
      renderQuickAddRow(col, sec.id, lane.roleTag, ctx);
    }
  }
}

/** By Date board: chronological buckets; only day buckets accept drops and quick-adds. */
export function renderDateBoard(
  container: HTMLElement,
  buckets: DateBucketDefinition[],
  grouped: Map<string, TaskItem[]>,
  ctx: ViewContext
): void {
  // Render mobile column tabs carousel
  const tabsWrapper = container.createDiv({ cls: 'gtd-mobile-col-tabs' });
  const tabButtons = new Map<string, HTMLButtonElement>();

  for (const bucket of buckets) {
    const colTasks = grouped.get(bucket.id) || [];
    const tabBtn = tabsWrapper.createEl('button', {
      cls: 'gtd-mobile-tab-btn',
      attr: { 'data-target-section': bucket.id }
    });
    const iconSpan = tabBtn.createSpan({ cls: 'gtd-mobile-tab-icon' });
    setIcon(iconSpan, bucket.icon);

    const shortTitle = bucket.title.split('—')[0].trim();
    tabBtn.createSpan({ cls: 'gtd-mobile-tab-label', text: shortTitle });
    tabBtn.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

    tabBtn.addEventListener('click', () => {
      const targetCol = board.querySelector(`[data-section-id="${bucket.id}"]`);
      if (targetCol) {
        targetCol.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
      tabButtons.forEach((btn) => btn.removeClass('is-active'));
      tabBtn.addClass('is-active');
    });

    tabButtons.set(bucket.id, tabBtn);
  }

  if (buckets.length > 0) {
    tabButtons.get(buckets[0].id)?.addClass('is-active');
  }

  const board = container.createDiv({ cls: 'gtd-board' });

  // Sync horizontal scroll with mobile tabs
  let scrollTimer: number | null = null;
  board.addEventListener('scroll', () => {
    if (scrollTimer) window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const boardRect = board.getBoundingClientRect();
      const boardCenter = boardRect.left + boardRect.width / 2;
      let closestId: string | null = null;
      let minDistance = Infinity;

      const cols = board.querySelectorAll<HTMLElement>('.gtd-board-column');
      cols.forEach((col) => {
        const rect = col.getBoundingClientRect();
        const colCenter = rect.left + rect.width / 2;
        const dist = Math.abs(colCenter - boardCenter);
        if (dist < minDistance) {
          minDistance = dist;
          closestId = col.getAttribute('data-section-id');
        }
      });

      if (closestId && tabButtons.has(closestId)) {
        tabButtons.forEach((btn) => btn.removeClass('is-active'));
        const activeBtn = tabButtons.get(closestId);
        if (activeBtn) {
          activeBtn.addClass('is-active');
          activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    }, 75);
  });

  for (const bucket of buckets) {
    const colTasks = grouped.get(bucket.id) || [];
    const col = board.createDiv({ cls: `gtd-board-column ${bucket.badgeClass}` });
    col.setAttribute('data-section-id', bucket.id);

    // Column header
    const colHeader = col.createDiv({ cls: 'gtd-board-col-header' });
    const iconSpan = colHeader.createSpan({ cls: 'gtd-board-col-icon' });
    setIcon(iconSpan, bucket.icon);
    colHeader.createSpan({ cls: 'gtd-board-col-title', text: bucket.title });
    colHeader.createSpan({ cls: 'gtd-count-badge', text: String(colTasks.length) });

    // Drop zone (day buckets only; other buckets reject drops)
    const dropZone = col.createDiv({ cls: 'gtd-board-drop-zone' });
    if (bucket.dayDate) {
      const dayDate = bucket.dayDate;
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        dropZone.addClass('gtd-drag-over');
      });
      dropZone.addEventListener('dragleave', () => {
        dropZone.removeClass('gtd-drag-over');
      });
      dropZone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropZone.removeClass('gtd-drag-over');
        const taskId = e.dataTransfer?.getData('text/plain');
        if (!taskId) return;
        const task = ctx.taskStore.getTasks().find((t) => t.id === taskId);
        if (!task) return;
        await ctx.handleDateDrop(task, dayDate);
      });
    }

    if (colTasks.length === 0) {
      dropZone.createDiv({ cls: 'gtd-board-empty', text: bucket.dayDate ? 'Drop a task here' : 'Empty' });
    } else {
      for (const task of colTasks) {
        renderBoardCard(dropZone, task, ctx);
      }
    }

    // Quick-add inside day buckets only; stamps the anchor field with the bucket day
    if (bucket.dayDate) {
      renderDateQuickAddRow(col, bucket.dayDate, ctx);
    }
  }
}
