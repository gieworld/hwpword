import type { CommandDispatcher } from '@/command/dispatcher';
import type { EventBus } from '@/core/event-bus';
import { listRecentDocs, type RecentDoc } from '@/recent/recent-store';
import { FILE_PAGE_COMMANDS, QUICK_ACCESS, RIBBON_TABS, type RibbonButton, type RibbonGroup } from './ribbon-data';

const ACTIVE_TAB_KEY = 'hwpword.ribbon.tab';

/**
 * The only commands upstream actually syncs as a checked/pressed toggle onto every
 * `[data-cmd="<id>"]` element (see syncTextMarkMenu/syncClipMenu/view:border-transparent/
 * view:toggle-grid in command/commands/view.ts, and the form-mode toggle in main.ts).
 * Everything else that has a `[data-cmd]` in the hidden classic menu bar (Save, Paste, Undo, ...)
 * is a plain command, not a toggle, and must not get aria-pressed.
 */
const TOGGLE_COMMAND_IDS = new Set([
  'view:para-mark',
  'view:ctrl-mark',
  'view:border-transparent',
  'view:toggle-grid',
  'view:toggle-clip',
  'view:form-mode',
]);

/**
 * Word-style ribbon for HWP Word. Renders ribbon-data.ts, dispatches existing command IDs through the
 * shared CommandDispatcher, and mirrors enabled state the way MenuBar does.
 */
export class Ribbon {
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly panels = new Map<string, HTMLElement>();
  private readonly filePage: HTMLElement;
  private activeTab = 'home';
  private refreshQueued = false;

  constructor(
    private readonly root: HTMLElement,
    eventBus: EventBus,
    private readonly dispatcher: CommandDispatcher,
  ) {
    root.classList.add('ribbon');
    const strip = this.renderStrip();
    const panelHost = document.createElement('div');
    panelHost.className = 'ribbon-panels';
    for (const tab of RIBBON_TABS) {
      const panel = document.createElement('div');
      panel.className = 'ribbon-panel';
      panel.id = `ribbon-panel-${tab.id}`;
      panel.setAttribute('role', 'tabpanel');
      for (const group of tab.groups) panel.append(this.renderGroup(group));
      this.panels.set(tab.id, panel);
      panelHost.append(panel);
    }
    this.filePage = this.renderFilePage();
    root.replaceChildren(strip, panelHost, this.filePage);

    // Same rule as the classic toolbars (main.ts #780): clicking chrome must not steal the editor's selection.
    root.addEventListener('mousedown', (event) => {
      if ((event.target as HTMLElement).closest('input, select, textarea')) return;
      event.preventDefault();
    });

    let saved: string | null = null;
    try {
      saved = localStorage.getItem(ACTIVE_TAB_KEY);
    } catch {
      saved = null;
    }
    this.selectTab(saved && this.panels.has(saved) ? saved : 'home');
    eventBus.on('command-state-changed', () => this.scheduleRefresh());
    // Caret/selection moves (e.g. clicking into a table) don't emit command-state-changed,
    // but they do change which commands apply — updateCaret emits this on every one of them.
    eventBus.on('cursor-rect-updated', () => this.scheduleRefresh());
  }

  private renderStrip(): HTMLElement {
    const strip = document.createElement('div');
    strip.className = 'ribbon-strip';

    const quick = document.createElement('div');
    quick.className = 'ribbon-quick';
    for (const button of QUICK_ACCESS) quick.append(this.renderButton(button, 'ribbon-btn-quick'));

    const tabs = document.createElement('div');
    tabs.className = 'ribbon-tabs';
    tabs.setAttribute('role', 'tablist');

    const fileTab = document.createElement('button');
    fileTab.type = 'button';
    fileTab.className = 'ribbon-tab ribbon-tab-file';
    fileTab.textContent = 'File';
    fileTab.addEventListener('click', () => this.openFilePage());
    tabs.append(fileTab);

    for (const tab of RIBBON_TABS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ribbon-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `ribbon-panel-${tab.id}`);
      button.textContent = tab.label;
      button.addEventListener('click', () => this.selectTab(tab.id));
      button.addEventListener('dblclick', () => this.root.classList.toggle('ribbon-collapsed'));
      this.tabButtons.set(tab.id, button);
      tabs.append(button);
    }

