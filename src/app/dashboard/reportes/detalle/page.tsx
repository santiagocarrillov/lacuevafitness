import { redirect, notFound } from "next/navigation";
import { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, can } from "@/lib/auth";
import {
  getRevenueDetail, getLeadsDetail, getSalesDetail,
  getActiveMembersDetail, getExpiredMembershipsDetail, getUpcomingRenewalsDetail,
  getChurnsDetail, getRenewalsDetail, getAttendanceDetail, getDiscrepanciesDetail,
} from "@/lib/actions/reports";
import { DetailView, type Column, type Row } from "./detail-view";

export const dynamic = "force-dynamic";

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram", FACEBOOK: "Facebook", WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada", WEB_FORM: "Web", WALK_IN: "Visita directa",
  REFERRAL: "Referido", TIKTOK: "TikTok", OTHER: "Otro",
};
const stageLabels: Record<string, string> = {
  NEW: "Nuevo", CONTACTED: "Contactado", SCHEDULED_TRIAL: "C.P. agendada",
  TRIAL_ATTENDED: "C.P. asistió", TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando", CONVERTED: "Convertido", LOST: "Perdido",
};
const methodLabels: Record<string, string> = {
  CASH: "Efectivo", BANK_TRANSFER: "Transferencia",
  STRIPE_CARD: "TC Stripe", STRIPE_LINK: "Stripe Link", OTHER: "Otro",
};
const stateLabels: Record<string, string> = {
  ACTIVE: "Activa", PENDING_PAYMENT: "Pendiente pago",
  EXPIRED: "Vencida", CANCELED: "Cancelada",
};
const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center", XTREME: "Xtreme",
};

const TITLES: Record<string, string> = {
  revenue: "Facturación",
  sales: "Ventas — Membresías creadas",
  renovaciones: "Renovaciones del periodo",
  activos: "Socios activos",
  vencidas: "Membresías vencidas",
  por_vencer: "Renovaciones próximas (7 días)",
  bajas: "Bajas del periodo",
  asistencia: "Asistencias",
  discrepancias: "Discrepancias (admin vs coach)",
  leads: "Visitantes / Leads",
  agendados: "Leads agendados (C.P.)",
  evaluaciones: "Asistencia a invitación",
  convertidos: "Convertidos",
};

