/** Data-only snapshot. No SessionManager or AgentSession is retained by the UI. */
export class History {
  constructor(entries, leafId) {
    this.entries = structuredClone(entries);
    this.leafId = leafId;
    this.byId = new Map(this.entries.map((entry) => [entry.id, entry]));
    this.children = new Map();
    this.roots = [];
    for (const entry of this.entries) {
      if (!entry.parentId || !this.byId.has(entry.parentId) || entry.parentId === entry.id) {
        this.roots.push(entry);
      } else {
        const children = this.children.get(entry.parentId) ?? [];
        children.push(entry);
        this.children.set(entry.parentId, children);
      }
    }
    this.currentPath = new Set(this.path(leafId).map((entry) => entry.id));
    this.users = this.userRows();
  }

  path(id) {
    const path = [];
    const seen = new Set();
    while (id && !seen.has(id)) {
      seen.add(id);
      const entry = this.byId.get(id);
      if (!entry) break;
      path.push(entry);
      id = entry.parentId;
    }
    return path.reverse();
  }

  userRows() {
    const rows = [];
    const seen = new Set();
    const displayedSegments = new Set();
    // Walk disconnected/cyclic data too, without following any node twice.
    const walk = (root) => {
      const stack = [{ entry: root, depth: 0, trail: undefined }];
      while (stack.length) {
        const { entry, depth, trail } = stack.pop();
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        const isUser = entry.type === 'message' && entry.message?.role === 'user';
        if (isUser) {
          // Keep only the visible tail of the connector path for very deep trees.
          const guides = [];
          for (let cursor = trail; cursor && guides.length < 10; cursor = cursor.parent) guides.push(cursor.last);
          const branchStart = !!trail && !displayedSegments.has(trail.id);
          if (trail) displayedSegments.add(trail.id);
          rows.push({ entry, depth, guides: guides.reverse(), branchStart, text: contentText(entry.message.content) || '[image-only / empty message]' });
        }
        const children = this.children.get(entry.id) ?? [];
        // Prefer the active branch, preserving append order within each group.
        const sorted = [...children].sort((a, b) => Number(this.currentPath.has(b.id)) - Number(this.currentPath.has(a.id)));
        // Count forks in the full entry tree, including Assistant/tool nodes.
        // A single-child chain never adds indentation, even across many turns.
        const fork = sorted.length > 1;
        for (let i = sorted.length - 1; i >= 0; i--) {
          stack.push({
            entry: sorted[i],
            depth: depth + Number(fork),
            trail: fork ? { parent: trail, id: sorted[i].id, last: i === sorted.length - 1 } : trail,
          });
        }
      }
    };
    for (const entry of this.roots) walk(entry);
    for (const entry of this.entries) if (!seen.has(entry.id)) walk(entry);
    return rows;
  }

  /** Current branch first; otherwise ask only when there is more than one tip. */
  tips(selectedId) {
    if (this.currentPath.has(selectedId)) return [this.leafId];
    const tips = [];
    const seen = new Set();
    const stack = [selectedId];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id) || !this.byId.has(id)) continue;
      seen.add(id);
      const children = this.children.get(id) ?? [];
      if (!children.length) tips.push(id);
      else for (let i = children.length - 1; i >= 0; i--) stack.push(children[i].id);
    }
    return tips.length ? tips : [selectedId];
  }

  describeTip(id) {
    const path = this.path(id);
    const lastUser = path.findLast((entry) => entry.type === 'message' && entry.message?.role === 'user');
    const lastAssistant = path.findLast((entry) => entry.type === 'message' && entry.message?.role === 'assistant');
    return `${id} · ${this.byId.get(id)?.timestamp ?? ''} · ${contentText(lastUser?.message.content)} → ${contentText(lastAssistant?.message.content)}`;
  }
}

export function treePrefix(row) {
  if (!row.depth) return '· ';
  const ancestors = row.guides.slice(0, -1).map((last) => last ? '  ' : '│ ').join('');
  const last = row.guides.at(-1);
  const marker = row.branchStart ? (last ? '└─ ' : '├─ ') : (last ? '   ' : '│  ');
  return `${row.depth > 10 ? `…${row.depth} ` : '  '}${ancestors}${marker}`;
}

export function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => block.type === 'text' ? block.text ?? '' : block.type === 'image' ? `[image: ${block.mimeType ?? 'unknown'}]` : '').filter(Boolean).join('\n');
}

/** Do not let stored terminal control bytes execute when displaying history. */
export function safeText(value) {
  return String(value ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (char) => char === '\r' ? '' : `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

export function safeValue(value) {
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [safeText(key), safeValue(item)]));
  return value;
}
