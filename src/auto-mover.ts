
import type { App, TFile, CachedMetadata } from 'obsidian';
import { isDateTitledNote } from './date-utils';
import { PluginSettings } from './types';
import { extractRoleFromIdentities } from './parser';

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

export const EXCLUDED_PREFIXES = [
  '00 Identity/',
  'System/',
  'References/Templates/',
  'References/System/',
  'zArchive/',
  '.obsidian/'
];

export const AREA_TAG_MAP: Record<string, string[]> = {
  '00 Identity/Josef with Self Care/Trading & Finance': [
    'finance',
    'trading',
    'crypto',
    'stocks',
    'stock',
    'bonds',
    'bond',
    'investment',
    'investments'
  ],
  '00 Identity/Josef with Self Care/Health & Fitness': [
    'health',
    'fitness',
    'habits',
    'habit',
    'sports',
    'sport',
    'skills',
    'skill',
    'workout',
    'exercise',
    'skincare',
    'skin'
  ],
  '00 Identity/Yo the Manager/Agile & Delivery': [
    'agile',
    'scrum',
    'delivery',
    'management',
    'operations',
    'leadership',
    'product',
    'roadmap'
  ],
  '00 Identity/RJ the Supportive/Admin & Life': [
    'admin',
    'tax',
    'taxes',
    'legal',
    'family',
    'home',
    'government'
  ],
  '00 Identity/Josef with Self Care/System & PKM': [
    'system',
    'pkm',
    'obsidian',
    'amplenote',
    'meta',
    'plugin',
    'plugins'
  ]
};

export const RESOURCE_TAG_MAP: Record<string, string[]> = {
  'References/Goals': ['goal', 'goals'],
  'References/People': ['person', 'people'],
  'References/Partners': ['partner', 'partners', 'company', 'companies'],
  'References/Sources': ['source', 'sources', 'book', 'books', 'article', 'articles'],
  'References/Guides': ['guide', 'guides'],
  'References/Playbooks': ['playbook', 'playbooks']
};

export const ROLE_PROJECT_MAP: Record<string, string> = {
  'role/yo-manager': '00 Identity/Yo the Manager/Projects',
  'yo-manager': '00 Identity/Yo the Manager/Projects',
  'yo the manager': '00 Identity/Yo the Manager/Projects',
  'role/josef-selfcare': '00 Identity/Josef with Self Care/Projects',
  'josef-selfcare': '00 Identity/Josef with Self Care/Projects',
  'josef with self care': '00 Identity/Josef with Self Care/Projects',
  'role/rj-supportive': '00 Identity/RJ the Supportive/Projects',
  'rj-supportive': '00 Identity/RJ the Supportive/Projects',
  'rj the supportive': '00 Identity/RJ the Supportive/Projects'
};

export function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase();
}

export function resolveCollision(
  destinationFolder: string,
  fileName: string,
  checkExists: (path: string) => boolean
): string {
  const normFolder = normalizePath(destinationFolder);
  let targetPath = normalizePath(`${normFolder}/${fileName}`);
  if (!checkExists(targetPath)) {
    return targetPath;
  }

  const dotIndex = fileName.lastIndexOf('.');
  const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
  const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : '';

  const counterMatch = baseName.match(/^(.*?)\s*\((\d+)\)$/);
  const cleanBase = counterMatch ? counterMatch[1].trim() : baseName;
  let counter = counterMatch ? parseInt(counterMatch[2], 10) + 1 : 1;

  while (true) {
    targetPath = normalizePath(`${normFolder}/${cleanBase} (${counter})${ext}`);
    if (!checkExists(targetPath)) {
      return targetPath;
    }
    counter++;
  }
}

