/**
 * Smoke test for WhatsApp Cloud API integration (Sem 1).
 *
 * Usage:
 *   # Send a free-form text (only works inside the 24h customer-service window):
 *   npx tsx scripts/test-whatsapp.ts text +593999999999 "Hola desde La Cueva 👋"
 *
 *   # Send an approved template (works any time):
 *   npx tsx scripts/test-whatsapp.ts template +593999999999 hello_world en_US
 *
 *   # List recent inbound messages persisted by the webhook:
 *   npx tsx scripts/test-whatsapp.ts inbox
 *
 *   # Dump WhatsApp env config:
 *   npx tsx scripts/test-whatsapp.ts env
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { sendText, sendTemplate } from "../src/lib/whatsapp/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

function normalize(phone: string): string {
  // WhatsApp expects MSISDN without leading + or spaces.
  return phone.replace(/[^\d]/g, "");
}

async function cmdText(to: string, body: string) {
  const result = await sendText(normalize(to), body);
  console.log("✓ sent:", result.messageId);
}

async function cmdTemplate(to: string, name: string, language: string) {
  const result = await sendTemplate(normalize(to), name, language);
  console.log("✓ sent template:", result.messageId);
}

async function cmdInbox() {
  const messages = await prisma.message.findMany({
    where: { direction: "INBOUND" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      conversation: {
        include: { lead: { select: { firstName: true, lastName: true, phone: true } } },
      },
    },
  });
  if (messages.length === 0) {
    console.log("(no inbound messages yet)");
    return;
  }
  for (const m of messages) {
    const lead = m.conversation.lead;
    const name = `${lead.firstName}${lead.lastName ? " " + lead.lastName : ""}`;
    console.log(`[${m.createdAt.toISOString()}] ${name} (${lead.phone}): ${m.body}`);
  }
}

function cmdEnv() {
  const keys = [
    "WHATSAPP_PHONE_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_TOKEN",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_GRAPH_VERSION",
    "WHATSAPP_DEFAULT_SEDE",
  ];
  for (const k of keys) {
    const v = process.env[k];
    const display = !v
      ? "(unset)"
      : k.includes("TOKEN") || k.includes("SECRET")
        ? `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)`
        : v;
    console.log(`${k}=${display}`);
  }
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "text":
      if (args.length < 2) throw new Error("usage: text <phone> <body>");
      await cmdText(args[0], args.slice(1).join(" "));
      break;
    case "template":
      if (args.length < 3) throw new Error("usage: template <phone> <name> <language>");
      await cmdTemplate(args[0], args[1], args[2]);
      break;
    case "inbox":
      await cmdInbox();
      break;
    case "env":
      cmdEnv();
      break;
    default:
      console.log("commands: text | template | inbox | env");
      process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("✗", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
