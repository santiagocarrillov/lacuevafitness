// ¿Está al día este socio? Una sola regla para Reportes y para el filtro de Socios.
//
// Antes "al día" pedía el plan pagado al 100 %: un anual de $40/mes con tarjeta
// que paga cada mes salía como deudor hasta el mes 12, y los pagos registrados
// sin vincular a la membresía no contaban. Ahora (21 oct 2026, pedido de Santiago):
//
//  - Se compara lo pagado contra las CUOTAS vencidas a hoy: precio ÷ meses del
//    plan × meses transcurridos desde el inicio (la primera vence al empezar). Un
//    plan pagado por adelantado cubre todas sus cuotas, así que también sale al día.
//  - Cuentan los pagos del socio sin membresía asignada, desde ~el inicio del
//    periodo vigente.
//  - Confirmados (SUCCEEDED) → al día. Si solo alcanza sumando los PENDING
//    (transferencias/TC sin verificar) → por verificar.
//
// La app no guarda si un plan se paga por adelantado o en cuotas; suponer cuotas
// iguales es lo que hace que ambos casos se lean bien.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isStaffFreeTraining } from "@/lib/staff-free-training";

export type PaymentStanding = "AL_DIA" | "POR_VERIFICAR" | "ATRASADO" | "VENCIDO" | "SIN_PLAN" | "STAFF";

export const STANDING_LABEL: Record<PaymentStanding, string> = {
  AL_DIA: "Al día",
  POR_VERIFICAR: "Pendiente de verificar",
  ATRASADO: "Atrasado",
  VENCIDO: "Vencido",
  SIN_PLAN: "Sin plan",
  STAFF: "Staff (entrena gratis)",
};

/** Días después de que vence una cuota antes de contarla como atrasada. */
export const CUOTA_GRACE_DAYS = 5;
/** Un pago suelto cuenta para el periodo si llegó hasta estos días antes de empezar. */
const LOOSE_PAYMENT_LEAD_DAYS = 5;
/** Redondeos y descuentos de centavos no vuelven deudor a nadie. */
const TOLERANCE_CENTS = 100;
const DAY_MS = 86_400_000;
const MONTH_DAYS = 30.44;

type Pay = { amountCents: number; status: string; paidAt: Date | null; createdAt: Date };
type StandingMember = {
  id: string;
  firstName: string;
  lastName: string;
  memberships: {
    state: string;
    startsAt: Date;
    endsAt: Date;
    customPriceCents: number | null;
    plan: { priceCents: number; durationDays: number };
    payments: Pay[];
  }[];
  payments: Pay[]; // sin membresía asignada
};

export type StandingDetail = {
  standing: PaymentStanding;
  /** Cuotas que ya debían estar pagadas, en centavos (solo con plan vigente). */
  dueCents?: number;
  paidCents?: number;
  pendingCents?: number;
};

export function computeStanding(m: StandingMember, now = new Date()): StandingDetail {
  if (isStaffFreeTraining(m.firstName, m.lastName)) return { standing: "STAFF" };
  if (m.memberships.length === 0) return { standing: "SIN_PLAN" };

  const live = m.memberships.filter((ms) => ms.endsAt >= now);
  // El periodo en curso; si solo hay uno por empezar (renovación adelantada), ese.
  const cur =
    live.filter((ms) => ms.startsAt <= now).sort((a, b) => +b.startsAt - +a.startsAt)[0] ??
    live.sort((a, b) => +a.startsAt - +b.startsAt)[0];
  if (!cur) return { standing: "VENCIDO" };

  const price = cur.customPriceCents ?? cur.plan.priceCents;
  const months = Math.max(1, Math.round(cur.plan.durationDays / 30));
  const elapsedDays = Math.max(0, (+now - +cur.startsAt) / DAY_MS - CUOTA_GRACE_DAYS);
  const cuotas = Math.min(months, Math.floor(elapsedDays / MONTH_DAYS) + 1);
  const dueCents = Math.round((price / months) * cuotas);

  const since = +cur.startsAt - LOOSE_PAYMENT_LEAD_DAYS * DAY_MS;
  const loose = m.payments.filter((p) => +(p.paidAt ?? p.createdAt) >= since);
  const pays = [...cur.payments, ...loose];
  const sum = (status: string) => pays.filter((p) => p.status === status).reduce((s, p) => s + p.amountCents, 0);
  const paidCents = sum("SUCCEEDED");
  const pendingCents = sum("PENDING");

  const standing: PaymentStanding =
    paidCents >= dueCents - TOLERANCE_CENTS
      ? "AL_DIA"
      : paidCents + pendingCents >= dueCents - TOLERANCE_CENTS
        ? "POR_VERIFICAR"
        : "ATRASADO";
  return { standing, dueCents, paidCents, pendingCents };
}

const PAY_SELECT = { amountCents: true, status: true, paidAt: true, createdAt: true } as const;
const COUNTED = { in: ["SUCCEEDED" as const, "PENDING" as const] };

/** Estado de pago de cada socio que cumpla `where` (sin paginar: son cientos, no miles). */
export async function getPaymentStandings(where: Prisma.MemberWhereInput, now = new Date()) {
  const members = await prisma.member.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      memberships: {
        // Los pases diarios se cobran aparte: nunca son "el plan".
        where: { plan: { billingCycle: { not: "ONE_TIME" } }, state: { in: ["ACTIVE", "PENDING_PAYMENT"] } },
        orderBy: { endsAt: "desc" },
        take: 3,
        select: {
          state: true,
          startsAt: true,
          endsAt: true,
          customPriceCents: true,
          plan: { select: { priceCents: true, durationDays: true } },
          payments: { where: { status: COUNTED }, select: PAY_SELECT },
        },
      },
      payments: { where: { membershipId: null, isPoolEntry: false, status: COUNTED }, select: PAY_SELECT },
    },
  });
  // Quien tuvo planes pero todos cancelados/expirados también está "vencido", no "sin plan".
  const everHad = new Set(
    (
      await prisma.membership.findMany({
        where: { memberId: { in: members.filter((m) => m.memberships.length === 0).map((m) => m.id) }, plan: { billingCycle: { not: "ONE_TIME" } } },
        select: { memberId: true },
        distinct: ["memberId"],
      })
    ).map((r) => r.memberId),
  );
  return new Map(
    members.map((m) => {
      const d = computeStanding(m, now);
      if (d.standing === "SIN_PLAN" && everHad.has(m.id)) return [m.id, { standing: "VENCIDO" as const }];
      return [m.id, d];
    }),
  );
}
