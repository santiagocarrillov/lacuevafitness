// "Modo socio": who counts as a socio for the WhatsApp agent, and its switch.
// Light on purpose (no SDK, no DB): the webhook, the notices and the sweeper
// import it. The turn itself lives in member-agent-runner.ts.
//
// Until 16 oct 2026 a socio who wrote paused the bot, and one who had been a lead
// kept their lead conversation and got the sales pitch. With the switch on, the
// agent answers them in socio mode (MEMBER_SYSTEM_PROMPT in agent.ts).

import type { MemberStatus, Sede } from "@/generated/prisma/client";

/**
 * Off by default: merging changes nothing until Santiago sets
 * WHATSAPP_AGENT_SOCIOS=true in Vercel. Auto-send still follows
 * WHATSAPP_AGENT_AUTOSEND (off = drafts in the inbox).
 */
export function memberModeEnabled(): boolean {
  return process.env.WHATSAPP_AGENT_SOCIOS === "true";
}

/** Paying or on a pause: the ones to win back. TRIAL is still the sales agent's (closing the $9). */
const SOCIO_STATUSES: MemberStatus[] = ["ACTIVE", "PAUSED"];

export type SocioRef = {
  id: string;
  firstName: string;
  lastName: string | null;
  sede: Sede;
  status: MemberStatus;
  joinedAt: Date;
};

/** The socio behind a conversation: its member, or the lead's member once they joined. */
export function socioOf(conv: { member: SocioRef | null; lead: { member: SocioRef | null } | null }): SocioRef | null {
  const m = conv.member ?? conv.lead?.member ?? null;
  return m && SOCIO_STATUSES.includes(m.status) ? m : null;
}

export const SOCIO_SELECT = { id: true, firstName: true, lastName: true, sede: true, status: true, joinedAt: true } as const;
