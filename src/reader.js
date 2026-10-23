import { matchesKey, truncateToWidth } from '@earendil-works/pi-tui';
import { createBlocks } from './render.js';
import { safeText } from './history.js';
import { finalConversation } from './presentation.js';

export class Reader {
  constructor(entries, selectedId, tipId, ui, theme, cwd, back) {
    this.ui = ui;
    this.theme = theme;
    this.back = back;
    this.tipId = tipId;
    this.fullBlocks = createBlocks(entries, ui, cwd);
    this.finalBlocks = createBlocks(finalConversation(entries), ui, cwd);
    this.finalOnly = true;
    this.userAnchors = new Map();
    let userId;
    for (const entry of entries) {
      if (entry.type === 'message' && entry.message?.role === 'user') userId = entry.id;
      if (userId) {
        this.userAnchors.set(entry.id, userId);
        this.userAnchors.set(`${userId}:final-status`, userId);
      }
    }
    this.top = 0;
    this.height = 1;
    this.width = undefined;
    this.lines = [];
    this.positions = [];
    this.anchor = { id: selectedId, offset: 0 };
    this.dirty = true;
  }

  rememberAnchor() {
    const position = this.positions.findLast((position) => position.start <= this.top);
    if (position) this.anchor = { id: position.id, offset: this.top - position.start };
  }

  invalidate() {
    this.rememberAnchor();
    this.dirty = true;
  }

  layout(width) {
    if (!this.dirty && this.width === width) return;
    if (this.width !== undefined && !this.dirty) this.rememberAnchor();
    this.width = width;
    this.lines = [];
    this.positions = [];
    for (const block of this.finalOnly ? this.finalBlocks : this.fullBlocks) {
      const start = this.lines.length;
      try {
        const component = block.create({ expanded: !this.finalOnly, thinking: !this.finalOnly });
        if (!component) continue;
        // Native message components mark shell prompt zones. They must not leak
        // partial OSC133 zones into a sliced, independent transcript viewport.
        const lines = component.render(width).map((line) => line.replace(/\x1b\]133;[^\x07]*\x07/g, ''));
        for (const line of lines) this.lines.push(line);
        this.lines.push('');
      } catch (error) {
        this.lines.push(`Cannot render entry ${safeText(block.id)}: ${safeText(error.message)}`, '');
      }
      this.positions.push({ id: block.id, start, length: this.lines.length - start });
    }
    const exact = this.positions.find((position) => position.id === this.anchor?.id);
    const anchor = exact ?? this.positions.find((position) => position.id === this.userAnchors.get(this.anchor?.id));
    if (anchor) this.top = anchor.start + (exact ? Math.min(this.anchor.offset, Math.max(0, anchor.length - 1)) : 0);
    this.dirty = false;
  }

  handleInput(data) {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) return this.back();
    if (matchesKey(data, 'ctrl+p')) {
      this.invalidate();
      this.finalOnly = !this.finalOnly;
    } else if (matchesKey(data, 'up')) this.scroll(-1);
    else if (matchesKey(data, 'down')) this.scroll(1);
    else if (matchesKey(data, 'pageUp')) this.scroll(-this.height);
    else if (matchesKey(data, 'pageDown')) this.scroll(this.height);
    else if (matchesKey(data, 'home') || matchesKey(data, 'ctrl+home')) this.scroll(-Infinity);
    else if (matchesKey(data, 'end') || matchesKey(data, 'ctrl+end')) this.scroll(Infinity);
    this.ui.requestRender();
  }

  scroll(delta) {
    this.top = Math.max(0, Math.min(Math.max(0, this.lines.length - this.height), this.top + delta));
    this.rememberAnchor();
  }

  render(width, height) {
    this.height = Math.max(1, height - 2);
    if (width < 12 || height < 4) return [truncateToWidth('Resize terminal; Esc goes back', width)];
    this.layout(width);
    this.top = Math.max(0, Math.min(this.top, Math.max(0, this.lines.length - this.height)));
    const body = this.lines.slice(this.top, this.top + this.height);
    while (body.length < this.height) body.push('');
    return [
      this.theme.fg('text', `History Reader · ${this.finalOnly ? 'User + final reply' : 'Full process'} · read-only · ${this.top + 1}/${this.lines.length} · tip ${safeText(this.tipId)}`),
      this.theme.fg('muted', `↑↓ PgUp/Dn · Ctrl+P ${this.finalOnly ? 'show process' : 'final only'} · Esc tree`),
      ...body,
    ].map((line) => truncateToWidth(line, width));
  }
}
