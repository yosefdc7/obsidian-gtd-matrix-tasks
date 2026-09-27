import type { App, TFile, CachedMetadata } from 'obsidian';
import { isDateTitledNote } from './date-utils';
import { PluginSettings } from './types';
import { extractRoleFromIdentities } from './parser';

export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '').replace(/\/$/, '');
}

export const EXCLUDED_PREFIXES = [
  'System/',
  'References/Templates/',
  'References/System/',
  'zArchive/',
  '.obsidian/'
];

/**
 * Root Facet and Identity Anchor files that must never be moved automatically
 */
export const PROTECTED_EXACT_FILES = new Set([
  '00 Identity/Josef Romeo.md',
  '00 Identity/Yo the Manager/Yo the Manager.md',
  '00 Identity/Josef with Self Care/Josef with Self Care.md',
  '00 Identity/RJ the Supportive/RJ the Supportive.md'
]);

/**
 * Canonical Area Folder mapping per Knowledge Model v2
 */
export const AREA_FOLDER_MAP: Record<string, string> = {
  'work & leadership': '00 Identity/Yo the Manager/Work & Leadership',
  'property & business': '00 Identity/Yo the Manager/Property & Business',
  'agile & delivery': '00 Identity/Yo the Manager/Work & Leadership',
  'health & fitness': '00 Identity/Josef with Self Care/Health & Fitness',
  'investing & trading': '00 Identity/Josef with Self Care/Investing & Trading',
  'trading & finance': '00 Identity/Josef with Self Care/Investing & Trading',
  'personal systems & pkm': '00 Identity/Josef with Self Care/Personal Systems & PKM',
  'system & pkm': '00 Identity/Josef with Self Care/Personal Systems & PKM',
  'life admin': '00 Identity/Josef with Self Care/Life Admin',
  'admin & life': '00 Identity/Josef with Self Care/Life Admin',
  'family & relationships': '00 Identity/RJ the Supportive/Family & Relationships',
  'home & household': '00 Identity/RJ the Supportive/Home & Household'
};

