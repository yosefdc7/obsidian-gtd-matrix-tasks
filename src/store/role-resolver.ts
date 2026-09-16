import { App, TFile } from 'obsidian';
import { TaskItem, RoleId, ConfiguredRole } from '../types';
import { extractRoleFromTags, extractRoleFromPath, DEFAULT_ROLE_DEFS } from '../parser';

export interface ResolvedRole {
  role: RoleId;
  source: 'inline' | 'linked-note' | 'parent-note' | 'none';
}

export class RoleResolver {
  private configuredRoles: ConfiguredRole[] = DEFAULT_ROLE_DEFS;

  constructor(private app: App, configuredRoles?: ConfiguredRole[]) {
    if (configuredRoles && configuredRoles.length > 0) {
      this.configuredRoles = configuredRoles;
    }
  }

  public setConfiguredRoles(roles: ConfiguredRole[]): void {
    this.configuredRoles = roles;
  }

  public getConfiguredRoles(): ConfiguredRole[] {
    return this.configuredRoles;
  }

  public resolveTaskRole(task: TaskItem): ResolvedRole {
    // 1. Inline tag on task
    const inlineRole = extractRoleFromTags(task.tags, this.configuredRoles);
    if (inlineRole) {
      return { role: inlineRole, source: 'inline' };
    }

    // 2. Linked note role
    if (task.linkedNotes && task.linkedNotes.length > 0) {
      for (const link of task.linkedNotes) {
        const targetFile = this.app.metadataCache.getFirstLinkpathDest(link, task.filePath);
        if (targetFile) {
          const pathRole = extractRoleFromPath(targetFile.path, this.configuredRoles);
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
          const tagRole = extractRoleFromTags(tagsList, this.configuredRoles);
          if (tagRole) {
            return { role: tagRole, source: 'linked-note' };
          }
        }
      }
    }

    // 3. Parent note role (path or frontmatter)
    const parentPathRole = extractRoleFromPath(task.filePath, this.configuredRoles);
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
      const parentTagRole = extractRoleFromTags(tagsList, this.configuredRoles);
      if (parentTagRole) {
        return { role: parentTagRole, source: 'parent-note' };
      }
    }

    // 4. Fallback
    return { role: 'untagged', source: 'none' };
  }
}
