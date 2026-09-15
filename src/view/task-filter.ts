import { RoleId, SectionDefinition, SectionId, SortCriteria, TaskItem, ViewMode } from '../types';
import { getEisenhowerSection, getGTDSection, sortTasks } from '../parser';

export type QuickFilterChip = 'all' | 'urgent' | 'important' | 'projects';

export interface TaskFilterState {
  activeFilterRoles: Set<RoleId>;
  searchQuery: string;
  selectedFolder: string;
  activeChip: QuickFilterChip;
}

/** Pure filter pipeline: role, search, folder, then quick-chip predicates. */
export function filterTasks(tasks: TaskItem[], state: TaskFilterState): TaskItem[] {
  return tasks.filter((t) => {
    if (!state.activeFilterRoles.has(t.effectiveRole)) return false;

    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchesText = t.description.toLowerCase().includes(q);
      const matchesTag = t.tags.some((tag) => tag.toLowerCase().includes(q));
      const matchesFile = t.fileName.toLowerCase().includes(q);
      if (!matchesText && !matchesTag && !matchesFile) return false;
    }

    if (state.selectedFolder !== 'all') {
      const norm = t.filePath.replace(/\\/g, '/');
      if (!norm.startsWith(state.selectedFolder)) return false;
    }

    if (state.activeChip === 'urgent') {
      if (t.priority !== 'highest' && t.priority !== 'medium') return false;
    } else if (state.activeChip === 'important') {
      if (t.priority !== 'highest' && t.priority !== 'high') return false;
    } else if (state.activeChip === 'projects') {
      if (!t.isProject) return false;
    }

    return true;
  });
}

/** Buckets tasks into their sections, pre-sorted per bucket for the renderers. */
export function groupBySection(
  tasks: TaskItem[],
  sections: SectionDefinition[],
  viewMode: ViewMode,
  todayStr: string,
  sortCriteria: SortCriteria
): Map<SectionId, TaskItem[]> {
  const grouped = new Map<SectionId, TaskItem[]>();
  for (const sec of sections) {
    grouped.set(sec.id, []);
  }

  for (const task of tasks) {
    const secId = viewMode === 'gtd' ? getGTDSection(task, todayStr) : getEisenhowerSection(task, todayStr);
    if (secId) {
      grouped.get(secId)?.push(task);
    }
  }

  for (const [id, list] of grouped) {
    grouped.set(id, sortTasks(list, sortCriteria));
  }

  return grouped;
}
