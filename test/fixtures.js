export const timestamp = '2026-01-01T00:00:00.000Z';
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
export const user = (content) => ({ role: 'user', content, timestamp: 1 });
export const assistant = (text, extra = []) => ({ role: 'assistant', content: [{ type: 'text', text }, ...extra], timestamp: 2, api: 'openai-responses', provider: 'test', model: 'test', usage, stopReason: 'stop' });
export const entry = (id, parentId, message) => ({ type: 'message', id, parentId, timestamp, message });
export function fixture() {
  return [
    entry('root', null, user('root question')),
    entry('old', 'root', user('old question')),
    entry('old-a', 'old', assistant('old answer', [{ type: 'thinking', thinking: 'SECRET_THINKING' }, { type: 'toolCall', id: 'call', name: 'sample', arguments: { command: 'never execute' } }])),
    entry('result', 'old-a', { role: 'toolResult', toolName: 'sample', toolCallId: 'call', isError: false, timestamp: 3, content: [{ type: 'text', text: Array.from({ length: 100 }, (_, i) => `RESULT_${i}`).join('\n') }], details: { fullOutputPath: '/nonexistent/output' } }),
    { type: 'compaction', id: 'compact', parentId: 'result', timestamp, firstKeptEntryId: 'old-a', tokensBefore: 100, summary: 'COMPACTION_SUMMARY' },
    entry('left', 'compact', user('left question')),
    entry('left-a', 'left', assistant('LEFT_ONLY')),
    entry('right', 'old', user('right question')),
    entry('right-a', 'right', assistant('RIGHT_ONLY')),
    entry('active', 'root', user('active question')),
    entry('active-a', 'active', assistant('ACTIVE_ONLY')),
  ];
}
export const theme = { fg: (_color, text) => text };
export function ui() { return { terminal: { rows: 24, columns: 90 }, requestRender() {} }; }
