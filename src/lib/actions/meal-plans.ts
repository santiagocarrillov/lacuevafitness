"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { pushToMember } from "@/lib/push/send";
import {
  defaultTargets,
  emptyPlanContent,
  parsePlanContent,
  planContentSchema,
  scalePlan,
  type PlanContent,
  type PlanKind,
  type PlanTargets,
} from "@/lib/nutrition/plan-schema";
import type { Prisma, User } from "@/generated/prisma/client";

async function requireNutrition(): Promise<User> {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) throw new Error("Sin permisos");
  return user;
}

function validContent(content: unknown): PlanContent {
  const r = planContentSchema.safeParse(content);
  if (!r.success) {
    throw new Error(`El plan tiene datos inválidos: ${r.error.issues[0]?.message ?? "revisa los campos"}`);
  }
  return r.data;
}

const asJson = (c: PlanContent) => c as unknown as Prisma.InputJsonValue;

function revalidatePlans(memberId?: string) {
  revalidatePath("/dashboard/nutricion/planes");
  if (memberId) {
    revalidatePath(`/dashboard/socios/${memberId}`);
    revalidatePath("/portal/nutricion");
    revalidatePath("/portal/hoy");
  }
}

// ── Lists ────────────────────────────────────────────────────────────

export async function listPlansOverview() {
  await requireNutrition();
  const [templates, plans] = await Promise.all([
    prisma.mealPlanTemplate.findMany({
      where: { active: true },
      orderBy: [{ calorieLevel: "asc" }, { name: "asc" }],
      select: { id: true, name: true, calorieLevel: true, content: true, updatedAt: true, _count: { select: { plans: true } } },
    }),
    prisma.mealPlan.findMany({
      // Structured plans are schemaVersion 2; v1 rows are the old Google-Doc links.
      where: { active: true, schemaVersion: 2 },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: {
        id: true,
        title: true,
        calorieTarget: true,
        publishedAt: true,
        updatedAt: true,
        content: true,
        draftContent: true,
        externalUrl: true,
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);
  return {
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      calorieLevel: t.calorieLevel,
      kind: parsePlanContent(t.content)?.kind ?? null,
      uses: t._count.plans,
      updatedAt: t.updatedAt,
    })),
    plans: plans
      .map((p) => {
        const draft = parsePlanContent(p.draftContent);
        const pub = parsePlanContent(p.content);
        return {
          id: p.id,
          title: p.title,
          kcal: p.calorieTarget,
          kind: (draft ?? pub)?.kind ?? null,
          published: p.publishedAt !== null && pub !== null,
          pendingChanges: draft !== null && JSON.stringify(draft) !== JSON.stringify(pub),
          linkOnly: !draft && !pub,
          updatedAt: p.updatedAt,
          member: { id: p.member.id, name: `${p.member.firstName} ${p.member.lastName}`.trim() },
        };
      })
      .filter((p) => !p.linkOnly),
  };
}

// ── Templates ────────────────────────────────────────────────────────

export async function createTemplate(input: { name: string; kind: PlanKind; calorieLevel: number }) {
  const user = await requireNutrition();
  const name = input.name.trim();
  if (!name) throw new Error("La plantilla necesita un nombre.");
  const kcal = Math.round(input.calorieLevel);
  if (!(kcal >= 800 && kcal <= 6000)) throw new Error("El nivel calórico debe estar entre 800 y 6000.");
  const t = await prisma.mealPlanTemplate.create({
    data: {
      name,
      calorieLevel: kcal,
      content: asJson(emptyPlanContent(input.kind, defaultTargets(kcal))),
      schemaVersion: 2,
      authoredById: user.id,
    },
    select: { id: true },
  });
  revalidatePlans();
  return t;
}

export async function saveTemplate(id: string, input: { name: string; calorieLevel: number; notes?: string | null; content: unknown }) {
  await requireNutrition();
  const content = validContent(input.content);
  await prisma.mealPlanTemplate.update({
    where: { id },
    data: {
      name: input.name.trim() || "Plantilla",
      calorieLevel: Math.round(input.calorieLevel) || Math.round(content.targets.kcal),
      notes: input.notes?.trim() || null,
      content: asJson(content),
      schemaVersion: 2,
    },
  });
  revalidatePlans();
}

export async function archiveTemplate(id: string) {
  await requireNutrition();
  await prisma.mealPlanTemplate.update({ where: { id }, data: { active: false } });
  revalidatePlans();
}

export async function duplicateTemplate(id: string) {
  const user = await requireNutrition();
  const t = await prisma.mealPlanTemplate.findUniqueOrThrow({ where: { id } });
  const copy = await prisma.mealPlanTemplate.create({
    data: {
      name: `${t.name} (copia)`,
      calorieLevel: t.calorieLevel,
      content: t.content ?? undefined,
      schemaVersion: 2,
      notes: t.notes,
      authoredById: user.id,
    },
    select: { id: true },
  });
  revalidatePlans();
  return copy;
}

// ── Member plans ─────────────────────────────────────────────────────

/** The socio's target kcal: NutritionTarget if set. */
async function memberTargetKcal(memberId: string): Promise<number | null> {
  const t = await prisma.nutritionTarget.findUnique({ where: { memberId }, select: { kcal: true } });
  return t?.kcal ?? null;
}

async function memberTargets(memberId: string): Promise<PlanTargets | null> {
  const t = await prisma.nutritionTarget.findUnique({
    where: { memberId },
    select: { kcal: true, proteinG: true, carbsG: true, fatG: true },
  });
  return t ?? null;
}

/** New draft plan for a socio: blank (with their target if set) or copied from a template. */
export async function createMemberPlan(input: { memberId: string; kind?: PlanKind; templateId?: string | null; scaleToTarget?: boolean }) {
  const user = await requireNutrition();
  const member = await prisma.member.findUniqueOrThrow({
    where: { id: input.memberId },
    select: { id: true, firstName: true },
  });

  let content: PlanContent;
  let templateId: string | null = null;
  if (input.templateId) {
    const t = await prisma.mealPlanTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
    const parsed = parsePlanContent(t.content);
    if (!parsed) throw new Error("La plantilla está vacía o dañada.");
    templateId = t.id;
    const target = input.scaleToTarget ? await memberTargetKcal(member.id) : null;
    content = target ? scalePlan(parsed, target) : parsed;
  } else {
    const targets = (await memberTargets(member.id)) ?? defaultTargets(1800);
    content = emptyPlanContent(input.kind ?? "MENU", targets);
  }

  const plan = await prisma.mealPlan.create({
    data: {
      memberId: member.id,
      title: `Plan de ${member.firstName} · ${Math.round(content.targets.kcal)} kcal`,
      calorieTarget: Math.round(content.targets.kcal),
      draftContent: asJson(content),
      schemaVersion: 2,
      templateId,
      source: "MANUAL",
      authoredById: user.id,
      visibleToMember: true,
    },
    select: { id: true },
  });
  revalidatePlans(member.id);
  return plan;
}

/** Saves the editor's work as a draft. The socio keeps seeing the last published version. */
export async function saveMemberPlanDraft(id: string, input: { title: string; content: unknown }) {
  await requireNutrition();
  const content = validContent(input.content);
  const plan = await prisma.mealPlan.update({
    where: { id },
    data: {
      title: input.title.trim() || "Plan alimenticio",
      draftContent: asJson(content),
    },
    select: { memberId: true },
  });
  revalidatePlans(plan.memberId);
}

async function publishPlanTx(tx: Prisma.TransactionClient, planId: string, content: PlanContent) {
  const now = new Date();
  const plan = await tx.mealPlan.update({
    where: { id: planId },
    data: {
      content: asJson(content),
      draftContent: asJson(content),
      publishedAt: now,
      calorieTarget: Math.round(content.targets.kcal),
      active: true,
      visibleToMember: true,
      startsAt: now,
      endsAt: null,
    },
    select: { memberId: true },
  });
  // One current plan per socio: the previous ones end today (kept as history).
  await tx.mealPlan.updateMany({
    where: { memberId: plan.memberId, active: true, id: { not: planId } },
    data: { active: false, endsAt: now },
  });
  return plan.memberId;
}

/** Publishes the draft: the socio sees it (and only it) from now on, and gets a push. */
export async function publishMemberPlan(id: string, input?: { title: string; content: unknown }) {
  await requireNutrition();
  const current = await prisma.mealPlan.findUniqueOrThrow({ where: { id }, select: { draftContent: true, title: true, publishedAt: true } });
  const content = validContent(input?.content ?? current.draftContent);
  const memberId = await prisma.$transaction(async (tx) => {
    if (input?.title) await tx.mealPlan.update({ where: { id }, data: { title: input.title.trim() || current.title } });
    return publishPlanTx(tx, id, content);
  });
  await pushToMember(memberId, {
    title: current.publishedAt ? "Tu plan alimenticio se actualizó" : "Tu nutricionista publicó tu plan",
    body: "Ábrelo en la app para ver tus comidas de hoy.",
    url: "/portal/nutricion",
  }).catch(() => undefined);
  revalidatePlans(memberId);
}

/** Turns a socio's plan into a reusable template. */
export async function saveMemberPlanAsTemplate(id: string, name: string) {
  const user = await requireNutrition();
  const p = await prisma.mealPlan.findUniqueOrThrow({ where: { id }, select: { draftContent: true, content: true } });
  const content = parsePlanContent(p.draftContent) ?? parsePlanContent(p.content);
  if (!content) throw new Error("El plan está vacío.");
  const t = await prisma.mealPlanTemplate.create({
    data: {
      name: name.trim() || "Plantilla",
      calorieLevel: Math.round(content.targets.kcal),
      content: asJson(content),
      schemaVersion: 2,
      authoredById: user.id,
    },
    select: { id: true },
  });
  revalidatePlans();
  return t;
}

/**
 * Shares a template (or an existing plan) with several socios at once: one
 * independent MealPlan per socio, optionally rescaled to each one's target
 * kcal, left as draft or published right away.
 */
export async function assignPlanToMembers(input: {
  templateId?: string | null;
  planId?: string | null;
  memberIds: string[];
  scaleToTarget: boolean;
  publishNow: boolean;
}) {
  const user = await requireNutrition();
  const memberIds = [...new Set(input.memberIds)].slice(0, 100);
  if (memberIds.length === 0) throw new Error("Elige al menos un socio.");

  let base: PlanContent | null = null;
  let templateId: string | null = null;
  if (input.templateId) {
    const t = await prisma.mealPlanTemplate.findUniqueOrThrow({ where: { id: input.templateId } });
    base = parsePlanContent(t.content);
    templateId = t.id;
  } else if (input.planId) {
    const p = await prisma.mealPlan.findUniqueOrThrow({ where: { id: input.planId }, select: { draftContent: true, content: true, templateId: true } });
    base = parsePlanContent(p.draftContent) ?? parsePlanContent(p.content);
    templateId = p.templateId;
  }
  if (!base) throw new Error("No hay contenido para compartir.");

  const [members, targets] = await Promise.all([
    prisma.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, firstName: true } }),
    prisma.nutritionTarget.findMany({ where: { memberId: { in: memberIds } }, select: { memberId: true, kcal: true } }),
  ]);
  const targetBy = new Map(targets.map((t) => [t.memberId, t.kcal]));

  let scaled = 0;
  for (const m of members) {
    const target = input.scaleToTarget ? targetBy.get(m.id) : undefined;
    const content = target ? scalePlan(base, target) : base;
    if (target) scaled++;
    await prisma.$transaction(async (tx) => {
      const plan = await tx.mealPlan.create({
        data: {
          memberId: m.id,
          title: `Plan de ${m.firstName} · ${Math.round(content.targets.kcal)} kcal`,
          calorieTarget: Math.round(content.targets.kcal),
          draftContent: asJson(content),
          schemaVersion: 2,
          templateId,
          source: "MANUAL",
          authoredById: user.id,
          visibleToMember: true,
        },
        select: { id: true },
      });
      if (input.publishNow) await publishPlanTx(tx, plan.id, content);
    });
    if (input.publishNow) {
      await pushToMember(m.id, {
        title: "Tu nutricionista publicó tu plan",
        body: "Ábrelo en la app para ver tus comidas de hoy.",
        url: "/portal/nutricion",
      }).catch(() => undefined);
    }
  }
  revalidatePlans();
  for (const m of members) revalidatePath(`/dashboard/socios/${m.id}`);
  return { created: members.length, scaled };
}

