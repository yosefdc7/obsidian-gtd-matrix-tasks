import { App, PluginSettingTab, Setting } from 'obsidian';
import type GTDMatrixPlugin from './main';
import { ViewMode, LayoutMode, SortCriteria, TagViewMode } from './types';

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
