import { App, TFile } from 'obsidian';
import { TaskItem, RoleId, ConfiguredRole } from '../types';
import { extractRoleFromTags, extractRoleFromPath, extractRoleFromIdentities, DEFAULT_ROLE_DEFS } from '../parser';

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

    // 2. Linked note role (Project-first priority, otherwise first match)
    if (task.linkedNotes && task.linkedNotes.length > 0) {
      let firstResolvedRole: RoleId | null = null;
      let projectResolvedRole: RoleId | null = null;

      for (const link of task.linkedNotes) {
        const targetFile = this.app.metadataCache.getFirstLinkpathDest(link, task.filePath);
        if (targetFile) {
          const cache = this.app.metadataCache.getFileCache(targetFile);
          const normPath = targetFile.path.replace(/\\/g, '/');
          const isProject =
            normPath.includes('/Projects/') ||
            (typeof cache?.frontmatter?.type === 'string' && cache.frontmatter.type.toLowerCase() === 'project') ||
            (Array.isArray(cache?.frontmatter?.tags) &&
              cache.frontmatter.tags.some((t: unknown) => String(t).replace(/^#/, '').toLowerCase() === 'project'));

          const frontTags = cache?.frontmatter?.tags;
          const tagsList: string[] = Array.isArray(frontTags)
            ? frontTags.map(String)
            : typeof frontTags === 'string'
            ? frontTags.split(',').map((s) => s.trim())
            : [];

          const role =
            extractRoleFromIdentities(cache?.frontmatter?.identities, this.configuredRoles) ||
            extractRoleFromPath(targetFile.path, this.configuredRoles) ||
            extractRoleFromIdentities([targetFile.basename], this.configuredRoles) ||
            extractRoleFromTags(tagsList, this.configuredRoles);

          if (role) {
            if (!firstResolvedRole) {
              firstResolvedRole = role;
            }
            if (isProject) {
              projectResolvedRole = role;
              break; // Project-first priority matched
            }
          }
        } else {
          // Direct identity note mention (even if file dest wasn't immediately cached)
          const directRole = extractRoleFromIdentities([link], this.configuredRoles);
          if (directRole && !firstResolvedRole) {
            firstResolvedRole = directRole;
          }
        }
      }

      if (projectResolvedRole) {
        return { role: projectResolvedRole, source: 'linked-note' };
      }
      if (firstResolvedRole) {
        return { role: firstResolvedRole, source: 'linked-note' };
      }
    }

    // 3. Parent note role (frontmatter identities > path > frontmatter tags)
    const parentAbstract = this.app.vault.getAbstractFileByPath(task.filePath);
    if (parentAbstract instanceof TFile) {
      const parentCache = this.app.metadataCache.getFileCache(parentAbstract);
      const parentIdentityRole = extractRoleFromIdentities(parentCache?.frontmatter?.identities, this.configuredRoles);
      if (parentIdentityRole) {
        return { role: parentIdentityRole, source: 'parent-note' };
      }
      const parentPathRole = extractRoleFromPath(task.filePath, this.configuredRoles);
      if (parentPathRole) {
        return { role: parentPathRole, source: 'parent-note' };
      }
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
    } else {
      const parentPathRole = extractRoleFromPath(task.filePath, this.configuredRoles);
      if (parentPathRole) {
        return { role: parentPathRole, source: 'parent-note' };
      }
    }

    // 4. Fallback
    return { role: 'untagged', source: 'none' };
  }
}
