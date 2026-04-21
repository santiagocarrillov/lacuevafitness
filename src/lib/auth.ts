import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User, UserRole, Sede } from "@/generated/prisma/client";

/**
 * Returns the currently logged-in user (from Supabase Auth + our User table),
 * or null if not authenticated.
 *
 * Cached per request — can be called from any server component without
 * re-querying Supabase/DB.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: { user: supabaseUser } } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  // Look up by supabaseUserId first, fall back to email
  let user = await prisma.user.findUnique({
    where: { supabaseUserId: supabaseUser.id },
  });

  if (!user && supabaseUser.email) {
    // First login — link existing User record (by email) to auth.users
    user = await prisma.user.findUnique({
      where: { email: supabaseUser.email },
    });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { supabaseUserId: supabaseUser.id },
      });
    }
  }

  return user;
});

/**
 * Redirect to /login if not authenticated.
 * Use at the top of server components that require auth.
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.active) redirect("/login?disabled=1");
  return user;
}

/**
 * Ensure the current user has one of the allowed roles.
 */
export async function requireRole(...allowed: UserRole[]): Promise<User> {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) redirect("/dashboard?forbidden=1");
  return user;
}

/**
 * Super users (OWNER + ACCOUNTING) see everything. Others are scoped to their sede.
 * Returns the sede to filter by, or null if the user can see all sedes.
 */
export function getSedeScope(user: User): Sede | null {
  if (user.role === "OWNER" || user.role === "ACCOUNTING") return null;
  return user.sede;
}

/**
 * Capability checks — used both in server actions and to hide UI.
 */
export const can = {
  viewAllSedes: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING",
  viewFinancials: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING",
  editFinancials: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING",
  viewReports: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  manageMembers: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  viewMembers: (user: User) =>
    user.role !== "MEMBER", // staff can all see members
  manageLeads: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  recordAttendance: (user: User) =>
    user.role === "OWNER" || user.role === "ADMIN",
  confirmCoach: (user: User) =>
    user.role === "COACH" || user.role === "ADMIN" || user.role === "OWNER",
  editCoachConfirmation: (user: User) =>
    user.role === "COACH" || user.role === "OWNER",
  editMembership: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  editBodyComp: (user: User) =>
    user.role === "OWNER" || user.role === "NUTRITIONIST" || user.role === "ADMIN",
  editTests: (user: User) =>
    user.role === "OWNER" || user.role === "COACH" || user.role === "NUTRITIONIST" || user.role === "ADMIN",
  manageUsers: (user: User) =>
    user.role === "OWNER",
  manageChallenges: (user: User) =>
    user.role === "OWNER" || user.role === "ADMIN",
};
