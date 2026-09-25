import { App, Notice, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import type GTDMatrixPlugin from './main';
import { ViewMode, LayoutMode, SortCriteria, TagViewMode, DateAnchorField } from './types';
import { parseConfiguredRoles } from './parser';

export class GTDMatrixSettingTab extends PluginSettingTab {
  plugin: GTDMatrixPlugin;
  private calendarChoices: Array<{ id: string; summary: string; timeZone?: string }> = [];

  constructor(app: App, plugin: GTDMatrixPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'GTD Matrix Tasks Settings' });

    containerEl.createEl('h3', { text: 'Google Calendar sync' });

    new Setting(containerEl)
      .setName('Enable one-way calendar sync')
      .setDesc('Projects open Start-dated tasks to the selected Google calendar. Obsidian remains the source of truth.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.calendarSyncEnabled)
        .onChange(async (value) => {
          this.plugin.settings.calendarSyncEnabled = value;
          await this.plugin.saveSettings();
          if (value) this.plugin.calendarSync.schedule(0);
          this.display();
        }));

    new Setting(containerEl)
      .setName('Google OAuth client ID')
      .setDesc('Web OAuth client ID from your personal Google Cloud project.')
      .addText((text) => text
        .setPlaceholder('...apps.googleusercontent.com')
        .setValue(this.plugin.settings.googleOAuthClientId)
        .onChange(async (value) => {
          this.plugin.settings.googleOAuthClientId = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Google OAuth client secret')
      .setDesc('Stored in Obsidian Secret Storage on this device, never in plugin data or the vault.')
      .addComponent((el) => new SecretComponent(this.app, el)
        .setValue(this.plugin.settings.googleOAuthClientSecretId)
        .onChange(async (value) => {
          this.plugin.settings.googleOAuthClientSecretId = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Apps Script callback URL')
      .setDesc('HTTPS deployment URL from the included Google Apps Script callback.')
      .addText((text) => text
        .setPlaceholder('https://script.google.com/macros/s/.../exec')
        .setValue(this.plugin.settings.googleOAuthRedirectUri)
        .onChange(async (value) => {
          this.plugin.settings.googleOAuthRedirectUri = value.trim();
          await this.plugin.saveSettings();
        }));

    const status = this.plugin.calendarSync?.getStatus();
    new Setting(containerEl)
      .setName('Google connection')
      .setDesc(status?.lastError
        ? `Error: ${status.lastError}`
        : status?.lastSuccess
          ? `Last successful sync: ${new Date(status.lastSuccess).toLocaleString()}`
          : `Status: ${status?.state ?? 'not initialized'}`)
      .addButton((button) => button
        .setButtonText(this.plugin.calendarSync?.isConnected() ? 'Reconnect' : 'Connect Google Calendar')
        .setCta()
        .onClick(() => {
          try { this.plugin.calendarSync.beginConnect(); }
          catch (error) { new Notice(error instanceof Error ? error.message : String(error)); }
        }))
      .addButton((button) => button
        .setButtonText('Sync now')
        .onClick(async () => {
          await this.plugin.calendarSync.syncNow(true);
          this.display();
        }));

    const destination = new Setting(containerEl)
      .setName('Destination calendar')
      .setDesc('Only the currently selected calendar is managed. Old calendars are left untouched when you switch.');
    destination.addDropdown((dropdown) => {
      const choices = this.calendarChoices.length > 0
        ? this.calendarChoices
        : [{ id: this.plugin.settings.googleCalendarId || 'primary', summary: this.plugin.settings.googleCalendarName || 'Primary calendar' }];
      for (const calendar of choices) dropdown.addOption(calendar.id, calendar.summary);
      dropdown.setValue(this.plugin.settings.googleCalendarId || 'primary').onChange(async (value) => {
        const selected = choices.find((calendar) => calendar.id === value);
        this.plugin.settings.googleCalendarId = value;
        this.plugin.settings.googleCalendarName = selected?.summary ?? value;
        if (selected?.timeZone) this.plugin.settings.calendarTimeZone = selected.timeZone;
        await this.plugin.saveSettings();
        this.plugin.calendarSync.schedule(0);
        this.display();
      });
    });
    destination.addButton((button) => button.setButtonText('Load calendars').onClick(async () => {
      try {
        this.calendarChoices = await this.plugin.calendarSync.listWritableCalendars();
        this.display();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : String(error));
      }
    }));

    new Setting(containerEl)
      .setName('Default event start')
      .setDesc('All task events may overlap at this fixed local calendar time.')
      .addText((text) => text.setPlaceholder('07:00').setValue(this.plugin.settings.calendarDefaultStartTime).onChange(async (value) => {
        if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
          this.plugin.settings.calendarDefaultStartTime = value;
          await this.plugin.saveSettings();
          this.plugin.calendarSync.schedule();
        }
      }));

    new Setting(containerEl)
      .setName('Default duration (minutes)')
      .setDesc('Duration of every managed task event.')
      .addText((text) => text.setPlaceholder('30').setValue(String(this.plugin.settings.calendarDefaultDurationMinutes)).onChange(async (value) => {
        const minutes = Number.parseInt(value, 10);
        if (minutes > 0 && minutes <= 1440) {
          this.plugin.settings.calendarDefaultDurationMinutes = minutes;
          await this.plugin.saveSettings();
          this.plugin.calendarSync.schedule();
        }
      }));

    new Setting(containerEl)
      .setName('Calendar timezone')
      .setDesc('Defaults from the selected Google calendar and remains stable while travelling.')
      .addText((text) => text.setPlaceholder('Asia/Singapore').setValue(this.plugin.settings.calendarTimeZone).onChange(async (value) => {
        this.plugin.settings.calendarTimeZone = value.trim() || 'Asia/Singapore';
        await this.plugin.saveSettings();
        this.plugin.calendarSync.schedule();
      }));

    containerEl.createEl('h3', { text: 'Todoist 3-Facet Projection' });

    new Setting(containerEl)
      .setName('Enable Todoist sync')
      .setDesc('Projects open tasks to your 3 identity facet projects (Yo the Manager, Josef with Self Care, RJ the Supportive) in Todoist.')
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.todoistSyncEnabled)
        .onChange(async (value) => {
          this.plugin.settings.todoistSyncEnabled = value;
          await this.plugin.saveSettings();
          if (value) this.plugin.todoistSync?.schedule(0);
          this.display();
        }));

    new Setting(containerEl)
      .setName('Todoist API token')
      .setDesc('Personal API token from Todoist Settings > Integrations > Developer.')
      .addText((text) => {
        text.inputEl.type = 'password';
        text
          .setPlaceholder('Enter Todoist API token...')
          .setValue(this.plugin.settings.todoistApiToken)
          .onChange(async (value) => {
            this.plugin.settings.todoistApiToken = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default project')
      .setDesc('Fallback Todoist project for untagged / general tasks.')
      .addText((text) => text
        .setPlaceholder('Inbox')
        .setValue(this.plugin.settings.todoistDefaultProject)
        .onChange(async (value) => {
          this.plugin.settings.todoistDefaultProject = value.trim() || 'Inbox';
          await this.plugin.saveSettings();
        }));

    const todoistStatus = this.plugin.todoistSync?.getStatus();
    new Setting(containerEl)
      .setName('Connection & synchronization')
      .setDesc(todoistStatus?.lastError
        ? `Error: ${todoistStatus.lastError}`
        : todoistStatus?.lastSuccess
          ? `Last successful sync: ${new Date(todoistStatus.lastSuccess).toLocaleString()}`
          : `Status: ${todoistStatus?.state ?? 'not initialized'}`)
      .addButton((button) => button
        .setButtonText('Test connection')
        .onClick(async () => {
          button.setDisabled(true);
          button.setButtonText('Testing...');
          const res = await this.plugin.todoistSync.testConnection();
          button.setDisabled(false);
          button.setButtonText('Test connection');
          if (res.success) {
            new Notice(`Connected to Todoist! Found ${res.projects.length} projects: ${res.projects.slice(0, 4).join(', ')}...`);
          } else {
            new Notice(`Todoist connection failed: ${res.message || 'Unknown error'}`);
          }
          this.display();
        }))
      .addButton((button) => button
        .setButtonText('Sync now')
        .setCta()
        .onClick(async () => {
          await this.plugin.todoistSync.syncNow(true);
          this.display();
        }));

    containerEl.createEl('h3', { text: 'Task view' });

    new Setting(containerEl)
      .setName('Default view mode')
      .setDesc('Choose the default view when opening GTD Matrix Tasks.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('date', 'By Date (date buckets)')
          .addOption('gtd', 'GTD Workflow (6 stages)')
          .addOption('eisenhower', 'Eisenhower Matrix (4 quadrants)')
          .setValue(this.plugin.settings.defaultViewMode || 'date')
          .onChange(async (value) => {
            this.plugin.settings.defaultViewMode = value as ViewMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Default date anchor')
      .setDesc('Choose the default anchor field when using By Date view mode.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('scheduled', 'Scheduled (⏳)')
          .addOption('start', 'Start (🛫)')
          .addOption('due', 'Due (📅)')
          .setValue(this.plugin.settings.defaultDateAnchor || 'scheduled')
          .onChange(async (value) => {
            this.plugin.settings.defaultDateAnchor = value as DateAnchorField;
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
