import { setIcon } from 'obsidian';
import { getEisenhowerSection, getGTDSection, sortTasks } from '../parser';
import { renderTaskItem } from './card-renderer';
import { renderDateQuickAddRow, renderQuickAddRow } from './composer';
import { DATE_BUCKET_COMPLETED } from './date-buckets';
import type { DateBucketDefinition } from './date-buckets';
import { getSectionShortTitle, getSwimlaneDefinitions } from './types';
import type { ViewContext } from './types';
import type { RoleId, SectionDefinition, SectionId, TaskItem } from '../types';

/** Collapsible accordion section with drop zone, task rows and quick add. */
export function renderSection(
  container: HTMLElement,
  sec: SectionDefinition,
  tasks: TaskItem[],
  roleTag: string | null | undefined,
  ctx: ViewContext
): void {
  const isCollapsed = ctx.getState().collapsedSections.has(sec.id);
  const sectionEl = container.createDiv({
    cls: `gtd-section ${sec.badgeClass} ${isCollapsed ? 'collapsed' : ''}`
  });

  // Header: chevron + uppercase short title + count; full text in tooltip
  const headerEl = sectionEl.createDiv({ cls: 'gtd-section-header' });
  headerEl.title = `${sec.title}\n${sec.subtitle}`;

  const toggleIcon = headerEl.createSpan({ cls: 'gtd-toggle-icon' });
  setIcon(toggleIcon, 'chevron-down');

  const titleGroup = headerEl.createDiv({ cls: 'gtd-title-group' });
  titleGroup.createSpan({
    cls: 'gtd-section-title',
    text: getSectionShortTitle(sec.id, sec.title)
  });
  titleGroup.createSpan({
    cls: 'gtd-count-badge',
    text: String(tasks.length)
  });

  headerEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const collapsed = new Set(ctx.getState().collapsedSections);
    if (collapsed.has(sec.id)) {
      collapsed.delete(sec.id);
    } else {
      collapsed.add(sec.id);
    }
    ctx.setState({ collapsedSections: collapsed });
  });

  // Drag-and-Drop on Section
  sectionEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    sectionEl.addClass('gtd-drag-over');
  });

  sectionEl.addEventListener('dragleave', () => {
    sectionEl.removeClass('gtd-drag-over');
  });

  sectionEl.addEventListener('drop', async (e) => {
    e.preventDefault();
    sectionEl.removeClass('gtd-drag-over');

    const taskId = e.dataTransfer?.getData('text/plain');
    if (!taskId) return;

    const task = ctx.taskStore.getTasks().find((t) => t.id === taskId);
    if (!task) return;

    // Swimlane list drops fold the role change into the single transition write
    await ctx.handleTaskDrop(task, sec.id, roleTag as RoleId | null | undefined);
  });

  // Body
  if (!isCollapsed) {
    const bodyEl = sectionEl.createDiv({ cls: 'gtd-section-body' });

    if (tasks.length === 0) {
      bodyEl.createDiv({
        cls: 'gtd-empty-state',
        text: 'No tasks here. Drop a task or add one below.'
      });
    } else {
      const sorted = sortTasks(tasks, ctx.getState().sortCriteria);

      for (const task of sorted) {
        renderTaskItem(bodyEl, task, ctx);
      }
    }

    renderQuickAddRow(bodyEl, sec.id, roleTag, ctx, true);
  }
}

/** Role swimlanes, each stacking the active-mode accordion sections. */
export function renderSwimlaneList(
  container: HTMLElement,
  sections: SectionDefinition[],
  tasks: TaskItem[],
  todayStr: string,
  ctx: ViewContext
): void {
  const state = ctx.getState();
  const wrapper = container.createDiv({ cls: 'gtd-swimlanes-list-wrapper' });

  for (const lane of getSwimlaneDefinitions(ctx.settings.configuredRoleTags)) {
    if (!state.activeFilterRoles.has(lane.id)) continue;

    const laneTasks = tasks.filter((t) => t.effectiveRole === lane.id);
    if (lane.id === 'untagged' && laneTasks.length === 0) continue;

    const isCollapsed = state.collapsedSwimlanes.has(lane.id);
    const laneEl = wrapper.createDiv({
      cls: `gtd-swimlane-list-group ${lane.badgeClass} ${isCollapsed ? 'is-collapsed' : ''}`
    });

    // Role Header
    const headerEl = laneEl.createDiv({ cls: 'gtd-swimlane-list-header' });
    const toggleIcon = headerEl.createSpan({ cls: 'gtd-toggle-icon' });
    setIcon(toggleIcon, isCollapsed ? 'chevron-right' : 'chevron-down');

    const iconSpan = headerEl.createSpan({ cls: 'gtd-swimlane-icon' });
    setIcon(iconSpan, lane.icon);

    const titleGroup = headerEl.createDiv({ cls: 'gtd-swimlane-title-group' });
    titleGroup.createSpan({ cls: 'gtd-swimlane-title', text: lane.title });
    titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(laneTasks.length) });

    headerEl.createDiv({ cls: 'gtd-swimlane-subtitle', text: lane.subtitle });

    headerEl.addEventListener('click', (e) => {
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

    const bodyEl = laneEl.createDiv({ cls: 'gtd-swimlane-list-body' });
    for (const sec of sections) {
      const secTasks = laneGrouped.get(sec.id) || [];
      renderSection(bodyEl, sec, secTasks, lane.roleTag, ctx);
    }
  }
}

