import { App, TFile } from 'obsidian';
import { TaskItem, RoleId } from '../types';
import { extractRoleFromTags, extractRoleFromPath } from '../parser';

export interface ResolvedRole {
  role: RoleId;
  source: 'inline' | 'linked-note' | 'parent-note' | 'none';
}

export class RoleResolver {
  constructor(private app: App) {}

  public resolveTaskRole(task: TaskItem): ResolvedRole {
    // 1. Inline tag on task
    const inlineRole = extractRoleFromTags(task.tags);
    if (inlineRole) {
      return { role: inlineRole, source: 'inline' };
    }

    // 2. Linked note role
    if (task.linkedNotes && task.linkedNotes.length > 0) {
      for (const link of task.linkedNotes) {
        const targetFile = this.app.metadataCache.getFirstLinkpathDest(link, task.filePath);
        if (targetFile) {
          const pathRole = extractRoleFromPath(targetFile.path);
          if (pathRole) {
            return { role: pathRole, source: 'linked-note' };
          }
          const cache = this.app.metadataCache.getFileCache(targetFile);
          const frontTags = cache?.frontmatter?.tags;
          const tagsList: string[] = Array.isArray(frontTags)
            ? frontTags.map(String)
            : typeof frontTags === 'string'
            ? frontTags.split(',').map((s) => s.trim())
            : [];
          const tagRole = extractRoleFromTags(tagsList);
          if (tagRole) {
            return { role: tagRole, source: 'linked-note' };
          }
        }
      }
    }

    // 3. Parent note role (path or frontmatter)
    const parentPathRole = extractRoleFromPath(task.filePath);
    if (parentPathRole) {
      return { role: parentPathRole, source: 'parent-note' };
    }
    const parentAbstract = this.app.vault.getAbstractFileByPath(task.filePath);
    if (parentAbstract instanceof TFile) {
      const parentCache = this.app.metadataCache.getFileCache(parentAbstract);
      const frontTags = parentCache?.frontmatter?.tags;
      const tagsList: string[] = Array.isArray(frontTags)
        ? frontTags.map(String)
        : typeof frontTags === 'string'
        ? frontTags.split(',').map((s) => s.trim())
        : [];
      const parentTagRole = extractRoleFromTags(tagsList);
      if (parentTagRole) {
        return { role: parentTagRole, source: 'parent-note' };
      }
    }

    // 4. Fallback
    return { role: 'untagged', source: 'none' };
  }
}
