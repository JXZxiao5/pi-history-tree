import { Input, isKeyRelease, matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import { Reader } from './reader.js';
import { safeText, treePrefix } from './history.js';
import { frame } from './presentation.js';

/** One overlay with three local states. Returning never reconstructs the tree. */
export class HistoryBrowser {
  constructor(history, ui, theme, keybindings, cwd, done) {
    this.history = history;
    this.ui = ui;
    this.theme = theme;
    this.keybindings = keybindings;
    this.cwd = cwd;
    this.done = done;
    this.search = new Input();
    this.rows = history.users;
    this.selected = Math.max(0, this.rows.findLastIndex((row) => history.currentPath.has(row.entry.id)));
    this.branch = undefined;
    this.reader = undefined;
    this.pageSize = 10;
    this.closed = false;
    this._focused = false;
  }

  get focused() { return this._focused; }
  set focused(value) {
    this._focused = value;
    this.search.focused = value && !this.reader && !this.branch;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.done();
  }

  dispose() {
    this.closed = true;
    this.reader = undefined;
  }

  invalidate() {
    this.search.invalidate();
    this.reader?.invalidate();
  }

  refreshFocus() { this.focused = this._focused; }

  openSelected() {
    const selectedId = this.rows[this.selected]?.entry.id;
    if (!selectedId) return;
    const tips = this.history.tips(selectedId);
    if (tips.length === 1) this.openReader(selectedId, tips[0]);
    else this.branch = { selectedId, tips, selected: 0 };
    this.refreshFocus();
  }

  openReader(selectedId, tipId) {
    this.branch = undefined;
    this.reader = new Reader(this.history.path(tipId), selectedId, tipId, this.ui, this.theme, this.cwd, () => {
      this.reader = undefined;
      this.refreshFocus();
      this.ui.requestRender();
    });
    this.refreshFocus();
  }

  handleInput(data) {
    if (this.closed || isKeyRelease(data)) return;
    if (this.reader) return this.reader.handleInput(data);
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      if (this.branch) {
        this.branch = undefined;
        this.refreshFocus();
      } else this.close();
      this.ui.requestRender();
      return;
    }
    const kb = this.keybindings;
    const match = (key, action) => matchesKey(data, key) || kb.matches(data, action);
    const count = this.branch ? this.branch.tips.length : this.rows.length;
    let index = this.branch ? this.branch.selected : this.selected;
    if (match('up', 'tui.select.up')) index--;
    else if (match('down', 'tui.select.down')) index++;
    else if (match('pageUp', 'tui.select.pageUp')) index -= this.pageSize;
    else if (match('pageDown', 'tui.select.pageDown')) index += this.pageSize;
    else if (match('enter', 'tui.select.confirm')) {
      if (this.branch) this.openReader(this.branch.selectedId, this.branch.tips[this.branch.selected]);
      else this.openSelected();
      this.ui.requestRender();
      return;
    } else if (!this.branch) {
      const oldQuery = this.search.getValue();
      this.search.handleInput(data);
      if (this.search.getValue() !== oldQuery) {
        const selectedId = this.rows[this.selected]?.entry.id;
        const tokens = this.search.getValue().toLowerCase().split(/\s+/).filter(Boolean);
        this.rows = this.history.users.filter((row) => tokens.every((token) => `${row.text} ${row.entry.id}`.toLowerCase().includes(token)));
        index = Math.max(0, this.rows.findIndex((row) => row.entry.id === selectedId));
      }
    }
    if (this.branch) this.branch.selected = Math.max(0, Math.min(count - 1, index));
    else this.selected = Math.max(0, Math.min(this.rows.length - 1, index));
    this.ui.requestRender();
  }

  render(width) {
    const height = Math.max(1, Math.min(this.ui.terminal.rows - 2, Math.floor(this.ui.terminal.rows * 2 / 3)));
    if (width < 16 || height < 8) return frame(['Resize terminal; Esc exits'], width, height, this.theme);
    const lines = this.reader ? this.reader.render(width - 4, height - 4) : this.renderTree(width - 4, height - 4);
    const headerLines = this.reader ? 2 : 3;
    const headerHeight = headerLines + 2;
    return [
      ...frame(lines.slice(0, headerLines), width, headerHeight, this.theme),
      ...frame(lines.slice(headerLines), width, height - headerHeight, this.theme),
    ];
  }

  renderTree(width, height) {
    this.pageSize = Math.max(1, height - 3);
    const branch = this.branch;
    const selected = branch ? branch.selected : this.selected;
    const count = branch ? branch.tips.length : this.rows.length;
    const start = Math.max(0, Math.min(selected - Math.floor(this.pageSize / 2), count - this.pageSize));
    const title = branch ? 'Choose continuation branch · read-only' : 'History Tree · User messages only · read-only snapshot';
    const lines = [this.theme.fg('text', `${title} · ${count ? selected + 1 : 0}/${count}`)];
    lines.push(this.theme.fg('muted', `↑↓ move · PgUp/PgDn page · Enter read · Esc ${branch ? 'tree' : 'exit'} · * active branch`));
    lines.push(branch ? `${count ? selected + 1 : 0}/${count} · Choose a continuation` : `Search: ${this.search.render(Math.max(1, width - 8))[0] ?? ''}`);
    for (let index = start; index < Math.min(count, start + this.pageSize); index++) {
      const row = this.rows[index];
      const text = branch ? this.history.describeTip(branch.tips[index]) : `${treePrefix(row)}${this.history.currentPath.has(row.entry.id) ? '* ' : ''}${row.text.replace(/\s+/g, ' ')} [${row.entry.id}]`;
      const line = `${index === selected ? '› ' : '  '}${safeText(text).replace(/\n/g, ' ')}`;
      lines.push(index === selected ? this.theme.fg('accent', line) : line);
    }
    if (!count) lines.push(this.theme.fg('muted', 'No matching User messages. Backspace edits search; Esc exits.'));
    while (lines.length < height) lines.push('');
    return lines.slice(0, height).map((line) => truncateToWidth(line, width));
  }
}
