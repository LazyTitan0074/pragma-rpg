// Story memory: thresholds for rolling chat summarisation (audit R6).
// Every save used to include the entire chat history; long sessions inflated
// records until QuotaExceededError. Solution: when history exceeds
// SUMMARIZE_AFTER_MESSAGES messages, the older part is compressed by the AI
// into a summary and only the last KEEP_RECENT_MESSAGES turns stay in
// chat/saves.

export const SUMMARIZE_AFTER_MESSAGES = 30;
export const KEEP_RECENT_MESSAGES = 12;

/**
 * Decides whether history should be compressed and returns both parts.
 * @param {Array<{role: string, text: string}>} messages
 * @returns {null | {older: Array, recent: Array}} null = not yet needed
 */
export function splitForSummarization(messages) {
  if (!Array.isArray(messages)) return null;
  if (messages.length <= SUMMARIZE_AFTER_MESSAGES) return null;

  const cut = messages.length - KEEP_RECENT_MESSAGES;
  if (cut <= 0) return null;

  return {
    older: messages.slice(0, cut),
    recent: messages.slice(cut),
  };
}

/**
 * Formats a message list into a readable transcript labelled PLAYER/GAME MASTER
 * for the summarisation prompt.
 */
export function formatTranscript(messages) {
  if (!Array.isArray(messages)) return "";
  return messages
    .map((m) => `${m.role === "user" || m.role === "player" ? "PLAYER" : "GAME MASTER"}: ${m.text}`)
    .join("\n\n");
}
