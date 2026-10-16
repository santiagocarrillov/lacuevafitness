/**
 * Conversation rows → the turns the agent reads. Shared by the live runner and
 * the follow-up writer so both see a conversation the same way.
 */

import { mediaTurnMarker } from "./media";
import type { AgentTurn } from "./agent";

type HistoryRow = {
  direction: "INBOUND" | "OUTBOUND";
  body: string;
  mediaKind: string | null;
  mediaVoice: boolean | null;
};

/** A media row's body is either the lead's caption or our "[kind]" placeholder. */
function mediaCaption(body: string): string | null {
  return /^\[[a-z ]+\]$/i.test(body.trim()) ? null : body;
}

export function agentHistory(messages: HistoryRow[]): AgentTurn[] {
  return messages.map((m) => ({
    role: m.direction === "INBOUND" ? "user" : "assistant",
    // A file the model cannot open is announced as such. Storing "[audio]" as if it
    // were the lead's words is how voice notes got answered blind (18 sep).
    text:
      m.direction === "INBOUND" && m.mediaKind
        ? mediaTurnMarker(m.mediaKind, m.mediaVoice === true, m.mediaKind === "audio" ? null : mediaCaption(m.body))
        : m.body,
  }));
}
