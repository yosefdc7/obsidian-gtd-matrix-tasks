export type TaskPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'none';

export type ViewMode = 'gtd' | 'eisenhower';

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
  tags: string[];
  isWaiting: boolean;
  isSomeday: boolean;
  isProject: boolean;
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
}

export const DEFAULT_SETTINGS: PluginSettings = {
  excludedFolders: [
    'References/Templates',
    'zArchive',
    'References/System/Tests'
  ],
  autoAddCreatedDate: false,
  defaultDailyNoteFolder: 'Jots',
  defaultViewMode: 'gtd'
};
