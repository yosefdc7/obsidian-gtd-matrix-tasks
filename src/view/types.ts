import type { App, Component } from 'obsidian';
import type {
  DateAnchorField,
  LayoutMode,
  PluginSettings,
  RoleId,
  SectionDefinition,
  SectionId,
  SortCriteria,
  SwimlaneDefinition,
  TagViewMode,
  TaskItem,
  ViewMode
} from '../types';
import type { TaskStore } from '../store/task-store';
import type { TaskMutator } from '../store/task-mutator';
import type { QuickFilterChip } from './task-filter';
import { parseConfiguredRoles } from '../parser';

export const VIEW_TYPE_GTD_MATRIX = 'gtd-matrix-tasks-view';

export const GTD_SECTIONS: SectionDefinition[] = [
  {
    id: 'gtd-inbox',
    title: 'Inbox — Capture',
    subtitle: 'Raw unprocessed capture items and daily note jots.',
    badgeClass: 'badge-inbox',
    icon: 'inbox'
  },
  {
    id: 'gtd-next-actions',
    title: 'Next Actions — Ready to Do',
    subtitle: 'Clarified actionable steps ready to execute now.',
    badgeClass: 'badge-next-actions',
    icon: 'zap'
  },
  {
    id: 'gtd-waiting',
    title: 'Waiting For — Blocked & Delegated',
    subtitle: 'Tasks on hold [?] or awaiting someone else (#waiting).',
    badgeClass: 'badge-q3',
    icon: 'clock'
  },
  {
    id: 'gtd-scheduled',
    title: 'Scheduled — Calendar & Deadlines',
    subtitle: 'Commitments due or scheduled in the next 7 days.',
    badgeClass: 'badge-scheduled',
    icon: 'calendar'
  },
  {
    id: 'gtd-someday',
    title: 'Someday / Maybe — Incubating Backlog',
    subtitle: 'Ideas, aspirational projects, and deferred backlog.',
    badgeClass: 'badge-q4',
    icon: 'archive'
  },
  {
    id: 'gtd-completed',
    title: 'Completed Today',
    subtitle: 'Tasks checked off today. Celebrate your momentum!',
    badgeClass: 'badge-done',
    icon: 'check-circle'
  }
];

export const EISENHOWER_SECTIONS: SectionDefinition[] = [
  {
    id: 'eisen-q1',
    title: 'Q1: Urgent & Important — Do First',
    subtitle: 'Crises, pressing deadlines, and top priorities.',
    badgeClass: 'badge-q1',
    icon: 'alert-triangle'
  },
  {
    id: 'eisen-q2',
    title: 'Q2: Important — Schedule & Focus',
    subtitle: 'Strategic work, planning, health, and skill building.',
    badgeClass: 'badge-q2',
    icon: 'compass'
  },
  {
    id: 'eisen-q3',
    title: 'Q3: Urgent — Delegate & Waiting',
    subtitle: 'Interruptions, delegated items, and on-hold tasks.',
    badgeClass: 'badge-q3',
    icon: 'clock'
  },
  {
    id: 'eisen-q4',
    title: 'Q4: Low Priority — Someday / Eliminate',
    subtitle: 'Low-value backlog, distractions, and deferred items.',
    badgeClass: 'badge-q4',
    icon: 'archive'
  },
  {
    id: 'eisen-inbox',
    title: 'Inbox — Untriaged Tasks',
    subtitle: 'Tasks without a priority level assigned yet.',
    badgeClass: 'badge-inbox',
    icon: 'inbox'
  },
  {
    id: 'eisen-completed',
    title: 'Completed Today',
    subtitle: 'Tasks checked off today.',
    badgeClass: 'badge-done',
    icon: 'check-circle'
  }
];

export const ROLE_SWIMLANES: SwimlaneDefinition[] = [
  {
    id: 'role/yo-manager',
    title: 'Yo Manager',
    subtitle: 'Engineering, product delivery, apps, and operations.',
    icon: 'briefcase',
    badgeClass: 'badge-role-yo-manager',
    roleTag: 'role/yo-manager'
  },
  {
    id: 'role/josef-selfcare',
    title: 'Josef Self-Care',
    subtitle: 'Health, personal growth, habits, and life strategy.',
    icon: 'heart',
    badgeClass: 'badge-role-josef-selfcare',
    roleTag: 'role/josef-selfcare'
  },
  {
    id: 'role/rj-supportive',
    title: 'RJ Supportive',
    subtitle: 'Family, home, partner support, and shared commitments.',
    icon: 'users',
    badgeClass: 'badge-role-rj-supportive',
    roleTag: 'role/rj-supportive'
  },
  {
    id: 'untagged',
    title: 'Other / Untagged',
    subtitle: 'Tasks without a designated role tag or link.',
    icon: 'help-circle',
    badgeClass: 'badge-role-untagged',
    roleTag: null
  }
];

export function getSwimlaneDefinitions(configuredRoleTags?: string): SwimlaneDefinition[] {
  const configured = parseConfiguredRoles(configuredRoleTags);
  const lanes: SwimlaneDefinition[] = configured.map((c) => ({
    id: c.id,
    title: c.label,
    subtitle: `Tasks categorized under ${c.label}.`,
    icon: c.id === 'role/yo-manager' ? 'briefcase' : c.id === 'role/josef-selfcare' ? 'heart' : c.id === 'role/rj-supportive' ? 'users' : 'tag',
    badgeClass: `badge-${c.id.replace('/', '-')}`,
    roleTag: c.tag
  }));
  lanes.push({
    id: 'untagged',
    title: 'Other / Untagged',
    subtitle: 'Tasks without a designated role tag or link.',
    icon: 'help-circle',
    badgeClass: 'badge-role-untagged',
    roleTag: null
  });
  return lanes;
}

/** Compact section title used by composer chips and stream/list headers. */
export function getSectionShortTitle(secId: SectionId, defaultTitle: string): string {
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

/** Mutable view state owned by the coordinator. */
export interface ViewState {
  viewMode: ViewMode;
  layoutMode: LayoutMode;
  sortCriteria: SortCriteria;
  tagViewMode: TagViewMode;
  /** By Date anchor field; session-only, defaults to Scheduled. */
  dateAnchor: DateAnchorField;
  activeFilterRoles: Set<RoleId>;
  collapsedSwimlanes: Set<RoleId>;
  searchQuery: string;
  activeChip: QuickFilterChip;
  selectedFolder: string;
  collapsedSections: Set<string>;
  /** Options disclosure (sort/folder/chips); session-only, default false. */
  optionsOpen: boolean;
  /** Expandable mobile search bar toggle; session-only, default false. */
  mobileSearchOpen?: boolean;
}

/**
 * Seam between the GTDMatrixView coordinator and the renderer modules.
 * Renderers read state through getState(), request changes through setState()
 * (merge + re-render), and route user actions back to the coordinator.
 */
export interface ViewContext {
  app: App;
  component: Component;
  taskStore: TaskStore;
  taskMutator: TaskMutator;
  settings: PluginSettings;
  getState(): ViewState;
  setState(partial: Partial<ViewState>): void;
  render(): void;
  handleTaskDrop(task: TaskItem, targetSection: SectionId, roleTag?: RoleId | null): Promise<void>;
  /** By Date day-bucket drop: sets the anchor field's date (scheduling gesture). */
  handleDateDrop(task: TaskItem, dayDate: string): Promise<void>;
  openQuickAddModal(sectionId?: SectionId): void;
  getTodayDateString(): string;
  rescan(): Promise<void>;
  saveSettings(): Promise<void>;
}