/** By Date list: accordion buckets; hides empty groups except Completed Today. */
export function renderDateList(
  container: HTMLElement,
  buckets: DateBucketDefinition[],
  grouped: Map<string, TaskItem[]>,
  ctx: ViewContext
): void {
  const wrapper = container.createDiv({ cls: 'gtd-sections-wrapper' });
  for (const bucket of buckets) {
    const tasks = grouped.get(bucket.id) || [];
    if (tasks.length === 0 && bucket.id !== DATE_BUCKET_COMPLETED) continue;
    renderDateSection(wrapper, bucket, tasks, ctx);
  }
}

function renderDateSection(
  container: HTMLElement,
  bucket: DateBucketDefinition,
  tasks: TaskItem[],
  ctx: ViewContext
): void {
  const isCollapsed = ctx.getState().collapsedSections.has(bucket.id);
  const sectionEl = container.createDiv({
    cls: `gtd-section ${bucket.badgeClass} ${isCollapsed ? 'collapsed' : ''}`
  });

  // Header: toggle chevron + bucket icon + short title + count
  const headerEl = sectionEl.createDiv({ cls: 'gtd-section-header' });
  headerEl.title = `${bucket.title}\n${bucket.subtitle}`;

  const toggleIcon = headerEl.createSpan({ cls: 'gtd-toggle-icon' });
  setIcon(toggleIcon, 'chevron-down');

  const iconSpan = headerEl.createSpan({ cls: 'gtd-bucket-icon' });
  setIcon(iconSpan, bucket.icon);

  const titleGroup = headerEl.createDiv({ cls: 'gtd-title-group' });
  titleGroup.createSpan({
    cls: 'gtd-section-title',
    text: bucket.title.split('—')[0].trim()
  });
  titleGroup.createSpan({ cls: 'gtd-count-badge', text: String(tasks.length) });

  headerEl.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    const collapsed = new Set(ctx.getState().collapsedSections);
    if (collapsed.has(bucket.id)) {
      collapsed.delete(bucket.id);
    } else {
      collapsed.add(bucket.id);
    }
    ctx.setState({ collapsedSections: collapsed });
  });

  // Drop handling: day buckets accept drops (scheduling gesture); others reject
  if (bucket.dayDate) {
    const dayDate = bucket.dayDate;
    sectionEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
      sectionEl.addClass('gtd-drag-over');
    });

    sectionEl.addEventListener('dragleave', () => {
      sectionEl.removeClass('gtd-drag-over');
    });

    sectionEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      sectionEl.removeClass('gtd-drag-over');

      const taskId = e.dataTransfer?.getData('text/plain');
      if (!taskId) return;

      const task = ctx.taskStore.getTasks().find((t) => t.id === taskId);
      if (!task) return;

      await ctx.handleDateDrop(task, dayDate);
    });
  }

  // Body (tasks arrive pre-sorted from grouping)
  if (!isCollapsed) {
    const bodyEl = sectionEl.createDiv({ cls: 'gtd-section-body' });

    if (tasks.length === 0) {
      bodyEl.createDiv({
        cls: 'gtd-empty-state',
        text: 'No tasks here.'
      });
    } else {
      for (const task of tasks) {
        renderTaskItem(bodyEl, task, ctx);
      }
    }

    if (bucket.dayDate) {
      renderDateQuickAddRow(bodyEl, bucket.dayDate, ctx);
    }
  }
}
