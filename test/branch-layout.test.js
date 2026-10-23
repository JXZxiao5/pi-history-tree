import test from 'node:test';
import assert from 'node:assert/strict';
import { History, treePrefix } from '../src/history.js';
import { entry, user, assistant } from './fixtures.js';

test('a linear conversation never gains indentation', () => {
  const entries = [];
  let parent = null;
  for (let i = 0; i < 100; i++) {
    entries.push(entry(`u${i}`, parent, user(`question ${i}`)), entry(`a${i}`, `u${i}`, assistant(`answer ${i}`)));
    parent = `a${i}`;
  }
  const history = new History(entries, parent);
  assert.equal(history.users.length, 100);
  assert(history.users.every((row) => row.depth === 0 && treePrefix(row) === '· '));
});

test('forks on hidden Assistant/tool entries add one level; continuations stay level', () => {
  const entries = [
    entry('u', null, user('root')),
    entry('a', 'u', assistant('common response')),
    entry('left', 'a', user('left')),
    entry('la', 'left', assistant('left reply')),
    entry('left-next', 'la', user('left continuation')),
    entry('tool', 'left-next', { role: 'toolResult', content: [] }),
    entry('nested1', 'tool', user('nested first')),
    entry('nested2', 'tool', user('nested second')),
    entry('right', 'a', user('right')),
    entry('right-next', 'right', user('right continuation')),
  ];
  const history = new History(entries, 'nested1');
  assert.deepEqual(history.users.map((row) => [row.entry.id, row.depth]), [
    ['u', 0], ['left', 1], ['left-next', 1], ['nested1', 2], ['nested2', 2], ['right', 1], ['right-next', 1],
  ]);
  const prefix = (id) => treePrefix(history.users.find((row) => row.entry.id === id));
  assert.equal(prefix('left'), '  ├─ ');
  assert.equal(prefix('left-next'), '  │  ');
  assert.equal(prefix('nested1'), '  │ ├─ ');
  assert.equal(prefix('nested2'), '  │ └─ ');
  assert.equal(prefix('right'), '  └─ ');
  assert.equal(prefix('right-next'), '     ');
  assert.equal(history.users.find((row) => row.entry.id === 'left').depth,
    history.users.find((row) => row.entry.id === 'left-next').depth);
});

test('a fork is counted even when a sibling branch has no User messages', () => {
  const history = new History([
    entry('u', null, user('question')), entry('a', 'u', assistant('fork')),
    entry('empty', 'a', assistant('no further user')),
    entry('continuation', 'a', assistant('other path')),
    entry('u2', 'continuation', user('next')),
  ], 'u2');
  assert.deepEqual(history.users.map((row) => row.depth), [0, 1]);
});