function dateLabel(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`;
}

export default async function DetalleReportePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string; sede?: string }>;
}) {
  const user = await requireAuth();
  if (!can.viewReports(user)) redirect("/dashboard?forbidden=1");
  const scopedSede = getSedeScope(user);

  const p = await searchParams;
  const type = p.type ?? "";
  const sede = (scopedSede ?? (p.sede as Sede | undefined)) || undefined;

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = p.from ?? firstDay.toISOString().slice(0, 10);
  const to = p.to ?? now.toISOString().slice(0, 10);

  const title = TITLES[type] ?? type;
  if (!TITLES[type]) return notFound();

  const subtitle = `${dateLabel(from)} → ${dateLabel(to)}${sede ? ` · ${sedeLabels[sede]}` : " · Ambas sedes"}`;
  const backParams = new URLSearchParams({
    tab: "gestion",
    sede: sede ?? "",
    from,
    to,
  });
  const backHref = `/dashboard/reportes?${backParams.toString()}`;
  const fileName = `${type}-${from}-a-${to}${sede ? `-${sede.toLowerCase()}` : ""}`;

  // ── Fetch data per type ──────────────────────────────────────────
  let columns: Column[] = [];
  let rows: Row[] = [];
  let summary = "";

  if (type === "revenue") {
    const payments = await getRevenueDetail(sede, from, to);
    columns = [
      { key: "paidAt", label: "Fecha", format: "date" },
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "planName", label: "Plan", filterable: true },
      { key: "method", label: "Método", filterable: true },
      { key: "amount", label: "Monto", format: "money", align: "right" },
    ];
    rows = payments.map((r) => ({
      id: r.id,
      memberId: r.member?.id,
      paidAt: r.paidAt,
      memberName: r.member ? `${r.member.firstName} ${r.member.lastName}` : "—",
      planName: r.membership?.plan?.name ?? "—",
      method: methodLabels[r.method] ?? r.method,
      amount: r.amountCents,
    }));
    const total = payments.reduce((s, p) => s + p.amountCents, 0);
    summary = `${payments.length} pagos · Total facturado: ${fmt$(total)}`;
  } else if (type === "sales" || type === "renovaciones") {
    const memberships = type === "renovaciones"
      ? await getRenewalsDetail(sede, from, to)
      : await getSalesDetail(sede, from, to);
    columns = [
      { key: "createdAt", label: "Fecha", format: "date" },
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "planName", label: "Plan", filterable: true },
      { key: "price", label: "Precio", format: "money", align: "right" },
      { key: "state", label: "Estado", format: "badge", filterable: true },
      { key: "endsAt", label: "Vence", format: "date" },
    ];
    rows = memberships.map((m) => ({
      id: m.id,
      memberId: m.member?.id,
      createdAt: m.createdAt,
      memberName: m.member ? `${m.member.firstName} ${m.member.lastName}` : "—",
      planName: m.plan?.name ?? "—",
      price: m.customPriceCents ?? m.plan.priceCents,
      state: stateLabels[m.state] ?? m.state,
      endsAt: m.endsAt,
    }));
    const total = memberships.reduce((s, m) => s + (m.customPriceCents ?? m.plan.priceCents), 0);
    summary = `${memberships.length} ${type === "renovaciones" ? "renovaciones" : "ventas"} · Total facturado: ${fmt$(total)}`;
  } else if (type === "activos") {
    const members = await getActiveMembersDetail(sede);
    columns = [
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "planName", label: "Plan actual", filterable: true },
      { key: "status", label: "Estado", format: "badge", filterable: true },
      { key: "endsAt", label: "Vence", format: "date" },
      { key: "sedeLabel", label: "Sede", filterable: true },
    ];
    rows = members.map((m) => ({
      id: m.id,
      memberId: m.id,
      memberName: `${m.firstName} ${m.lastName}`,
      planName: m.memberships[0]?.plan?.name ?? "—",
      status: m.status,
      endsAt: m.memberships[0]?.endsAt ?? null,
      sedeLabel: sedeLabels[m.sede] ?? m.sede,
    }));
    summary = `${members.length} socios activos`;
  } else if (type === "vencidas") {
    const rowsRaw = await getExpiredMembershipsDetail(sede);
    columns = [
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "planName", label: "Plan", filterable: true },
      { key: "endsAt", label: "Venció", format: "date" },
      { key: "daysOverdue", label: "Días vencido", align: "right" },
    ];
    rows = rowsRaw.map((m) => {
      const days = Math.floor((Date.now() - new Date(m.endsAt).getTime()) / 86400000);
      return {
        id: m.id,
        memberId: m.member.id,
        memberName: `${m.member.firstName} ${m.member.lastName}`,
        planName: m.plan.name,
        endsAt: m.endsAt,
        daysOverdue: `${days}d`,
      };
    });
    summary = `${rowsRaw.length} membresías activas con fecha vencida`;
  } else if (type === "por_vencer") {
    const rowsRaw = await getUpcomingRenewalsDetail(sede, 7);
    columns = [
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "planName", label: "Plan", filterable: true },
      { key: "endsAt", label: "Vence", format: "date" },
      { key: "daysLeft", label: "En", align: "right" },
    ];
    rows = rowsRaw.map((m) => {
      const days = Math.ceil((new Date(m.endsAt).getTime() - Date.now()) / 86400000);
      return {
        id: m.id,
        memberId: m.member.id,
        memberName: `${m.member.firstName} ${m.member.lastName}`,
        planName: m.plan.name,
        endsAt: m.endsAt,
        daysLeft: `${days}d`,
      };
    });
    summary = `${rowsRaw.length} membresías vencen en los próximos 7 días`;
  } else if (type === "bajas") {
    const churned = await getChurnsDetail(sede, from, to);
    columns = [
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "churnedAt", label: "Baja", format: "date" },
      { key: "churnReason", label: "Motivo" },
      { key: "sedeLabel", label: "Sede", filterable: true },
    ];
    rows = churned.map((m) => ({
      id: m.id,
      memberId: m.id,
      memberName: `${m.firstName} ${m.lastName}`,
      churnedAt: m.churnedAt,
      churnReason: m.churnReason ?? "—",
      sedeLabel: sedeLabels[m.sede] ?? m.sede,
    }));
    summary = `${churned.length} bajas`;
  } else if (type === "asistencia") {
    const att = await getAttendanceDetail(sede, from, to);
    columns = [
      { key: "date", label: "Fecha", format: "date" },
      { key: "memberName", label: "Socio", format: "memberLink" },
      { key: "scheduleName", label: "Clase", filterable: true },
      { key: "startTime", label: "Hora", filterable: true },
    ];
    rows = att.map((a) => ({
      id: a.id,
      memberId: a.member.id,
      date: a.classSession.date,
      memberName: `${a.member.firstName} ${a.member.lastName}`,
      scheduleName: a.classSession.schedule?.name ?? "—",
      startTime: a.classSession.schedule?.startTime ?? "—",
    }));
    summary = `${att.length} asistencias (máx 500 mostradas)`;
  } else if (type === "discrepancias") {
    const disc = await getDiscrepanciesDetail(sede, from, to);
    columns = [
      { key: "date", label: "Fecha", format: "date" },
      { key: "scheduleName", label: "Clase" },
      { key: "startTime", label: "Hora" },
      { key: "adminCount", label: "Admin", align: "right" },
      { key: "coachCount", label: "Coach", align: "right" },
      { key: "delta", label: "Δ", align: "right" },
    ];
    rows = disc.map((c) => ({
      id: c.id,
      date: c.date,
      scheduleName: c.schedule?.name ?? "—",
      startTime: c.schedule?.startTime ?? "—",
      adminCount: c.adminCount ?? 0,
      coachCount: c.coachCount ?? 0,
      delta:
        c.adminCount != null && c.coachCount != null
          ? c.adminCount - c.coachCount
          : "—",
    }));
    summary = `${disc.length} clases con discrepancia`;
  } else if (type === "leads" || type === "agendados" || type === "evaluaciones" || type === "convertidos") {
    const stages =
      type === "leads" ? undefined
      : type === "agendados" ? ["SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED"]
      : type === "evaluaciones" ? ["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"]
      : ["CONVERTED"];
    const leads = await getLeadsDetail(sede, from, to, stages);
    columns = [
      { key: "createdAt", label: "Fecha", format: "date" },
      { key: "name", label: "Nombre" },
      { key: "source", label: "Fuente", filterable: true },
      { key: "stage", label: "Etapa", format: "badge", filterable: true },
    ];
    rows = leads.map((l) => ({
      id: l.id,
      createdAt: l.createdAt,
      name: `${l.firstName} ${l.lastName ?? ""}`.trim(),
      source: sourceLabels[l.source] ?? l.source,
      stage: stageLabels[l.stage] ?? l.stage,
    }));
    summary = `${leads.length} registros`;
  }

  return (
    <DetailView
      title={title}
      subtitle={subtitle + (summary ? ` · ${summary}` : "")}
      columns={columns}
      rows={rows}
      backHref={backHref}
      fileName={fileName}
      sedeScoped={!!scopedSede}
      currentSede={sede ?? ""}
      currentFrom={from}
      currentTo={to}
    />
  );
}
