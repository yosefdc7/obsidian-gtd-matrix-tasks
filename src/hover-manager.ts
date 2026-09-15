import type { App } from 'obsidian';
import { BacklinkResolver } from './backlink-resolver';
import type { PluginSettings } from './types';

export class HoverManager {
  private resolver: BacklinkResolver;
  private currentTooltipEl: HTMLElement | null = null;
  private hoverTimer: number | null = null;
  private activeTargetEl: HTMLElement | null = null;
  private isAltPressed = false;

  private onMouseOverBound: (e: MouseEvent) => void;
  private onMouseOutBound: (e: MouseEvent) => void;
  private onKeyDownBound: (e: KeyboardEvent) => void;
  private onKeyUpBound: (e: KeyboardEvent) => void;
  private onScrollBound: () => void;

  constructor(
    private app: App,
    private settings: PluginSettings
  ) {
    this.resolver = new BacklinkResolver(app);

    this.onMouseOverBound = this.handleMouseOver.bind(this);
    this.onMouseOutBound = this.handleMouseOut.bind(this);
    this.onKeyDownBound = this.handleKeyDown.bind(this);
    this.onKeyUpBound = this.handleKeyUp.bind(this);
    this.onScrollBound = this.dismissTooltip.bind(this);

    this.registerListeners();
  }

  public updateSettings(newSettings: PluginSettings): void {
    this.settings = newSettings;
  }

  private registerListeners(): void {
    document.body.addEventListener('mouseover', this.onMouseOverBound, true);
    document.body.addEventListener('mouseout', this.onMouseOutBound, true);
    window.addEventListener('keydown', this.onKeyDownBound, true);
    window.addEventListener('keyup', this.onKeyUpBound, true);
    window.addEventListener('scroll', this.onScrollBound, true);
  }

  public destroy(): void {
    this.dismissTooltip();
    document.body.removeEventListener('mouseover', this.onMouseOverBound, true);
    document.body.removeEventListener('mouseout', this.onMouseOutBound, true);
    window.removeEventListener('keydown', this.onKeyDownBound, true);
    window.removeEventListener('keyup', this.onKeyUpBound, true);
    window.removeEventListener('scroll', this.onScrollBound, true);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Alt') {
      this.isAltPressed = true;
      // If user holds Alt while our tooltip is active, dismiss it to allow native preview
      this.dismissTooltip();
    } else if (e.key === 'Escape') {
      this.dismissTooltip();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt') {
      this.isAltPressed = false;
    }
  }

  private handleMouseOver(e: MouseEvent): void {
    if (!this.settings.enableLatestBacklinkHover) return;

    // Check if Alt or Shift is held: if so, user requested native Page Preview
    if (e.altKey || this.isAltPressed) {
      this.dismissTooltip();
      return;
    }

    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Detect internal link elements in Reading View and Live Preview
    const linkEl = target.closest('a.internal-link, .cm-hmd-internal-link') as HTMLElement | null;
    if (!linkEl) return;

    // If already hovering this link, don't restart timer
    if (this.activeTargetEl === linkEl) return;

    this.dismissTooltip();
    this.activeTargetEl = linkEl;

    const delay = Math.max(50, this.settings.backlinkHoverDelayMs ?? 250);
    this.hoverTimer = window.setTimeout(() => {
      void this.showTooltipForElement(linkEl, e);
    }, delay);
  }

  private handleMouseOut(e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    const linkEl = target.closest('a.internal-link, .cm-hmd-internal-link');
    if (linkEl && linkEl === this.activeTargetEl) {
      // Check relatedTarget to make sure we're actually leaving the link
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !linkEl.contains(related)) {
        this.dismissTooltip();
      }
    }
  }

  public dismissTooltip(): void {
    if (this.hoverTimer !== null) {
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = null;
    }
    if (this.currentTooltipEl) {
      this.currentTooltipEl.remove();
      this.currentTooltipEl = null;
    }
    this.activeTargetEl = null;
  }

  private async showTooltipForElement(linkEl: HTMLElement, originalEvent: MouseEvent): Promise<void> {
    // If user pressed Alt during the delay or mouse left, abort
    if (this.isAltPressed || originalEvent.altKey || this.activeTargetEl !== linkEl) {
      return;
    }

    const rawHref = linkEl.getAttribute('data-href') || linkEl.getAttribute('href') || linkEl.textContent || '';
    const cleanLink = rawHref.split('#')[0].replace(/^\[\[/, '').replace(/\]\]$/, '').trim();
    if (!cleanLink) return;

    const activeFile = this.app.workspace.getActiveFile();
    const activePath = activeFile ? activeFile.path : undefined;
    const maxChars = this.settings.backlinkHoverMaxChars ?? 200;

    const result = await this.resolver.getLatestBacklinkMention(cleanLink, activePath, maxChars);

    // Double check that element is still active
    if (this.activeTargetEl !== linkEl) return;

    if (!result.hasBacklinks) {
      // Option A2: Auto-fall back to Obsidian's native Page Preview when 0 backlinks exist
      this.dismissTooltip();
      this.triggerNativePagePreview(linkEl, cleanLink, activePath, originalEvent);
      return;
    }

    this.renderTooltip(linkEl, result.sourceTitle || 'Note', result.cleanedText || '');
  }

  private triggerNativePagePreview(
    linkEl: HTMLElement,
    linkText: string,
    sourcePath: string | undefined,
    originalEvent: MouseEvent
  ): void {
    try {
      this.app.workspace.trigger('hover-link', {
        event: originalEvent,
        source: 'preview',
        hoverParent: linkEl.parentElement || linkEl,
        targetEl: linkEl,
        linktext: linkText,
        sourcePath: sourcePath || ''
      });
    } catch (err) {
      console.warn('[GTD Matrix] Failed to trigger native page preview fallback', err);
    }
  }

  private renderTooltip(linkEl: HTMLElement, sourceTitle: string, snippet: string): void {
    this.dismissTooltip();
    this.activeTargetEl = linkEl;

    const tooltip = document.createElement('div');
    tooltip.className = 'gtd-backlink-tooltip';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'gtd-backlink-title';
    titleSpan.textContent = sourceTitle + (sourceTitle.endsWith('.md') ? '' : '.md');

    const textSpan = document.createElement('span');
    textSpan.className = 'gtd-backlink-text';
    textSpan.textContent = ' ' + snippet;

    tooltip.appendChild(titleSpan);
    tooltip.appendChild(textSpan);
    document.body.appendChild(tooltip);
    this.currentTooltipEl = tooltip;

    // Position tooltip directly adjacent to the link element
    const rect = linkEl.getBoundingClientRect();
    const tooltipHeight = tooltip.offsetHeight || 36;
    const tooltipWidth = tooltip.offsetWidth || 300;

    // Try placing below link; if close to bottom of window, place above
    let top = rect.bottom + 6;
    if (top + tooltipHeight > window.innerHeight - 10) {
      top = Math.max(10, rect.top - tooltipHeight - 6);
    }

    // Horizontal positioning: align with link start, but prevent viewport overflow
    let left = rect.left;
    if (left + tooltipWidth > window.innerWidth - 16) {
      left = Math.max(10, window.innerWidth - tooltipWidth - 16);
    }

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }
}
