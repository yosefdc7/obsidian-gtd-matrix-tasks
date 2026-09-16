export type TaskPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'none';

export type ViewMode = 'gtd' | 'eisenhower' | 'date';
export type LayoutMode = 'board' | 'list';
export type SortCriteria = 'date' | 'priority' | 'title' | 'created';
export type TagViewMode = 'filter' | 'swimlanes';

/** Date field that positions a task in the By Date view. */
export type DateAnchorField = 'start' | 'scheduled' | 'due';

export type RoleId = string;

export interface ConfiguredRole {
  id: RoleId;
  label: string;
  tag: string;
}

export interface SwimlaneDefinition {
  id: RoleId;
  title: string;
  subtitle: string;
  icon: string;
  badgeClass: string;
  roleTag: string | null;
}

export type GTDSectionId =
  | 'gtd-inbox'
  | 'gtd-next-actions'
  | 'gtd-waiting'
  | 'gtd-scheduled'
  | 'gtd-someday'
  | 'gtd-completed';

export type EisenhowerSectionId =
  | 'eisen-q1'
  | 'eisen-q2'
  | 'eisen-q3'
  | 'eisen-q4'
  | 'eisen-inbox'
  | 'eisen-completed';

export type SectionId = GTDSectionId | EisenhowerSectionId;

export interface TaskItem {
  id: string;
  filePath: string;
  fileName: string;
  lineNumber: number;
  rawText: string;
  indent: string;
  statusChar: string;
  isCompleted: boolean;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  scheduledDate: string | null;
  startDate: string | null;
  completedDate: string | null;
  createdDate: string | null;
  tags: string[];
  isWaiting: boolean;
  isSomeday: boolean;
  isProject: boolean;
  linkedNotes: string[];
  effectiveRole: RoleId;
  roleSource: 'inline' | 'linked-note' | 'parent-note' | 'none';
}

export interface SectionDefinition {
  id: SectionId;
  title: string;
  subtitle: string;
  badgeClass: string;
  icon: string;
  targetPriority?: TaskPriority;
}

export interface PluginSettings {
  excludedFolders: string[];
  autoAddCreatedDate: boolean;
  defaultDailyNoteFolder: string;
  defaultViewMode: ViewMode;
  defaultLayoutMode: LayoutMode;
  defaultSortCriteria: SortCriteria;
  defaultTagViewMode: TagViewMode;
  configuredRoleTags: string;
  activeFilterRoles: string[];
  autoInitializeNoteProperties: boolean;
  autoMoveNotes: boolean;
  autoInheritParentLinks: boolean;
  autoInheritActiveWindowHours: number;
  enableLatestBacklinkHover: boolean;
  backlinkHoverDelayMs: number;
  backlinkHoverMaxChars: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  excludedFolders: [
    'References/Templates',
    'zArchive',
    'References/System/Tests'
  ],
  autoAddCreatedDate: false,
  defaultDailyNoteFolder: 'Jots',
  defaultViewMode: 'gtd',
  defaultLayoutMode: 'board',
  defaultSortCriteria: 'date',
  defaultTagViewMode: 'filter',
  configuredRoleTags: 'role/yo-manager, role/josef-selfcare, role/rj-supportive',
  activeFilterRoles: [
    'role/yo-manager',
    'role/josef-selfcare',
    'role/rj-supportive',
    'untagged'
  ],
  autoInitializeNoteProperties: true,
  autoMoveNotes: true,
  autoInheritParentLinks: true,
  autoInheritActiveWindowHours: 24,
  enableLatestBacklinkHover: true,
  backlinkHoverDelayMs: 250,
  backlinkHoverMaxChars: 200,
};