    strip.append(quick, tabs);
    return strip;
  }

  private renderGroup(group: RibbonGroup): HTMLElement {
    const section = document.createElement('section');
    section.className = group.compact ? 'ribbon-group ribbon-group-compact' : 'ribbon-group';
    section.setAttribute('aria-label', group.label);
    const body = document.createElement('div');
    body.className = 'ribbon-group-body';
    if (group.mountId) {
      const mounted = document.getElementById(group.mountId);
      if (mounted) body.append(mounted);
    }
    for (const button of group.buttons ?? []) body.append(this.renderButton(button));
    const label = document.createElement('div');
    label.className = 'ribbon-group-label';
    label.textContent = group.label;
    section.append(body, label);
    return section;
  }

  private renderButton(button: RibbonButton, extraClass?: string): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = ['ribbon-btn', button.large ? 'ribbon-btn-large' : '', extraClass ?? ''].filter(Boolean).join(' ');
    el.dataset.ribbonCmd = button.cmd;
    el.title = button.label;

    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    if (button.icon) {
      icon.className = `tb-sprite ${button.icon}`;
    } else {
      icon.className = 'ribbon-glyph';
      icon.textContent = button.glyph ?? '';
    }
    const label = document.createElement('span');
    label.className = 'ribbon-btn-label';
    label.textContent = button.label;
    el.append(icon, label);

    el.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.run(button.cmd, el);
    });
    el.addEventListener('click', (event) => {
      if (event.detail === 0) this.run(button.cmd, el); // keyboard activation (Enter/Space)
    });
    this.buttons.push(el);
    return el;
  }

  private run(cmd: string, anchorEl: HTMLElement): void {
    this.closeFilePage();
    this.dispatcher.dispatch(cmd, { anchorEl });
  }

  private selectTab(id: string): void {
    this.activeTab = id;
    for (const [tabId, button] of this.tabButtons) {
      const active = tabId === id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    for (const [tabId, panel] of this.panels) panel.hidden = tabId !== id;
    try {
      localStorage.setItem(ACTIVE_TAB_KEY, id);
    } catch {
      // Storage unavailable: the tab just won't be remembered.
    }
    this.refreshStates();
    // The formatting bar measures its width to decide overflow; let it re-measure once visible.
    window.dispatchEvent(new Event('resize'));
  }

  private scheduleRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.refreshStates();
    });
  }

  /** Only visible buttons are checked: isEnabled builds an editor-context snapshot per call. */
  private refreshStates(): void {
    const panel = this.panels.get(this.activeTab);
    for (const el of this.buttons) {
      const inPanel = el.closest('.ribbon-panel');
      if (inPanel && inPanel !== panel) continue;
      const cmd = el.dataset.ribbonCmd!;
      el.disabled = !this.dispatcher.isEnabled(cmd);
      // Only real toggle commands get aria-pressed — most other commands also have a
      // [data-cmd="<id>"] element in the hidden classic menu bar (Save, Paste, Undo, ...),
      // but those are plain commands, not toggles, and must not claim to be pressable.
      if (TOGGLE_COMMAND_IDS.has(cmd)) {
        const upstream = document.querySelector(`[data-cmd="${cmd}"]`);
        const active = upstream?.classList.contains('active') ?? false;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', String(active));
      }
    }
  }

  private renderFilePage(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'ribbon-file-page';
    page.hidden = true;

    const nav = document.createElement('nav');
    nav.className = 'ribbon-file-nav';
    nav.setAttribute('aria-label', 'File');
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ribbon-file-back';
    back.textContent = '← Back';
    back.addEventListener('click', () => this.closeFilePage());
    nav.append(back);
    for (const button of FILE_PAGE_COMMANDS) nav.append(this.renderButton(button, 'ribbon-file-item'));

    const recent = document.createElement('section');
    recent.className = 'ribbon-file-recent';
    page.append(nav, recent);
    page.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeFilePage();
    });
    return page;
  }

  private openFilePage(): void {
    this.filePage.hidden = false;
    this.refreshStates();
    void this.renderRecent();
    this.filePage.querySelector<HTMLButtonElement>('.ribbon-file-back')?.focus();
  }

  private closeFilePage(): void {
    this.filePage.hidden = true;
  }

  private async renderRecent(): Promise<void> {
    const host = this.filePage.querySelector<HTMLElement>('.ribbon-file-recent')!;
    let docs: RecentDoc[] = [];
    try {
      docs = await listRecentDocs();
    } catch (error) {
      console.warn('[ribbon] could not list recent documents', error);
    }
    const heading = document.createElement('h2');
    heading.textContent = 'Recent';
    const list = document.createElement('div');
    list.className = 'ribbon-file-recent-list';
    if (docs.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No recent documents.';
      list.append(empty);
    }
    for (const doc of docs) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'ribbon-file-recent-item';
      item.title = doc.fileName;
      item.textContent = `${doc.fileName} · ${doc.sourceFormat.toUpperCase()}`;
      item.addEventListener('click', () => {
        this.closeFilePage();
        this.dispatcher.dispatch('file:open-recent', { id: doc.id });
      });
      list.append(item);
    }
    host.replaceChildren(heading, list);
  }
}
