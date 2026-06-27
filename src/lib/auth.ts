import { redirect } from "next/navigation";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPortalAccess, type PortalAccess } from "@/lib/portal-access";
import type { Member, User, UserRole, Sede } from "@/generated/prisma/client";

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
 *
 * If a Supabase auth session exists but no matching User row was found,
 * we sign the user out before redirecting so we don't end up in a loop
 * (proxy thinks user is logged in, app thinks they're not).
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    const supabase = await createSupabaseServerClient();
    const { data: { user: supabaseUser } } = await supabase.auth.getUser();
    if (supabaseUser) {
      // orphaned auth session — sign out
      await supabase.auth.signOut();
      redirect("/login?unlinked=1");
    }
    redirect("/login");
  }
  if (!user.active) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/login?disabled=1");
  }
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
 * Resolve the athlete (Member) record for a user. Real members are linked via
 * Member.userId. Staff who are also athletes are auto-linked by matching email
 * the first time they open the portal (Member.userId set once on an unlinked,
 * email-matching record). Read-only when `link` is false. Returns null if none.
 */
export async function resolveAthleteMember(
  user: User,
  opts: { link?: boolean } = {},
): Promise<Member | null> {
  const linked = await prisma.member.findUnique({ where: { userId: user.id } });
  if (linked) return linked;

  // Staff-as-athlete: find their own unlinked record by email.
  if (user.role !== "MEMBER" && user.email) {
    const candidate = await prisma.member.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, userId: null },
    });
    if (candidate && opts.link) {
      return prisma.member.update({
        where: { id: candidate.id },
        data: { userId: user.id },
      });
    }
    return candidate;
  }
  return null;
}

/**
 * Portal Socio. Real MEMBERs must have a linked Member record and are subject to
 * the membership lifecycle gate. Staff who are also athletes (any non-MEMBER role
 * with a matching Member) may preview their own athlete view — they bypass the
 * lifecycle block so they can always experience the app. `isStaff` lets the UI
 * show a "back to dashboard" affordance.
 */
export async function requireMember(
  opts: { enforceAccess?: boolean } = {},
): Promise<{ user: User; member: Member; access: PortalAccess; isStaff: boolean }> {
  const user = await requireAuth();
  const isStaff = user.role !== "MEMBER";

  const member = await resolveAthleteMember(user, { link: true });
  if (!member) {
    if (isStaff) redirect("/dashboard?noathlete=1");
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    redirect("/portal/login?unlinked=1");
  }

  // Membership lifecycle gate. Lapsed-past-grace / churned / frozen socios are
  // sent to the renewal wall. Staff previewing their own view skip this entirely.
  const access = await getPortalAccess(member.id);
  if (!isStaff && opts.enforceAccess !== false && access.state === "blocked") {
    redirect("/portal/bloqueado");
  }

  return { user, member, access, isStaff };
}

/**
 * Super users (OWNER + ACCOUNTING) see everything. COACH and NUTRITIONIST also see
 * all sedes but have no access to financial data. Others are scoped to their sede.
 * Returns the sede to filter by, or null if the user can see all sedes.
 */
export function getSedeScope(user: User): Sede | null {
  if (
    user.role === "OWNER" ||
    user.role === "ACCOUNTING" ||
    user.role === "COACH" ||
    user.role === "NUTRITIONIST"
  ) return null;
  return user.sede;
}

/**
 * Capability checks — used both in server actions and to hide UI.
 */
export const can = {
  viewAllSedes: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "COACH" || user.role === "NUTRITIONIST",
  viewFinancials: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING",
  editFinancials: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING",
  // Pagos section: OWNER, ACCOUNTING, ADMIN only
  viewPayments: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  // Reportes comerciales/ventas: OWNER, ACCOUNTING, ADMIN only
  viewReports: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  // Segmentos: management tool, not for coaches/nutritionists
  viewSegments: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  manageMembers: (user: User) =>
    user.role === "OWNER" || user.role === "ACCOUNTING" || user.role === "ADMIN",
  viewMembers: (user: User) =>
    user.role !== "MEMBER",
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
