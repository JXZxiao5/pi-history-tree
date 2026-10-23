import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';

/** A complete opaque rectangle, including blank rows, with themed borders. */
export function frame(lines, width, height, theme) {
  if (width < 4 || height < 3) return lines.slice(0, height).map((line) => truncateToWidth(line, width));
  const inner = width - 4;
  // Match pi's native Tree / DynamicBorder rather than the purple accent.
  const border = (text) => theme.fg('border', text);
  const result = [border(`╭${'─'.repeat(width - 2)}╮`)];
  for (let i = 0; i < height - 2; i++) {
    const text = truncateToWidth(lines[i] ?? '', inner);
    result.push(`${border('│')} ${text}${' '.repeat(Math.max(0, inner - visibleWidth(text)))} ${border('│')}`);
  }
  result.push(border(`╰${'─'.repeat(width - 2)}╯`));
  return result;
}

/**
 * Conservative turn projection: the final conversational event between User
 * messages must be a successful text Assistant reply with no tool calls.
 * Pi stores no universal final-vs-commentary channel, so this is a heuristic,
 * not a claim to recover provider channel metadata that was never persisted.
 */
export function finalConversation(entries) {
  const result = [];
  let user;
  let lastEvent;
  const flush = () => {
    if (!user) return;
    const message = lastEvent?.message;
    const content = Array.isArray(message?.content) ? message.content : [];
    const final = message?.role === 'assistant' && message.stopReason === 'stop' && message.endTurn !== false
      && !content.some((part) => part.type === 'toolCall')
      && content.some((part) => part.type === 'text' && part.text?.trim());
    if (final) result.push(lastEvent);
    else result.push({
      type: 'history_notice', id: `${user.id}:final-status`, parentId: user.id,
      timestamp: user.timestamp,
      text: `No confirmed final reply (${message?.stopReason ?? (message ? 'unfinished tool/process output' : 'no response stored')}). Ctrl+P shows the recorded process.`,
    });
  };
  for (const entry of entries) {
    if (entry.type !== 'message') continue;
    if (entry.message?.role === 'user') {
      flush();
      user = entry;
      lastEvent = undefined;
      result.push(entry);
    } else if (user && ['assistant', 'toolResult', 'bashExecution'].includes(entry.message?.role)) {
      lastEvent = entry;
    }
  }
  flush();
  return result;
}