export const AREA_TAG_MAP: Record<string, string[]> = {
  '00 Identity/Josef with Self Care/Investing & Trading': [
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
  '00 Identity/Yo the Manager/Work & Leadership': [
    'agile',
    'scrum',
    'delivery',
    'management',
    'operations',
    'leadership',
    'product',
    'roadmap'
  ],
  '00 Identity/Josef with Self Care/Life Admin': [
    'admin',
    'tax',
    'taxes',
    'legal',
    'government'
  ],
  '00 Identity/RJ the Supportive/Family & Relationships': [
    'family',
    'relationship',
    'relationships',
    'parenting',
    'parents'
  ],
  '00 Identity/RJ the Supportive/Home & Household': [
    'home',
    'household',
    'house',
    'furniture',
    'maintenance'
  ],
  '00 Identity/Josef with Self Care/Personal Systems & PKM': [
    'system',
    'pkm',
    'obsidian',
    'amplenote',
    'meta',
    'plugin',
    'plugins'
  ]
};

export const TYPE_RESOURCE_MAP: Record<string, string> = {
  guide: 'References/Guides',
  guides: 'References/Guides',
  playbook: 'References/Playbooks',
  playbooks: 'References/Playbooks',
  person: 'References/People',
  people: 'References/People',
  'area/people': 'References/People',
  partner: 'References/Partners',
  partners: 'References/Partners',
  company: 'References/Partners',
  companies: 'References/Partners',
  source: 'References/Sources',
  sources: 'References/Sources',
  book: 'References/Sources',
  books: 'References/Sources',
  article: 'References/Sources',
  articles: 'References/Sources',
  goal: 'References/Goals',
  goals: 'References/Goals',
  topic: 'References/Topics',
  topics: 'References/Topics'
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

export function cleanLinkOrText(val: unknown): string {
  if (!val) return '';
  return String(val)
    .replace(/\[\[|\]\]/g, '')
    .replace(/\|.*$/, '')
    .trim();
}

export function resolveRole(
  frontmatter?: Record<string, unknown>,
  tags?: string[]
): string | null {
  if (frontmatter) {
    if (frontmatter.identities) {
      const identityRole = extractRoleFromIdentities(frontmatter.identities);
      if (identityRole) return identityRole;
    }
    if (typeof frontmatter.role === 'string' && frontmatter.role.trim()) {
      const clean = cleanLinkOrText(frontmatter.role).toLowerCase();
      const identityRole = extractRoleFromIdentities([clean]);
      if (identityRole) return identityRole;
      if (ROLE_PROJECT_MAP[clean]) return clean;
      if (ROLE_PROJECT_MAP[`role/${clean}`]) return `role/${clean}`;
    }
  }

  if (tags && tags.length > 0) {
    for (const t of tags) {
      const norm = normalizeTag(t);
      if (ROLE_PROJECT_MAP[norm]) return norm;
      const identityRole = extractRoleFromIdentities([norm]);
      if (identityRole) return identityRole;
    }
  }

  return null;
}

export function isProtected(normPath: string): boolean {
  for (const prefix of EXCLUDED_PREFIXES) {
    if (normPath.startsWith(normalizePath(prefix))) {
      return true;
    }
  }
  if (PROTECTED_EXACT_FILES.has(normPath)) {
    return true;
  }
  // Protect Area Root index notes (e.g. "00 Identity/Yo the Manager/Work & Leadership/Work & Leadership.md")
  const parts = normPath.split('/');
  if (parts.length >= 4 && parts[0] === '00 Identity') {
    const parentFolder = parts[parts.length - 2];
    const fileNameWithoutExt = parts[parts.length - 1].replace(/\.md$/, '');
    if (parentFolder.toLowerCase() === fileNameWithoutExt.toLowerCase()) {
      return true;
    }
  }
  return false;
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

  if (isProtected(normPath)) {
    return null;
  }

  const inJots = normPath.startsWith('Jots/') || normPath === 'Jots';
  const isDate = isDateTitledNote(normPath);

  if (inJots && isDate) {
    return null;
  }

  const normalizedTags = tags.map(normalizeTag);
  const rawType = frontmatter?.type ? String(frontmatter.type).trim().toLowerCase() : '';

  // 1. PROJECT ROUTING (Property-first or tag-first)
  const isProject =
    rawType === 'project' ||
    rawType.endsWith('/project') ||
    normalizedTags.includes('project') ||
    normalizedTags.includes('projects');

  if (isProject) {
    const role = resolveRole(frontmatter, normalizedTags);
    if (role && ROLE_PROJECT_MAP[role]) {
      return ROLE_PROJECT_MAP[role];
    }
    return null;
  }

  // 2. AREA ROUTING (Property-first)
  if (rawType === 'area') {
    const areaProp = cleanLinkOrText(frontmatter?.area).toLowerCase();
    if (areaProp && AREA_FOLDER_MAP[areaProp]) {
      return AREA_FOLDER_MAP[areaProp];
    }
    const parentProp = cleanLinkOrText(frontmatter?.parent).toLowerCase();
    if (parentProp && AREA_FOLDER_MAP[parentProp]) {
      return AREA_FOLDER_MAP[parentProp];
    }
    for (const [targetFolder, matchTags] of Object.entries(AREA_TAG_MAP)) {
      if (normalizedTags.some((t) => matchTags.includes(t))) {
        return targetFolder;
      }
    }
    return null;
  }

  // 3. RESOURCE / REFERENCE ROUTING (Property-first)
  if (rawType && TYPE_RESOURCE_MAP[rawType]) {
    return TYPE_RESOURCE_MAP[rawType];
  }

  // If already inside 00 Identity/ and neither project, area, nor explicit reference type, don't move out
  if (normPath.startsWith('00 Identity/')) {
    return null;
  }

  // 4. FALLBACK TO TAGS (Legacy / untyped notes)
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

  // 5. JOTS EVICTION (Non-date notes created in Jots default to References/Topics)
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
      if (
        normalizePath(currentParent) === normalizePath(destinationFolder) ||
        normalizePath(file.path) === normalizePath(`${destinationFolder}/${file.name}`)
      ) {
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
