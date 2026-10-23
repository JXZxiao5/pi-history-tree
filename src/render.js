import { AssistantMessageComponent, UserMessageComponent, ToolExecutionComponent, getMarkdownTheme } from '@earendil-works/pi-coding-agent';
import { Container, Markdown, Text } from '@earendil-works/pi-tui';
import { contentText, safeText, safeValue } from './history.js';

function json(value) {
  return JSON.stringify(safeValue(value), (_key, item) => item?.type === 'image' && typeof item.data === 'string'
    ? { ...item, data: '[image data omitted; placeholder only]' }
    : item, 2) ?? '';
}

function compact(text, expanded) {
  const lines = text.split('\n');
  return expanded || lines.length <= 10 ? text : `${lines.slice(0, 10).join('\n')}\n… (${lines.length - 10} more lines; Ctrl+P for full process)`;
}

function textContent(content) {
  return safeText(contentText(content));
}

function safeBlocks(content) {
  if (!Array.isArray(content)) return [];
  return content.map((block) => block.type === 'image'
    ? { type: 'text', text: `[Image placeholder: ${safeText(block.mimeType)}; inline images not enabled]` }
    : safeValue(block));
}

/** Pure display adapters. Intentionally do not invoke third-party tool/entry renderers. */
export function createBlocks(entries, ui, cwd) {
  const calls = new Map();
  for (const entry of entries) {
    if (entry.type === 'message' && entry.message?.role === 'assistant') {
      for (const block of entry.message.content ?? []) if (block.type === 'toolCall') calls.set(block.id, block);
    }
  }
  return entries.map((entry) => ({
    id: entry.id,
    create({ expanded, thinking }) {
      const container = new Container();
      const title = (label) => container.addChild(new Text(`${label} · ${safeText(entry.id)} · ${safeText(entry.timestamp)}`, 0, 0));
      const plain = (text) => container.addChild(new Text(text, 1, 0));
      const markdown = (text) => container.addChild(new Markdown(safeText(text), 1, 0, getMarkdownTheme()));
      if (entry.type === 'history_notice') {
        plain(safeText(entry.text));
      } else if (entry.type === 'message') {
        const message = entry.message;
        if (!expanded && ['toolResult', 'bashExecution'].includes(message.role)) return undefined;
        if (message.role === 'assistant') {
          const visible = (message.content ?? []).some((part) =>
            (part.type === 'text' && part.text?.trim()) || (part.type === 'thinking' && thinking) || (part.type === 'toolCall' && expanded));
          if (!visible && !['error', 'aborted', 'length'].includes(message.stopReason)) return undefined;
        }
        title(message.role);
        switch (message.role) {
          case 'user':
            container.addChild(new UserMessageComponent(textContent(message.content) || '[Empty message]'));
            break;
          case 'assistant': {
            const safeMessage = { ...message, content: safeBlocks(message.content).filter((part) => part.type !== 'thinking' || thinking), errorMessage: safeText(message.errorMessage) };
            container.addChild(new AssistantMessageComponent(safeMessage, !thinking, getMarkdownTheme(), 'Thinking'));
            for (const call of message.content ?? []) {
              if (expanded && call.type === 'toolCall') plain(`Tool call: ${safeText(call.name)} [${safeText(call.id)}]\n${compact(json(call.arguments), expanded)}`);
              if (thinking && call.type === 'thinking' && !call.thinking) plain('[Thinking redacted or not stored]');
            }
            break;
          }
          case 'toolResult': {
            const call = calls.get(message.toolCallId);
            if (!call) plain('[Orphan tool result: call not present on this branch]');
            const tool = new ToolExecutionComponent(safeText(message.toolName ?? call?.name ?? 'tool'), message.toolCallId, safeValue(call?.arguments ?? {}), { showImages: false }, {}, ui, cwd);
            tool.updateResult({ content: safeBlocks(message.content), isError: !!message.isError });
            tool.setExpanded(expanded);
            container.addChild(tool);
            if (message.details !== undefined) plain(`Details:\n${compact(json(message.details), expanded)}`);
            if (message.nestedCalls) plain(`Nested calls (metadata only):\n${compact(json(message.nestedCalls), expanded)}`);
            break;
          }
          case 'bashExecution':
            plain(`$ ${safeText(message.command)}\n${compact(safeText(message.output), expanded)}`);
            if (message.truncated) plain(`[Stored output truncated. External output: ${safeText(message.fullOutputPath ?? 'unavailable')}]`);
            plain(`exit=${message.exitCode ?? 'unknown'}${message.cancelled ? ' · cancelled' : ''}`);
            break;
          case 'compactionSummary':
          case 'branchSummary':
            markdown(message.summary ?? '');
            break;
          case 'custom':
            if (message.display === false) plain('[Hidden custom message; not displayed]');
            else markdown(textContent(message.content));
            break;
          default:
            plain(compact(json(message), expanded));
        }
      } else if (entry.type === 'compaction' || entry.type === 'branch_summary') {
        title(entry.type === 'compaction' ? `Compaction boundary (${entry.tokensBefore} tokens); original history retained above` : `Branch summary (from ${safeText(entry.fromId)}; other branch not included)`);
        markdown(entry.summary ?? '');
      } else if (entry.type === 'custom_message') {
        title(`Custom message: ${safeText(entry.customType)}`);
        if (entry.display === false) plain('[Hidden custom message; not displayed]');
        else markdown(textContent(entry.content));
        if (entry.details !== undefined) plain(compact(json(entry.details), expanded));
      } else {
        title(entry.type === 'context_edit' ? 'Context edit (original history above is unchanged)' : safeText(entry.type));
        plain(compact(json(entry), expanded));
      }
      return container;
    },
  }));
}
