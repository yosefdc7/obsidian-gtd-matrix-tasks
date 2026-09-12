export type TaskPriority = 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'none';

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
}

export type SectionId =
  | 'inbox'
  | 'q1-do'
  | 'q2-schedule'
  | 'q3-delegate'
  | 'scheduled'
  | 'q4-someday'
  | 'completed-today';

export interface SectionDefinition {
  id: SectionId;
  title: string;
  subtitle: string;
  badgeClass: string;
  icon: string;
  targetPriority: TaskPriority;
}

export interface PluginSettings {
  excludedFolders: string[];
  autoAddCreatedDate: boolean;
  defaultDailyNoteFolder: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  excludedFolders: [
    'References/Templates',
    'zArchive',
    'References/System/Tests'
  ],
  autoAddCreatedDate: false,
  defaultDailyNoteFolder: 'Jots'
};