// ── Editor data ──────────────────────────────────────────────────────

export async function getTemplateForEdit(id: string) {
  await requireNutrition();
  const t = await prisma.mealPlanTemplate.findUnique({ where: { id } });
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    calorieLevel: t.calorieLevel,
    notes: t.notes,
    content: parsePlanContent(t.content) ?? emptyPlanContent("MENU", defaultTargets(t.calorieLevel)),
  };
}

export async function getMemberPlanForEdit(id: string) {
  await requireNutrition();
  const p = await prisma.mealPlan.findUnique({
    where: { id },
    include: {
      member: { select: { id: true, firstName: true, lastName: true, nutritionTarget: true } },
      template: { select: { id: true, name: true } },
    },
  });
  if (!p) return null;
  const published = parsePlanContent(p.content);
  const draft = parsePlanContent(p.draftContent) ?? published;
  const t = p.member.nutritionTarget;
  return {
    id: p.id,
    title: p.title,
    active: p.active,
    publishedAt: p.publishedAt,
    externalUrl: p.externalUrl,
    template: p.template,
    member: { id: p.member.id, name: `${p.member.firstName} ${p.member.lastName}`.trim() },
    memberTarget: t ? { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG } : null,
    content: draft ?? emptyPlanContent("MENU", t ? { kcal: t.kcal, proteinG: t.proteinG, carbsG: t.carbsG, fatG: t.fatG } : defaultTargets(1800)),
    publishedContent: published,
  };
}

/** Staff recipe picker for the plan editor: published + staff recipes. */
export async function searchRecipesForPlan(q: string) {
  await requireNutrition();
  const query = q.trim();
  if (query.length < 2) return [];
  return prisma.recipe.findMany({
    where: {
      active: true,
      title: { contains: query, mode: "insensitive" },
      OR: [{ status: "PUBLISHED" }, { authorMemberId: null }],
    },
    orderBy: { title: "asc" },
    take: 10,
    select: { id: true, title: true, status: true, servings: true, kcal: true, proteinG: true, carbsG: true, fatG: true },
  });
}
