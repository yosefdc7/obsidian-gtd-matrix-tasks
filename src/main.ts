import { Plugin, WorkspaceLeaf } from 'obsidian';
import { VaultScanner } from './vault-scanner';
import { GTDMatrixView, VIEW_TYPE_GTD_MATRIX } from './view';
import { PluginSettings, DEFAULT_SETTINGS } from './types';

export default class GTDMatrixPlugin extends Plugin {
  public settings: PluginSettings = DEFAULT_SETTINGS;
  public scanner: VaultScanner = null!;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.scanner = new VaultScanner(this.app, this.settings);

    this.registerView(
      VIEW_TYPE_GTD_MATRIX,
      (leaf: WorkspaceLeaf) => new GTDMatrixView(leaf, this.scanner)
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

    // Vault change listeners for live updates
    this.registerEvent(
      this.app.vault.on('modify', () => {
        this.scanner.debouncedScan();
      })
    );
    this.registerEvent(
      this.app.vault.on('delete', () => {
        this.scanner.debouncedScan();
      })
    );
    this.registerEvent(
      this.app.vault.on('create', () => {
        this.scanner.debouncedScan();
      })
    );
    this.registerEvent(
      this.app.vault.on('rename', () => {
        this.scanner.debouncedScan();
      })
    );
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
