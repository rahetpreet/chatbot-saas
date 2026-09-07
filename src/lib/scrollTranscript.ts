/**
 * Scrolls a chat transcript to its newest message.
 *
 * Deliberately not `scrollIntoView`. That walks up the tree and scrolls every
 * scrollable ancestor, so a transcript inside a page drags the whole page down
 * with it — in the agent inbox that pushed the conversation list off screen
 * every few seconds, which read as the inbox jumping around on its own and
 * made a chat impossible to click or read.
 *
 * Setting `scrollTop` moves only the panel it is called on.
 */
export function scrollTranscriptToBottom(
  container: HTMLElement | null | undefined,
  options: { smooth?: boolean } = {},
): void {
  if (!container) return;
  try {
    container.scrollTo({ top: container.scrollHeight, behavior: options.smooth ? "smooth" : "auto" });
  } catch {
    // Older engines without scrollTo options still honour the plain property.
    container.scrollTop = container.scrollHeight;
  }
}

/**
 * Whether the reader is close enough to the bottom that auto-scrolling is
 * welcome rather than an interruption.
 *
 * Someone who has scrolled back to read earlier messages should not be yanked
 * to the end because a new one arrived.
 */
export function isNearBottom(container: HTMLElement | null | undefined, slack = 120): boolean {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight <= slack;
}
