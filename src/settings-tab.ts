import { App, PluginSettingTab, Setting } from 'obsidian';
import type GTDMatrixPlugin from './main';
import { ViewMode, LayoutMode, SortCriteria, TagViewMode } from './types';
import { parseConfiguredRoles } from './parser';

export class GTDMatrixSettingTab extends PluginSettingTab {
  plugin: GTDMatrixPlugin;

  constructor(app: App, plugin: GTDMatrixPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'GTD Matrix Tasks Settings' });

    new Setting(containerEl)
      .setName('Default view mode')
      .setDesc('Choose the default view when opening GTD Matrix Tasks.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('gtd', 'GTD Workflow (6 stages)')
          .addOption('eisenhower', 'Eisenhower Matrix (4 quadrants)')
          .addOption('date', 'By Date (date buckets)')
          .setValue(this.plugin.settings.defaultViewMode || 'gtd')
          .onChange(async (value) => {
            this.plugin.settings.defaultViewMode = value as ViewMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default layout style')
      .setDesc('Choose between visual Kanban board columns or collapsible accordion lists.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('board', 'Kanban Board')
          .addOption('list', 'List Accordions')
          .setValue(this.plugin.settings.defaultLayoutMode || 'board')
          .onChange(async (value) => {
            this.plugin.settings.defaultLayoutMode = value as LayoutMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default sort criteria')
      .setDesc('Default ordering applied to tasks within each section/column.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('date', 'Date (Earliest first)')
          .addOption('priority', 'Priority (Highest to Lowest)')
          .addOption('title', 'Title (Alphabetical A-Z)')
          .addOption('created', 'Created Date (Newest first)')
          .setValue(this.plugin.settings.defaultSortCriteria || 'date')
          .onChange(async (value) => {
            this.plugin.settings.defaultSortCriteria = value as SortCriteria;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default role mode')
      .setDesc('Choose whether role tags filter standard columns or create horizontal swimlanes.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('filter', 'Filter Mode (hide non-matching)')
          .addOption('swimlanes', 'Swimlanes Mode (horizontal role rows)')
          .setValue(this.plugin.settings.defaultTagViewMode || 'filter')
          .onChange(async (value) => {
            this.plugin.settings.defaultTagViewMode = value as TagViewMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Role tags')
      .setDesc('Comma-separated list of role tags used for filtering, swimlanes, and pills (e.g., "role/yo-manager, role/josef-selfcare, role/rj-supportive"). Labels are automatically formatted in Title Case.')
      .addText((text) => {
        text
          .setPlaceholder('role/yo-manager, role/josef-selfcare, role/rj-supportive')
          .setValue(this.plugin.settings.configuredRoleTags || '')
          .onChange(async (value) => {
            this.plugin.settings.configuredRoleTags = value;
            const parsed = parseConfiguredRoles(value);
            this.plugin.settings.activeFilterRoles = [...parsed.map((r) => r.id), 'untagged'];
            await this.plugin.saveSettings();
            this.plugin.scanner.updateSettings(this.plugin.settings);
            await this.plugin.scanner.scanVault();
          });
      });


    new Setting(containerEl)
      .setName('Default daily notes folder')
      .setDesc('Folder where quick-add appends tasks to today\'s daily note (e.g., Jots).')
      .addText((text) => {
        text
          .setPlaceholder('Jots')
          .setValue(this.plugin.settings.defaultDailyNoteFolder || 'Jots')
          .onChange(async (value) => {
            this.plugin.settings.defaultDailyNoteFolder = value.trim() || 'Jots';
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-add creation date')
      .setDesc('Automatically append ➕ YYYY-MM-DD when quick-adding tasks from the GTD Matrix view.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoAddCreatedDate || false)
          .onChange(async (value) => {
            this.plugin.settings.autoAddCreatedDate = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Initialize properties on new notes')
      .setDesc('Automatically ensure newly created notes have the "tags" property initialized in their frontmatter.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoInitializeNoteProperties !== false)
          .onChange(async (value) => {
            this.plugin.settings.autoInitializeNoteProperties = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-move notes (Topics & Roles)')
      .setDesc('Automatically evict non-dated notes from Jots and route notes to proper Topics, Roles, and Resources based on tags.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoMoveNotes !== false)
          .onChange(async (value) => {
            this.plugin.settings.autoMoveNotes = value;
            this.plugin.autoMover?.updateSettings(this.plugin.settings);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Auto-inherit parent bullet links (on note exit & startup)')
      .setDesc('Automatically discover parent bullet linked notes in active Daily Jots and write them onto indented child tasks when navigating away or on startup (zero typing interference).')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoInheritParentLinks !== false)
          .onChange(async (value) => {
            this.plugin.settings.autoInheritParentLinks = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Active window for daily jots (hours)')
      .setDesc('Rolling window in hours for Daily Jots auto-linking (default: 24h for today and yesterday, keeping note loading instantaneous).')
      .addText((text) => {
        text
          .setPlaceholder('24')
          .setValue(String(this.plugin.settings.autoInheritActiveWindowHours ?? 24))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed > 0) {
              this.plugin.settings.autoInheritActiveWindowHours = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Enable latest backlink hover tooltip')
      .setDesc('Hovering over any internal link displays the latest backlink mention. Hold Alt (or Shift) to use standard Obsidian Page Preview.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.enableLatestBacklinkHover !== false)
          .onChange(async (value) => {
            this.plugin.settings.enableLatestBacklinkHover = value;
            this.plugin.hoverManager?.updateSettings(this.plugin.settings);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Backlink hover delay (ms)')
      .setDesc('Delay before displaying the backlink tooltip on hover (prevents accidental triggers during fast mouse movement). Default: 250ms.')
      .addSlider((slider) => {
        slider
          .setLimits(100, 800, 25)
          .setValue(this.plugin.settings.backlinkHoverDelayMs ?? 250)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.backlinkHoverDelayMs = value;
            this.plugin.hoverManager?.updateSettings(this.plugin.settings);
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Excluded folders')
      .setDesc('Folders to exclude from task indexing (one folder path per line).')
      .addTextArea((text) => {
        text
          .setPlaceholder('References/Templates\nzArchive\nReferences/System/Tests')
          .setValue((this.plugin.settings.excludedFolders || []).join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.excludedFolders = value
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 35;
      });
  }
}
