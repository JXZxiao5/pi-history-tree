import test from 'node:test';
import assert from 'node:assert/strict';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { visibleWidth, getKeybindings } from '@earendil-works/pi-tui';
import { finalConversation, frame } from '../src/presentation.js';
import { History } from '../src/history.js';
import { Reader } from '../src/reader.js';
import { HistoryBrowser } from '../src/browser.js';
import { entry, user, assistant, ui, theme, fixture } from './fixtures.js';
initTheme('dark', false);

test('final projection removes commentary, tools and metadata; keeps last successful answer', () => {
  const entries = [entry('u', null, user('question')), entry('comment', 'u', assistant('I will investigate')),
    entry('tool', 'comment', assistant('Running command', [{ type: 'toolCall', id: 't', name: 'bash', arguments: {} }])),
    entry('result', 'tool', { role: 'toolResult', toolCallId: 't', content: [] }),
    { id: 'compact', type: 'compaction', summary: 'process summary' },
    entry('final', 'result', assistant('FINAL ANSWER')), entry('u2', 'final', user('next question'))];
  const before = JSON.stringify(entries);
  const projected = finalConversation(entries);
  assert.deepEqual(projected.map((e) => e.id), ['u', 'final', 'u2', 'u2:final-status']);
  assert.equal(JSON.stringify(entries), before);
});

test('incomplete, error, ambiguous and tool-only replies are not labeled final', () => {
  for (const reason of ['error', 'aborted', 'length', 'toolUse', 'pending', 'deferred', undefined]) {
    const reply = { ...assistant('partial'), stopReason: reason };
    assert.equal(finalConversation([entry('u', null, user('q')), entry('a', 'u', reply)])[1].type, 'history_notice');
  }
  const reply = { ...assistant('commentary'), endTurn: false };
  assert.equal(finalConversation([entry('u', null, user('q')), entry('a', 'u', reply)])[1].type, 'history_notice');
  assert.equal(finalConversation([entry('u', null, user('q')), entry('a', 'u', assistant('old answer')),
    entry('r', 'a', { role: 'toolResult', content: [] })])[1].type, 'history_notice');
});

test('one mode switch reveals full process; removed shortcuts do nothing', () => {
  const entries = [entry('u', null, user('question')), entry('a', 'u', assistant('PROCESS_TEXT', [
    { type: 'thinking', thinking: 'PRIVATE_THOUGHT' }, { type: 'toolCall', name: 'tool', id: 't', arguments: { x: 1 } },
  ])), entry('f', 'a', assistant('FINAL_TEXT'))];
  const reader = new Reader(entries, 'u', 'f', ui(), theme, '/tmp', () => {});
  const text = () => { reader.render(90, 20); return reader.lines.join('\n'); };
  assert(text().includes('FINAL_TEXT'));
  assert(!text().includes('PROCESS_TEXT'));
  reader.handleInput('\x14');
  reader.handleInput('\x0f');
  assert.equal(reader.finalOnly, true);
  assert(!text().includes('PRIVATE_THOUGHT'));
  assert(!text().includes('Tool call:'));
  reader.handleInput('\x10');
  assert(text().includes('PROCESS_TEXT'));
  assert(text().includes('PRIVATE_THOUGHT'));
  assert(text().includes('Tool call:'));
  reader.handleInput('\x14');
  reader.handleInput('\x0f');
  assert(text().includes('PRIVATE_THOUGHT'));
  assert(text().includes('Tool call:'));
  reader.handleInput('\x10');
  assert(!text().includes('PROCESS_TEXT'));
  assert(!text().includes('PRIVATE_THOUGHT'));
  assert(!text().includes('Tool call:'));
  assert.equal(reader.finalOnly, true);
  const display = reader.render(90, 20).join('\n');
  assert(!display.includes('Ctrl+O'));
  assert(!display.includes('Ctrl+T'));
});

test('frame pads every row and uses the native Tree border color for every edge', () => {
  let accents = 0;
  const colored = { fg(color, text) { assert.equal(color, 'border'); accents++; return `\x1b[36m${text}\x1b[0m`; } };
  const lines = frame(['中文 😀', '', '\x1b[31mred\x1b[0m'], 30, 8, colored);
  assert.equal(lines.length, 8);
  assert(lines.every((line) => visibleWidth(line) === 30));
  assert(lines[0].includes('╭'));
  assert(lines.at(-1).includes('╰'));
  assert.equal(accents, 14);
});

test('tree, chooser and reader have closed borders within terminal dimensions', () => {
  const browser = new HistoryBrowser(new History(fixture(), 'active-a'), ui(), theme, getKeybindings(), '/tmp', () => {});
  const check = () => {
    const lines = browser.render(90);
    assert.equal(lines.length, Math.floor(browser.ui.terminal.rows * 2 / 3));
    assert(lines.every((line) => visibleWidth(line) === 90));
    assert(lines[0].startsWith('╭'));
    assert(lines.at(-1).startsWith('╰'));
    const headerEnd = browser.reader ? 3 : 4;
    assert(lines[headerEnd].startsWith('╰'));
    assert(lines[headerEnd + 1].startsWith('╭'));
    assert(lines[2].includes('Esc'));
    if (browser.reader) assert(lines[2].includes('Ctrl+P'));
    else if (!browser.branch) assert(lines[3].includes('Search:'));
    assert(!lines.slice(headerEnd + 1).join('\n').includes('PgUp'));
  };
  check();
  browser.handleInput('old'); browser.handleInput('\r'); check();
  browser.handleInput('\r'); check();
  browser.handleInput('\x1b'); check();
  browser.ui.terminal.rows = 48; check();
  browser.ui.terminal.rows = 12; check();
});
