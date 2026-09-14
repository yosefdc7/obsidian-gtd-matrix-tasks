import { Plugin, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, debounce } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import { GTDMatrixView, VIEW_TYPE_GTD_MATRIX } from './view';
import { GTDMatrixSettingTab } from './settings-tab';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { isDateTitledNote } from './date-utils';
import { AutoMover } from './auto-mover';

export default class GTDMatrixPlugin extends Plugin {
  public settings: PluginSettings = DEFAULT_SETTINGS;
  public scanner: VaultScanner = null!;
  public autoMover: AutoMover = null!;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.scanner = new VaultScanner(this.app, this.settings);
    this.autoMover = new AutoMover(this.app, this.settings);

    this.registerView(
      VIEW_TYPE_GTD_MATRIX,
      (leaf: WorkspaceLeaf) => new GTDMatrixView(leaf, this.scanner, this.settings)
    );

    this.addRibbonIcon('list-todo', 'Open GTD Matrix Tasks', () => {
      this.activateView();
    });

    this.addCommand({
      id: 'open-view',
      name: 'Open GTD Matrix Tasks',
      callback: () => {
        this.activateView();
      }
    });

    this.addSettingTab(new GTDMatrixSettingTab(this.app, this));

    // Folder-based note styling listeners (hide properties in Jots)
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        this.updateLeafFolderClasses();
        if (file instanceof TFile && file.extension === 'md') {
          void this.ensureNoteProperties(file, true);
          void this.autoMover.processFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.updateLeafFolderClasses();
      })
    );
    this.app.workspace.onLayoutReady(() => {
      this.updateLeafFolderClasses();
      void this.autoMover.evictNonDateNotesFromJots();
    });

    // Incremental vault change listeners (zero-lag typing)
    const debouncedReindex = debounce((file: TAbstractFile) => {
      if (file instanceof TFile && file.extension === 'md') {
        void this.scanner.reindexFile(file);
      }
    }, 300, false);

    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        debouncedReindex(file);
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', (file) => {
        this.scanner.handleFileDelete(file.path);
      })
    );
    this.registerEvent(
      this.app.vault.on('create', async (file) => {
        debouncedReindex(file);
        if (file instanceof TFile && file.extension === 'md') {
          await this.ensureNoteProperties(file, false);
          await this.autoMover.processFile(file);
        }
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.scanner.handleFileRename(file, oldPath);
          void this.autoMover.processFile(file);
        } else {
          this.scanner.handleFileDelete(oldPath);
        }
      })
    );

    const debouncedAutoMove = debounce((file: TFile) => {
      if (file instanceof TFile && file.extension === 'md') {
        void this.autoMover.processFile(file);
      }
    }, 500, false);

    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (file instanceof TFile && file.extension === 'md') {
          debouncedAutoMove(file);
        }
      })
    );
  }

  async ensureNoteProperties(file: TFile, onlyIfEmpty: boolean = false): Promise<void> {
    if (this.settings.autoInitializeNoteProperties === false) return;

    const path = file.path;
    // Exclude templates, archives, and system folders
    if (
      path.startsWith('References/Templates/') ||
      path.startsWith('zArchive/') ||
      path.startsWith('.obsidian/')
    ) {
      return;
    }

    // Exclude Date-Titled Notes (daily jots have their own format and hide properties)
    if (isDateTitledNote(path)) {
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      if (content.trim() === '') {
        // Empty new note: initialize frontmatter with tags
        await this.app.vault.modify(file, '---\ntags: []\n---\n\n');
      } else if (!onlyIfEmpty) {
        // Created with content: ensure tags exist in frontmatter, and migrate legacy role if present
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          if (!('tags' in fm)) {
            fm.tags = [];
          }
          if ('role' in fm) {
            const r = fm.role;
            if (r && typeof r === 'string' && r.trim()) {
              const cleanRole = r.trim().replace(/^#/, '');
              const tag = cleanRole.startsWith('role/') ? cleanRole : `role/${cleanRole}`;
              if (!Array.isArray(fm.tags)) {
                fm.tags = fm.tags ? [fm.tags] : [];
              }
              if (!fm.tags.includes(tag)) {
                fm.tags.push(tag);
              }
            }
            delete fm.role;
          }
        });
      }
    } catch (e) {
      console.warn('GTD Matrix: failed to initialize note properties', e);
    }
  }

  private updateLeafFolderClasses(): void {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const state = leaf.getViewState();
      if (state?.type === 'markdown' || leaf.view instanceof MarkdownView) {
        const filePath = (leaf.view as any)?.file?.path || (state?.state as any)?.file || '';
        const isDate = isDateTitledNote(filePath);
        const containerEl = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
        const viewContainerEl = leaf.view?.containerEl;

        if (isDate) {
          containerEl?.addClass('is-date-note');
          viewContainerEl?.addClass('is-date-note');
          containerEl?.addClass('is-in-jots');
          viewContainerEl?.addClass('is-in-jots');
        } else {
          containerEl?.removeClass('is-date-note');
          viewContainerEl?.removeClass('is-date-note');
          containerEl?.removeClass('is-in-jots');
          viewContainerEl?.removeClass('is-in-jots');
        }
      }
    });
  }

  onunload(): void {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.containerEl.removeClass('is-date-note');
        leaf.view.containerEl.removeClass('is-in-jots');
      }
      const containerEl = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
      containerEl?.removeClass('is-date-note');
      containerEl?.removeClass('is-in-jots');
    });
  }

  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_GTD_MATRIX)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_GTD_MATRIX,
        active: true
      });
    }
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
