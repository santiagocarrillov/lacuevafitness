"use server";

// WhatsApp › Avisos: switches and preview of the automatic notices (OWNER),
// and the manual "faltan tus tests" notice (whoever evaluates).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can, getSedeScope } from "@/lib/auth";
import { fetchMetaTemplates } from "@/lib/whatsapp/graph";
import { NOTICE_KINDS, planNotices, runNotices, sendNotice, type NoticeKind } from "@/lib/whatsapp/member-notices";
import { renderTemplate, templateName } from "@/lib/whatsapp/templates";
import { blockOf } from "@/lib/srxfit/group-stats";

const PAGE = "/dashboard/comunicacion/avisos";

async function requireOwner() {
  const user = await requireAuth();
  if (user.role !== "OWNER") throw new Error("Solo el dueño maneja los avisos automáticos.");
  return user;
}

const isKind = (k: string): k is NoticeKind => NOTICE_KINDS.some((x) => x.kind === k);

export async function getNoticesOverview() {
  await requireOwner();
  const [settings, meta, candidates, recent] = await Promise.all([
    prisma.memberNoticeSetting.findMany(),
    fetchMetaTemplates(),
    planNotices(),
    prisma.memberNotice.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: { member: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  return {
    kinds: NOTICE_KINDS.map((k) => ({
      ...k,
      live: settings.find((s) => s.kind === k.kind)?.live ?? false,
      metaStatus: meta.templates.find((t) => t.name === k.template && t.language.startsWith("es"))?.status ?? null,
      today: candidates.filter((c) => c.kind === k.kind),
    })),
    metaError: meta.error,
    recent,
  };
}

export async function setNoticeLive(kind: string, live: boolean) {
  const user = await requireOwner();
  if (!isKind(kind)) throw new Error("Aviso desconocido.");
  await prisma.memberNoticeSetting.upsert({
    where: { kind },
    create: { kind, live, updatedById: user.id },
    update: { live, updatedById: user.id },
  });
  revalidatePath(PAGE);
}

/** Sends today's list of one kind now (same rules as the 10:00 run). */
export async function runNoticeKindNow(kind: string) {
  const user = await requireOwner();
  if (!isKind(kind)) throw new Error("Aviso desconocido.");
  const r = await runNotices({ onlyKind: kind, userId: user.id });
  revalidatePath(PAGE);
  return r.byKind[kind];
}

/**
 * "Faltan tus tests SRXFIT": only after the sede tried to evaluate the socio
 * and couldn't — so it's sent by hand from SRXFIT › Evaluaciones.
 */
export async function sendTestsNotice(memberId: string) {
  const user = await requireAuth();
  if (!can.editTests(user) && !can.manageMembers(user)) throw new Error("Sin permisos");
  const m = await prisma.member.findUnique({ where: { id: memberId }, select: { id: true, firstName: true, lastName: true, sede: true, phone: true } });
  if (!m) throw new Error("Socio no encontrado.");
  const scope = getSedeScope(user);
  if (scope && m.sede !== scope) throw new Error("Ese socio es de otra sede.");
  const meta = await fetchMetaTemplates();
  if (!meta.templates.some((t) => t.name === "socio_tests_pendientes" && t.status === "APPROVED")) {
    throw new Error("Meta todavía no aprueba la plantilla «Faltan tus tests SRXFIT».");
  }
  const variables = [templateName(m.firstName, m.lastName)];
  const r = await sendNotice(
    {
      kind: "TESTS", key: `TESTS:${m.id}:${blockOf(new Date())}`, memberId: m.id, name: `${m.firstName} ${m.lastName}`, sede: m.sede, phone: m.phone, variables,
      preview: renderTemplate({ name: "socio_tests_pendientes", language: "es", variables }),
    },
    user.id,
  );
  if (r.status === "SKIPPED") throw new Error(r.detail === "Ya enviado" ? "Ya se le mandó este mensaje en este bloque." : r.detail ?? "No se envió.");
  if (r.status === "FAILED") throw new Error(`No se pudo enviar: ${r.detail}`);
  revalidatePath("/dashboard/srxfit/evaluaciones");
}
