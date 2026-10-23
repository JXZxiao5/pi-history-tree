import { History } from './history.js';
import { HistoryBrowser } from './browser.js';

export default function historyTree(pi) {
  let active = false;
  let close;
  pi.on('session_shutdown', () => close?.());
  pi.registerCommand('history-tree', {
    description: 'Read-only User message tree; Enter opens historical conversation',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        ctx.ui.notify('history-tree requires interactive terminal mode.', 'warning');
        return;
      }
      if (active) return;
      active = true;
      try {
        // Snapshot only finalized persisted entries. No live session reference
        // enters the browser, and background agent activity is not interrupted.
        const history = new History(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
        if (!history.users.length) {
          ctx.ui.notify('This session has no User messages.', 'info');
          return;
        }
        await ctx.ui.custom((ui, theme, keybindings, done) => {
          const browser = new HistoryBrowser(history, ui, theme, keybindings, ctx.cwd, done);
          close = () => browser.close();
          return browser;
        }, {
          overlay: true,
          overlayOptions: { anchor: 'center', width: '100%', maxHeight: '100%', margin: 0 },
        });
      } catch (error) {
        ctx.ui.notify(`History Tree: ${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        active = false;
        close = undefined;
      }
    },
  });
}
