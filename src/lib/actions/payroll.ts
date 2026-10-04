"use server";

// Trabajadores y nómina (módulo 4, 4 oct 2026). Private: only OWNER and
// ACCOUNTING see salaries. A rol is a draft until approved; approval freezes
// its numbers and posts it (PAYROLL entries, lib/accounting/posting.ts).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, can } from "@/lib/auth";
import { assertOpen } from "@/lib/accounting/posting";
import { computeLine, defaultDays, type LineInputs } from "@/lib/payroll/compute";
import type { EmploymentType, ExpensePayMethod, Sede } from "@/generated/prisma/client";

const PATH = "/dashboard/finanzas/trabajadores";
const SEDES: Sede[] = ["FITNESS_CENTER", "XTREME"];

async function requirePayroll() {
  const user = await requireAuth();
  if (!can.editFinancials(user)) throw new Error("No autorizado");
  return user;
}

const day = (v: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${label}: fecha inválida.`);
  return new Date(`${v}T00:00:00.000Z`);
};
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

// ── Employees ───────────────────────────────────────────────────────────────

export type EmployeeInput = {
  id?: string;
  sede: Sede;
  firstName: string;
  lastName: string;
  idNumber?: string;
  email?: string;
  phone?: string;
  position?: string;
  employmentType: EmploymentType;
  monthlySalaryCents: number;
  weeklyHours: number;
  startDate: string;
  endDate?: string | null;
  iessAffiliated: boolean;
  monthlyDecimoTercero: boolean;
  monthlyDecimoCuarto: boolean;
  monthlyFondosReserva: boolean;
  bankName?: string;
  bankAccount?: string;
  notes?: string;
};

export async function saveEmployee(input: EmployeeInput): Promise<{ id: string }> {
  await requirePayroll();
  if (!SEDES.includes(input.sede)) throw new Error("Elige la empresa.");
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new Error("Nombre y apellido.");
  if (input.idNumber?.trim() && !/^\d{10}$/.test(input.idNumber.trim())) throw new Error("Cédula: 10 dígitos.");
  if (!Number.isInteger(input.monthlySalaryCents) || input.monthlySalaryCents < 0) throw new Error("Sueldo inválido.");
  if (!Number.isInteger(input.weeklyHours) || input.weeklyHours < 1 || input.weeklyHours > 40) throw new Error("Horas semanales: de 1 a 40.");
  const startDate = day(input.startDate, "Fecha de ingreso");
  const endDate = input.endDate ? day(input.endDate, "Fecha de salida") : null;
  if (endDate && endDate < startDate) throw new Error("La salida no puede ser antes del ingreso.");
  const opt = (v?: string) => v?.trim() || null;
  const data = {
    sede: input.sede,
    firstName,
    lastName,
    idNumber: opt(input.idNumber),
    email: opt(input.email),
    phone: opt(input.phone),
    position: opt(input.position),
    employmentType: input.employmentType,
    monthlySalaryCents: input.monthlySalaryCents,
    weeklyHours: input.weeklyHours,
    startDate,
    endDate,
    iessAffiliated: input.employmentType === "DEPENDENCIA" && input.iessAffiliated,
    monthlyDecimoTercero: input.monthlyDecimoTercero,
    monthlyDecimoCuarto: input.monthlyDecimoCuarto,
    monthlyFondosReserva: input.monthlyFondosReserva,
    bankName: opt(input.bankName),
    bankAccount: opt(input.bankAccount),
    notes: opt(input.notes),
    active: !endDate || endDate >= new Date(),
  };
  const e = input.id ? await prisma.employee.update({ where: { id: input.id }, data }) : await prisma.employee.create({ data });
  revalidatePath(PATH, "layout");
  return { id: e.id };
}

// ── Payroll runs ────────────────────────────────────────────────────────────

const termsOf = (e: {
  monthlySalaryCents: number; weeklyHours: number; startDate: Date; iessAffiliated: boolean;
  monthlyDecimoTercero: boolean; monthlyDecimoCuarto: boolean; monthlyFondosReserva: boolean;
}) => ({ ...e, startDate: ymd(e.startDate)! });

/** Creates the month's draft rol with every worker on payroll that month. */
export async function createPayrollRun(sede: Sede, period: string): Promise<{ id: string }> {
  await requirePayroll();
  if (!SEDES.includes(sede)) throw new Error("Elige la empresa.");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Mes inválido.");
  const existing = await prisma.payrollRun.findUnique({ where: { sede_period: { sede, period } } });
  if (existing && existing.status !== "VOIDED") return { id: existing.id };
  const [y, m] = period.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  await assertOpen(prisma, sede, last);
  const employees = await prisma.employee.findMany({
    where: { sede, employmentType: "DEPENDENCIA", startDate: { lte: last }, OR: [{ endDate: null }, { endDate: { gte: first } }] },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const run = await prisma.$transaction(async (tx) => {
    const r = existing
      ? await tx.payrollRun.update({ where: { id: existing.id }, data: { status: "DRAFT", voidReason: null, approvedAt: null, paidAt: null, paidMethod: null } })
      : await tx.payrollRun.create({ data: { sede, period } });
    await tx.payrollLine.deleteMany({ where: { runId: r.id } });
    for (const e of employees) {
      const inputs: LineInputs = {
        daysWorked: defaultDays(ymd(e.startDate)!, ymd(e.endDate), period),
        overtime50Hours: 0, overtime100Hours: 0, bonusCents: 0, otherDeductionsCents: 0, incomeTaxCents: null,
      };
      const c = computeLine(termsOf(e), inputs, period);
      await tx.payrollLine.create({ data: { runId: r.id, employeeId: e.id, ...inputs, ...pickResult(c) } });
    }
    return r;
  });
  revalidatePath(PATH, "layout");
  return { id: run.id };
}

function pickResult(c: ReturnType<typeof computeLine>) {
  return {
    incomeTaxCents: c.incomeTaxCents,
    baseCents: c.baseCents,
    overtimeCents: c.overtimeCents,
    grossCents: c.grossCents,
    iessPersonalCents: c.iessPersonalCents,
    iessEmployerCents: c.iessEmployerCents,
    fondosReservaCents: c.fondosReservaCents,
    decimoTerceroCents: c.decimoTerceroCents,
    decimoCuartoCents: c.decimoCuartoCents,
    vacationCents: c.vacationCents,
    netCents: c.netCents,
  };
}

export type LineEdit = {
  daysWorked: number;
  overtime50Hours: number;
  overtime100Hours: number;
  bonusCents: number;
  otherDeductionsCents: number;
  /** null = suggested withholding. */
  incomeTaxCents: number | null;
};

/** Saves the inputs of every line of a draft rol and recomputes it. */
export async function savePayrollDraft(runId: string, edits: Record<string, LineEdit>) {
  await requirePayroll();
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { employee: true } } } });
  if (run.status !== "DRAFT") throw new Error("El rol ya está aprobado: reábrelo para cambiarlo.");
  await prisma.$transaction(async (tx) => {
    for (const l of run.lines) {
      const e = edits[l.id];
      if (!e) continue;
      const ints = [e.daysWorked, e.overtime50Hours, e.overtime100Hours, e.bonusCents, e.otherDeductionsCents];
      if (ints.some((v) => !Number.isInteger(v) || v < 0)) throw new Error(`Valores inválidos para ${l.employee.firstName}.`);
      if (e.daysWorked > 30) throw new Error("Días trabajados: máximo 30.");
      if (e.overtime50Hours + e.overtime100Hours > 120) throw new Error("Demasiadas horas extra en un mes.");
      const inputs: LineInputs = { ...e };
      const c = computeLine(termsOf(l.employee), inputs, run.period);
      if (c.netCents < 0) throw new Error(`Los descuentos de ${l.employee.firstName} superan lo que gana.`);
      await tx.payrollLine.update({
        where: { id: l.id },
        data: {
          daysWorked: e.daysWorked,
          overtime50Hours: e.overtime50Hours,
          overtime100Hours: e.overtime100Hours,
          bonusCents: e.bonusCents,
          otherDeductionsCents: e.otherDeductionsCents,
          ...pickResult(c),
        },
      });
    }
  });
  revalidatePath(PATH, "layout");
}

/** Freezes the rol and posts it to the journal (last day of its month). */
export async function approvePayrollRun(runId: string) {
  const user = await requirePayroll();
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: true } });
  if (run.status !== "DRAFT") throw new Error("Solo se aprueba un borrador.");
  if (run.lines.length === 0) throw new Error("El rol no tiene trabajadores.");
  if (run.lines.some((l) => l.netCents < 0)) throw new Error("Hay un neto negativo: revisa los descuentos.");
  const [y, m] = run.period.split("-").map(Number);
  await assertOpen(prisma, run.sede, new Date(Date.UTC(y, m, 0)));
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id } });
  revalidatePath(PATH, "layout");
  revalidatePath("/dashboard/contabilidad");
}

/** Back to draft (only while unpaid and the month is open). */
export async function reopenPayrollRun(runId: string) {
  await requirePayroll();
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "APPROVED") throw new Error("Solo se reabre un rol aprobado y sin pagar.");
  if (await prisma.payrollLine.count({ where: { runId, bankTransactionId: { not: null } } })) {
    throw new Error("Ya hay sueldos de este rol conciliados con el banco: deshaz esa conciliación en Caja y Bancos primero.");
  }
  const [y, m] = run.period.split("-").map(Number);
  await assertOpen(prisma, run.sede, new Date(Date.UTC(y, m, 0)));
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
  revalidatePath(PATH, "layout");
}

export async function markPayrollPaid(runId: string, paidAt: string, method: ExpensePayMethod) {
  await requirePayroll();
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "APPROVED") throw new Error("Aprueba el rol antes de registrar el pago.");
  const date = day(paidAt, "Fecha de pago");
  await assertOpen(prisma, run.sede, date);
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "PAID", paidAt: date, paidMethod: method } });
  revalidatePath(PATH, "layout");
}

/** Voids a draft (never deletes): the month can be generated again. */
export async function voidPayrollRun(runId: string, reason: string) {
  await requirePayroll();
  if (!reason.trim()) throw new Error("Escribe el motivo.");
  const run = await prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "DRAFT") throw new Error("Primero reabre el rol (solo se anula un borrador).");
  await prisma.payrollRun.update({ where: { id: runId }, data: { status: "VOIDED", voidReason: reason.trim() } });
  revalidatePath(PATH, "layout");
}
