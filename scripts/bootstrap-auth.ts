/**
 * Bootstrap Supabase Auth users for all staff records.
 *
 * For each User in our DB without a supabaseUserId, creates a Supabase auth
 * user and links it. Generates a temp password printed to stdout — change
 * it after first login.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.
 *
 * Usage: npx tsx scripts/bootstrap-auth.ts [email-to-upsert]
 *
 *   No args:                  create auth users for every seeded staff row
 *   Single email argument:    only for that one email (create or sync)
 */

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

async function syncUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.log(`  [skip] ${email} — not in DB`);
    return;
  }

  // Check if auth user already exists
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);

  if (found) {
    if (user.supabaseUserId !== found.id) {
      await prisma.user.update({
        where: { id: user.id },
        data: { supabaseUserId: found.id },
      });
      console.log(`  [linked] ${email} → supabaseUserId ${found.id}`);
    } else {
      console.log(`  [ok] ${email} already synced`);
    }
    return;
  }

  const tempPassword = randomPassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { fullName: user.fullName, role: user.role },
  });

  if (error || !data.user) {
    console.error(`  [error] ${email}: ${error?.message}`);
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { supabaseUserId: data.user.id },
  });

  console.log(`  [created] ${email} | password: ${tempPassword}`);
}

async function main() {
  const arg = process.argv[2];

  console.log("Bootstrap Supabase Auth users\n");

  if (arg) {
    await syncUser(arg);
  } else {
    const users = await prisma.user.findMany({ where: { active: true } });
    for (const u of users) {
      await syncUser(u.email);
    }
  }

  console.log("\nDone. Share each password with the user — they can change it on first login.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
