import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Neutral post-login landing. Sends each user to the right home based on role:
 * socios (MEMBER) to their portal, staff to the operations dashboard. Both the
 * login pages and /auth/callback default here, and the proxy bounces logged-in
 * users who revisit an auth page here too — so it never matters which login a
 * socio happens to use.
 */
export default async function Bienvenida() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.role === "MEMBER" ? "/portal/hoy" : "/dashboard");
}
