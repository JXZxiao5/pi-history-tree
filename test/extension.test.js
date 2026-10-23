import test from 'node:test';
import assert from 'node:assert/strict';
import extension from '../src/index.js';
import { fixture, ui, theme } from './fixtures.js';
import { getKeybindings } from '@earendil-works/pi-tui';
import { initTheme } from '@earendil-works/pi-coding-agent';
initTheme('dark', false);

test('command uses only read APIs, overlay lifecycle closes and can reopen', async () => {
  let handler;
  const events = new Map();
  extension({ on: (name, fn) => events.set(name, fn), registerCommand: (name, command) => { assert.equal(name, 'history-tree'); handler = command.handler; } });
  const entries = fixture();
  const before = JSON.stringify(entries);
  let opened = 0;
  const ctx = {
    mode: 'tui', cwd: '/tmp',
    sessionManager: new Proxy({ getEntries: () => entries, getLeafId: () => 'active-a' }, { get: (object, key) => { assert(key in object, `Unexpected session access ${String(key)}`); return object[key]; } }),
    ui: {
      notify: (message) => assert.fail(message),
      custom: async (factory, options) => {
        assert.equal(options.overlay, true);
        opened++;
        let finished = false;
        const component = factory(ui(), theme, getKeybindings(), () => { finished = true; });
        component.handleInput('root');
        component.handleInput('\r');
        component.render(90);
        component.handleInput('\x1b');
        component.handleInput('\x1b');
        assert(finished);
        component.dispose();
      },
    },
  };
  await handler('', ctx);
  await handler('', ctx);
  assert.equal(opened, 2);
  assert.equal(JSON.stringify(entries), before);
});

test('non-TUI mode is rejected without reading session', async () => {
  let handler;
  extension({ on() {}, registerCommand: (_name, command) => { handler = command.handler; } });
  let notice;
  await handler('', { mode: 'rpc', ui: { notify: (text) => { notice = text; } } });
  assert.match(notice, /requires interactive/);
});

test('duplicate command guarded; shutdown closes active overlay', async () => {
  let handler, shutdown, finish, browser;
  extension({ on: (_name, fn) => { shutdown = fn; }, registerCommand: (_name, command) => { handler = command.handler; } });
  let count = 0;
  const ctx = { mode: 'tui', cwd: '/tmp', sessionManager: { getEntries: fixture, getLeafId: () => 'active-a' }, ui: {
    notify: assert.fail,
    custom: (factory) => new Promise((resolve) => { count++; finish = resolve; browser = factory(ui(), theme, getKeybindings(), resolve); }),
  } };
  const pending = handler('', ctx);
  await handler('', ctx);
  assert.equal(count, 1);
  shutdown();
  await pending;
  assert(browser.closed);
  finish();
});
