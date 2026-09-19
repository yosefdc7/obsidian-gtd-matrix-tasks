import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VaultScanner } from '../vault-scanner';
import { DEFAULT_SETTINGS } from '../types';
import type { PluginSettings, RoleId, SectionId, TaskItem } from '../types';
import { renderBoard, renderDateBoard, renderSwimlaneBoard } from './board-renderer';
import { buildDateBuckets, groupByDateBucket } from './date-buckets';
import { renderDateList, renderSection, renderSwimlaneList } from './list-renderer';
import { openQuickAddModal, renderFloatingActionButton } from './quick-capture-modal';
import { filterTasks, groupBySection } from './task-filter';
import { executeDateBucketDrop, executeTaskTransition } from './task-transitions';
import { renderToolbar } from './toolbar-renderer';
import { EISENHOWER_SECTIONS, GTD_SECTIONS, VIEW_TYPE_GTD_MATRIX } from './types';
import type { ViewContext, ViewState } from './types';

export { VIEW_TYPE_GTD_MATRIX };

export class GTDMatrixView extends ItemView {
  private scanner: VaultScanner;
  private settings: PluginSettings;
  private saveSettingsHandler?: () => Promise<void>;
  private viewState: ViewState;
  private unsubscribe: (() => void) | null = null;
  private ctxCache: ViewContext | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    scanner: VaultScanner,
    settings?: PluginSettings,
    saveSettingsHandler?: () => Promise<void>
  ) {
    super(leaf);
    this.scanner = scanner;
    this.settings = settings ?? DEFAULT_SETTINGS;
    this.saveSettingsHandler = saveSettingsHandler;
    this.viewState = {
      viewMode: 'date',
      layoutMode: 'board',
      sortCriteria: 'date',
      tagViewMode: 'filter',
      dateAnchor: 'scheduled',
      activeFilterRoles: new Set<RoleId>([
        'role/yo-manager',
        'role/josef-selfcare',
        'role/rj-supportive',
        'untagged'
      ]),
      collapsedSwimlanes: new Set<RoleId>(),
      searchQuery: '',
      activeChip: 'all',
      selectedFolder: 'all',
      collapsedSections: new Set<SectionId>(),
      optionsOpen: false,
      mobileSearchOpen: false
    };

    if (settings) {
      this.viewState.layoutMode = settings.defaultLayoutMode;
      this.viewState.viewMode = settings.defaultViewMode || 'date';
      this.viewState.dateAnchor = settings.defaultDateAnchor || 'scheduled';
      this.viewState.sortCriteria = settings.defaultSortCriteria || 'date';
      this.viewState.tagViewMode = settings.defaultTagViewMode || 'filter';
      if (settings.activeFilterRoles && settings.activeFilterRoles.length > 0) {
        this.viewState.activeFilterRoles = new Set(settings.activeFilterRoles as RoleId[]);
      }
    }
  }

  getViewType(): string {
    return VIEW_TYPE_GTD_MATRIX;
  }

  getDisplayText(): string {
    return 'GTD Matrix Tasks';
  }

  getIcon(): string {
    return 'list-todo';
  }

  override onload(): void {
    super.onload();
    this.unsubscribe = this.scanner.onTasksUpdated(() => {
      this.render();
    });
    this.render();
    if (this.scanner.getTasks().length === 0) {
      void this.scanner.scanVault().then(() => this.render());
    }
  }

  async onOpen(): Promise<void> {
    if (!this.unsubscribe) {
      this.unsubscribe = this.scanner.onTasksUpdated(() => {
        this.render();
      });
    }
    this.render();
    if (this.scanner.getTasks().length === 0) {
      await this.scanner.scanVault();
      this.render();
    }
  }

  async onClose(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  /** Seam consumed by the renderer modules; built once on first access. */
  private get ctx(): ViewContext {
    if (!this.ctxCache) {
      this.ctxCache = {
        app: this.app,
        component: this,
        taskStore: this.scanner.store,
        taskMutator: this.scanner.mutator,
        settings: this.settings,
        getState: () => this.viewState,
        setState: (partial) => {
          Object.assign(this.viewState, partial);
          this.render();
        },
        render: () => this.render(),
        handleTaskDrop: (task, targetSection, roleTag) =>
          this.handleTaskDrop(task, targetSection, roleTag),
        handleDateDrop: (task, dayDate) => this.handleDateDrop(task, dayDate),
        openQuickAddModal: (sectionId) => openQuickAddModal(this.ctx, sectionId),
        getTodayDateString: () => this.scanner.getTodayDateString(),
        rescan: async () => {
          await this.scanner.scanVault();
        },
        saveSettings: () => this.saveSettingsHandler?.() ?? Promise.resolve()
      };
    }
    return this.ctxCache;
  }

  private async handleTaskDrop(
    task: TaskItem,
    targetSection: SectionId,
    roleTag?: RoleId | null
  ): Promise<void> {
    await executeTaskTransition(
      task,
      targetSection,
      this.viewState.viewMode,
      this.scanner.mutator,
      this.scanner.getTodayDateString(),
      roleTag,
      this.scanner.roleResolver.getConfiguredRoles()
    );
  }

  /** By Date day-bucket drop: sets the anchor field's date (scheduling gesture). */
  private async handleDateDrop(task: TaskItem, dayDate: string): Promise<void> {
    await executeDateBucketDrop(task, dayDate, this.viewState.dateAnchor, this.scanner.mutator);
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('gtd-matrix-view');

    const tasks = this.scanner.getTasks();
    const todayStr = this.scanner.getTodayDateString();

    // Render Toolbar (Mode Switcher, Layout Toggle, Search, Quick Chips, Folder, Refresh)
    renderToolbar(container, tasks, this.ctx);

    // Filter Tasks
    const filteredTasks = filterTasks(tasks, this.viewState);

    // By Date: third perspective with chronological buckets; no swimlanes
    if (this.viewState.viewMode === 'date') {
      const buckets = buildDateBuckets(todayStr);
      const grouped = groupByDateBucket(
        filteredTasks,
        this.viewState.dateAnchor,
        todayStr,
        this.viewState.sortCriteria
      );
      if (this.viewState.layoutMode === 'board') {
        renderDateBoard(container, buckets, grouped, this.ctx);
      } else {
        renderDateList(container, buckets, grouped, this.ctx);
      }
      renderFloatingActionButton(container, this.ctx);
      return;
    }

    const activeSections = this.viewState.viewMode === 'gtd' ? GTD_SECTIONS : EISENHOWER_SECTIONS;

    // Render Swimlanes
    if (this.viewState.tagViewMode === 'swimlanes') {
      if (this.viewState.layoutMode === 'board') {
        renderSwimlaneBoard(container, activeSections, filteredTasks, todayStr, this.ctx);
      } else {
        renderSwimlaneList(container, activeSections, filteredTasks, todayStr, this.ctx);
      }
    } else {
      // Group tasks according to active View Mode (Filter Mode)
      const grouped = groupBySection(
        filteredTasks,
        activeSections,
        this.viewState.viewMode,
        todayStr,
        this.viewState.sortCriteria
      );

      // Render Board or List
      if (this.viewState.layoutMode === 'board') {
        renderBoard(container, activeSections, grouped, this.ctx);
      } else {
        const sectionsWrapper = container.createDiv({ cls: 'gtd-sections-wrapper' });
        for (const sec of activeSections) {
          const sectionTasks = grouped.get(sec.id) || [];
          renderSection(sectionsWrapper, sec, sectionTasks, undefined, this.ctx);
        }
      }
    }

    // Floating action button for mobile quick capture
    renderFloatingActionButton(container, this.ctx);
  }
}