export function determineDestinationFolder(
  filePath: string,
  tags: string[],
  frontmatter?: Record<string, unknown>
): string | null {
  const normPath = normalizePath(filePath);

  for (const prefix of EXCLUDED_PREFIXES) {
    if (normPath.startsWith(normalizePath(prefix))) {
      return null;
    }
  }

  const inJots = normPath.startsWith('Jots/') || normPath === 'Jots';
  const isDate = isDateTitledNote(normPath);

  if (inJots && isDate) {
    return null;
  }

  const normalizedTags = tags.map(normalizeTag);

  const isProject =
    normalizedTags.includes('project') ||
    normalizedTags.includes('projects') ||
    (typeof frontmatter?.type === 'string' && frontmatter.type.toLowerCase() === 'project');

  if (isProject) {
    if (frontmatter?.identities) {
      const identityRole = extractRoleFromIdentities(frontmatter.identities);
      if (identityRole && ROLE_PROJECT_MAP[identityRole]) {
        return ROLE_PROJECT_MAP[identityRole];
      }
    }

    for (const [roleKey, targetFolder] of Object.entries(ROLE_PROJECT_MAP)) {
      if (normalizedTags.includes(roleKey)) {
        return targetFolder;
      }
    }
  }

  for (const [targetFolder, matchTags] of Object.entries(RESOURCE_TAG_MAP)) {
    if (normalizedTags.some((t) => matchTags.includes(t))) {
      return targetFolder;
    }
  }

  for (const [targetFolder, matchTags] of Object.entries(AREA_TAG_MAP)) {
    if (normalizedTags.some((t) => matchTags.includes(t))) {
      return targetFolder;
    }
  }

  if (normalizedTags.includes('topic') || normalizedTags.includes('topics')) {
    return 'References/Topics';
  }

  if (inJots && !isDate) {
    return 'References/Topics';
  }

  return null;
}

export class AutoMover {
  private app: App;
  private settings: PluginSettings;
  private isProcessing: Set<string> = new Set();

  constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  public updateSettings(settings: PluginSettings): void {
    this.settings = settings;
  }

  public async processFile(file: TFile): Promise<boolean> {
    if (this.settings.autoMoveNotes === false) {
      return false;
    }
    if (!(file as any) || file.extension !== 'md') {
      return false;
    }
    if (this.isProcessing.has(file.path)) {
      return false;
    }

    let targetPath: string | null = null;
    try {
      this.isProcessing.add(file.path);

      const fileCache = this.app.metadataCache.getFileCache(file);
      const tags: string[] = [];

      if (fileCache) {
        if (fileCache.tags) {
          for (const t of fileCache.tags) {
            if (t?.tag) tags.push(t.tag);
          }
        }

        const fmTags = fileCache.frontmatter?.tags;
        if (Array.isArray(fmTags)) {
          for (const t of fmTags) {
            if (typeof t === 'string') tags.push(t);
          }
        } else if (typeof fmTags === 'string') {
          tags.push(fmTags);
        }
      }

      const destinationFolder = determineDestinationFolder(
        file.path,
        tags,
        fileCache?.frontmatter
      );

      if (!destinationFolder) {
        return false;
      }

      const currentParent = file.parent ? file.parent.path : '';
      if (normalizePath(currentParent) === normalizePath(destinationFolder) || normalizePath(file.path) === normalizePath(`${destinationFolder}/${file.name}`)) {
        return false;
      }

      targetPath = resolveCollision(destinationFolder, file.name, (p) => {
        return !!this.app.vault.getAbstractFileByPath(p);
      });

      // Ensure destination directory exists before moving
      const normDest = normalizePath(destinationFolder);
      if (!this.app.vault.getAbstractFileByPath(normDest)) {
        await this.app.vault.createFolder(normDest);
      }

      console.log(`[GTD Matrix AutoMover] Moving "${file.path}" -> "${targetPath}"`);
      await this.app.vault.rename(file, targetPath);
      return true;
    } catch (err) {
      console.warn('[GTD Matrix AutoMover] Error moving note:', err);
      return false;
    } finally {
      this.isProcessing.delete(file.path);
      if (targetPath) {
        this.isProcessing.delete(targetPath);
      }
    }
  }

  public async evictNonDateNotesFromJots(): Promise<number> {
    if (this.settings.autoMoveNotes === false) return 0;
    const jotsFolder = this.settings.defaultDailyNoteFolder || 'Jots';
    const files = this.app.vault.getMarkdownFiles();
    let count = 0;
    for (const file of files) {
      if (file.path.startsWith(jotsFolder + '/') && !isDateTitledNote(file.path)) {
        const moved = await this.processFile(file);
        if (moved) count++;
      }
    }
    return count;
  }
}
