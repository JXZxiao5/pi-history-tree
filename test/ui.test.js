import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { getKeybindings, visibleWidth } from '@earendil-works/pi-tui';
import { History } from '../src/history.js';
import { HistoryBrowser } from '../src/browser.js';
import { Reader } from '../src/reader.js';
import { fixture, entry, user, assistant, ui, theme, timestamp } from './fixtures.js';
initTheme('dark', false);
const allText = (reader) => { reader.render(90, 22); return reader.lines.join('\n'); };
function browser() {
  let closed = 0;
  const value = new HistoryBrowser(new History(fixture(), 'active-a'), ui(), theme, getKeybindings(), '/tmp', () => closed++);
  value.focused = true;
  return { value, closed: () => closed };
}

test('search → branch choice → reader → Esc preserves tree; next Esc exits even with search', () => {
  const { value, closed } = browser();
  value.handleInput('old');
  assert.equal(value.search.getValue(), 'old');
  const selected = value.selected;
  value.handleInput('\r');
  assert.deepEqual(value.branch.tips, ['left-a', 'right-a']);
  value.handleInput('\r');
  assert(value.reader);
  const text = allText(value.reader);
  assert(text.includes('LEFT_ONLY'));
  assert(!text.includes('RIGHT_ONLY'));
  assert(!text.includes('ACTIVE_ONLY'));
  value.handleInput('\x1b');
  assert.equal(value.reader, undefined);
  assert.equal(value.selected, selected);
  assert.equal(value.search.getValue(), 'old');
  assert.equal(value.search.focused, true);
  value.handleInput('\x1b');
  assert.equal(closed(), 1);
});

test('current branch opens without branch chooser; cancel chooser preserves search', () => {
  const { value } = browser();
  value.handleInput('root');
  value.handleInput('\r');
  assert.equal(value.reader.tipId, 'active-a');
  value.handleInput('\x1b');
  value.search.setValue('');
  // New browser keeps this test independent of input editing details.
  const other = browser().value;
  other.handleInput('old');
  other.handleInput('\r');
  other.handleInput('\x1b');
  assert.equal(other.branch, undefined);
  assert.equal(other.search.getValue(), 'old');
});

test('full process shows tools, thinking and compaction; final mode hides them', () => {
  const history = new History(fixture(), 'active-a');
  const reader = new Reader(history.path('left-a'), 'old', 'left-a', ui(), theme, '/tmp', () => {});
  let text = allText(reader);
  assert(!text.includes('RESULT_99'));
  assert(!text.includes('SECRET_THINKING'));
  assert(!text.includes('COMPACTION_SUMMARY'));
  assert(!text.includes('RESULT_0'));
  assert(!text.includes('Tool call:'));
  assert(!text.includes('Thinking ('));
  assert(text.includes('root question'));
  reader.handleInput('\x10');
  text = allText(reader);
  assert(text.includes('RESULT_99'));
  assert(text.includes('COMPACTION_SUMMARY'));
  assert(text.includes('Tool call:'));
  assert(text.includes('SECRET_THINKING'));
  reader.handleInput('\x10');
  assert(!allText(reader).includes('SECRET_THINKING'));
});

test('long messages scroll/page, jump to selected message, and reflow on resize', () => {
  const entries = [entry('before', null, user('before')), entry('long', 'before', user(Array.from({ length: 10000 }, (_, i) => `line ${i} 中文`).join('\n'))), entry('after', 'long', assistant('after'))];
  const reader = new Reader(entries, 'long', 'after', ui(), theme, '/tmp', () => {});
  reader.render(90, 22);
  assert.equal(reader.top, reader.positions.find((p) => p.id === 'long').start);
  const start = reader.top;
  reader.handleInput('\x1b[6~');
  assert.equal(reader.top, start + reader.height);
  reader.handleInput('\x1b[B');
  assert.equal(reader.top, start + reader.height + 1);
  reader.handleInput('\x1b[5~');
  assert.equal(reader.top, start + 1);
  reader.render(40, 15);
  assert(reader.render(40, 15).every((line) => visibleWidth(line) <= 40));
  reader.handleInput('\x1b[F');
  assert(reader.render(40, 15).join('\n').includes('after'));
});

test('images use placeholders, unknown/custom/orphan entries stay visible', () => {
  const entries = [
    entry('image', null, user([{ type: 'image', data: 'BASE64_PRIVATE', mimeType: 'image/png' }])),
    entry('orphan', 'image', { role: 'toolResult', toolCallId: 'missing', content: [{ type: 'image', data: 'BASE64_PRIVATE', mimeType: 'image/png' }], isError: false }),
    { id: 'custom', parentId: 'orphan', type: 'custom', customType: 'test', data: { hello: 'CUSTOM_DATA' }, timestamp },
    { id: 'summary', parentId: 'custom', type: 'branch_summary', fromId: 'not-on-path', summary: 'BRANCH_SUMMARY', timestamp },
    { id: 'edit', parentId: 'summary', type: 'context_edit', targetId: 'image', replacement: null, timestamp },
  ];
  const reader = new Reader(entries, 'image', 'edit', ui(), theme, '/tmp', () => {});
  reader.handleInput('\x10');
  const text = allText(reader);
  assert(text.includes('image/png'));
  assert(!text.includes('BASE64_PRIVATE'));
  assert(text.includes('Orphan tool result'));
  assert(text.includes('CUSTOM_DATA'));
  assert(text.includes('BRANCH_SUMMARY'));
  assert(text.includes('original history above is unchanged'));
});

test('tiny terminal safe; tree remains user-only and no native label/filter actions exist', () => {
  const { value } = browser();
  assert(value.render(5).every((line) => visibleWidth(line) <= 5));
  value.handleInput('\x0f');
  value.handleInput('\x14');
  assert(value.rows.every((row) => row.entry.message.role === 'user'));
  value.invalidate();
  value.ui.terminal.rows = 8;
  assert(value.render(40).length <= 6);
});

test('unchanged width scrolling reuses cached layout; expansion preserves entry anchor', () => {
  const history = new History(fixture(), 'active-a');
  const reader = new Reader(history.path('left-a'), 'result', 'left-a', ui(), theme, '/tmp', () => {});
  reader.render(90, 10);
  const lines = reader.lines;
  reader.handleInput('\x1b[B');
  reader.render(90, 10);
  assert.equal(reader.lines, lines);
  const anchor = reader.anchor.id;
  reader.handleInput('\x10');
  reader.render(90, 10);
  assert.equal(reader.anchor.id, anchor);
  assert.notEqual(reader.lines, lines);
});
