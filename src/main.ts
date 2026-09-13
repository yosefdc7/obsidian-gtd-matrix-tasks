import { Plugin, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, debounce } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import { GTDMatrixView, VIEW_TYPE_GTD_MATRIX } from './view';
import { GTDMatrixSettingTab } from './settings-tab';
import { PluginSettings, DEFAULT_SETTINGS } from './types';

export default class GTDMatrixPlugin extends Plugin {
  public settings: PluginSettings = DEFAULT_SETTINGS;
  public scanner: VaultScanner = null!;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.scanner = new VaultScanner(this.app, this.settings);

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
      this.app.workspace.on('file-open', () => {
        this.updateLeafFolderClasses();
      })
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.updateLeafFolderClasses();
      })
    );
    this.app.workspace.onLayoutReady(() => {
      this.updateLeafFolderClasses();
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
      this.app.vault.on('create', (file) => {
        debouncedReindex(file);
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', (file, oldPath) => {
        if (file instanceof TFile && file.extension === 'md') {
          void this.scanner.handleFileRename(file, oldPath);
        } else {
          this.scanner.handleFileDelete(oldPath);
        }
      })
    );
  }

  private updateLeafFolderClasses(): void {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      const state = leaf.getViewState();
      if (state?.type === 'markdown' || leaf.view instanceof MarkdownView) {
        const filePath = (leaf.view as any)?.file?.path || (state?.state as any)?.file || '';
        const isInJots = typeof filePath === 'string' && filePath.startsWith('Jots/');
        const containerEl = (leaf as unknown as { containerEl?: HTMLElement }).containerEl;
        const viewContainerEl = leaf.view?.containerEl;

        if (isInJots) {
          containerEl?.addClass('is-in-jots');
          viewContainerEl?.addClass('is-in-jots');
        } else {
          containerEl?.removeClass('is-in-jots');
          viewContainerEl?.removeClass('is-in-jots');
        }
      }
    });
  }

  onunload(): void {
    this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
      if (leaf.view instanceof MarkdownView) {
        leaf.view.containerEl.removeClass('is-in-jots');
      }
      (leaf as unknown as { containerEl?: HTMLElement }).containerEl?.removeClass('is-in-jots');
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
