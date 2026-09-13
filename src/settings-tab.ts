import { App, PluginSettingTab, Setting } from 'obsidian';
import type GTDMatrixPlugin from './main';
import { ViewMode, LayoutMode } from './types';

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
