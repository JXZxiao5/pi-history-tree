import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { History, safeText } from '../src/history.js';
import { fixture, entry, user, timestamp } from './fixtures.js';

test('snapshot preserves session leaf and entries; current path preferred', () => {
  const manager = SessionManager.inMemory('/tmp', undefined, [{ type: 'session', version: 3, id: 'test', timestamp, cwd: '/tmp' }, ...fixture()]);
  const before = JSON.stringify(manager.getEntries());
  const history = new History(manager.getEntries(), manager.getLeafId());
  assert.deepEqual(history.tips('root'), ['active-a']);
  assert.deepEqual(history.tips('old'), ['left-a', 'right-a']);
  assert.deepEqual(history.tips('left'), ['left-a']);
  assert.deepEqual(history.path('left-a').map((e) => e.id), ['root', 'old', 'old-a', 'result', 'compact', 'left', 'left-a']);
  assert.equal(manager.getLeafId(), 'active-a');
  assert.equal(JSON.stringify(manager.getEntries()), before);
  assert.equal(manager.getSessionFile(), undefined);
  history.byId.get('root').message.content = 'local change';
  assert.equal(JSON.stringify(manager.getEntries()), before);
});

test('User rows exclude assistant/tools and keep depth and active branch ordering', () => {
  const history = new History(fixture(), 'active-a');
  assert.deepEqual(history.users.map((r) => r.entry.id), ['root', 'active', 'old', 'left', 'right']);
  assert.equal(history.users.find((r) => r.entry.id === 'left').depth, 2);
});

test('multiple roots, missing parents and cycles terminate safely', () => {
  const history = new History([entry('a', 'b', user('a')), entry('b', 'a', user('b')), entry('c', 'missing', user('c'))], null);
  assert.equal(history.users.length, 3);
  assert.equal(history.path('a').length, 2);
  assert.deepEqual(history.tips('a'), ['a']);
});

test('stored terminal controls cannot execute', () => {
  assert.equal(safeText('\x1b[2J\x07'), '\\x1b[2J\\x07');
  assert.equal(safeText('a\nb\tc'), 'a\nb\tc');
});
