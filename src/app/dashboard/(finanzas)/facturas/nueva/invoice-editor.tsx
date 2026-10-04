"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createInvoice, type InvoiceLineDraft } from "@/lib/actions/invoicing";
import { ENTITIES, ENTITY_ORDER } from "@/lib/finance/entities";
import {
  CONSUMER_FINAL_MAX_CENTS,
  INCOME_ACCOUNTS,
  PAY_FORM_LABELS,
  TAX_ID_LABELS,
  defaultPayForm,
  fmtUsd,
  formatDocNumber,
  guessTaxIdType,
  invoiceTotals,
  lineAmounts,
  taxIdError,
} from "@/lib/invoicing/core";
import type { PaymentMethod, Sede, SriEnvironment, TaxIdType } from "@/generated/prisma/enums";

type MemberOpt = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  sede: Sede;
  taxIdType: TaxIdType | null;
  taxId: string | null;
};
type SaleItemOpt = { id: string; sede: Sede | null; name: string; priceCents: number; ivaRate: number; incomeAccountCode: string };
type PointOpt = { id: string; sede: Sede; establishment: string; point: string; address: string; lastSequential: number; environment: SriEnvironment };
type MembershipOpt = {
  id: string;
  plan: { name: string; priceCents: number; billingCycle: string };
  startsAt: string;
  endsAt: string;
  state: string;
  customPriceCents: number | null;
};
export type EditorPayment = {
  id: string;
  sede: Sede;
  memberId: string | null;
  membershipId: string | null;
  amountCents: number;
  method: PaymentMethod;
  paidAt: string;
  bankReference: string | null;
  depositorName: string | null;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
};

type Line = {
  key: number;
  membershipId: string | null;
  saleItemId: string | null;
  code: string;
  description: string;
  quantity: string;
  price: string; // dollars, with IVA
  discount: string;
  ivaRate: number;
  incomeAccountCode: string;
};

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Efectivo" },
  { value: "BANK_TRANSFER", label: "Transferencia" },
  { value: "STRIPE_CARD", label: "Tarjeta (datáfono)" },
  { value: "PLUX_CARD", label: "TC Plux" },
  { value: "STRIPE_LINK", label: "Link de pago" },
  { value: "OTHER", label: "Otro" },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.value, m.label])) as Record<PaymentMethod, string>;
const BANKS = ["Banco Pichincha", "Produbanco", "Banco del Pacifico", "Banco Guayaquil", "Banco Internacional", "Banco Bolivariano", "Cooperativa JEP", "Otro"];

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";
const toCents = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};
const dollars = (c: number) => (c / 100).toFixed(2);
const monthName = (iso: string) =>
  new Date(iso).toLocaleDateString("es-EC", { month: "long", year: "numeric", timeZone: "America/Guayaquil" });

let nextKey = 1;

export function InvoiceEditor({
  members,
  saleItems,
  points,
  defaultSede,
  defaultMemberId,
  existingPayment,
  today,
  invoicedThisMonth = {},
}: {
  members: MemberOpt[];
  saleItems: SaleItemOpt[];
  points: PointOpt[];
  defaultSede: Sede;
  defaultMemberId: string | null;
  existingPayment: EditorPayment | null;
  today: string;
  /** memberId → number of the membership invoice already issued this month. */
  invoicedThisMonth?: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const initialMember = members.find((m) => m.id === defaultMemberId) ?? null;
  const [sede, setSede] = useState<Sede>(existingPayment?.sede ?? initialMember?.sede ?? defaultSede);
  const sedePoints = points.filter((p) => p.sede === sede);
  const [pointId, setPointId] = useState(sedePoints[0]?.id ?? "");
  const point = points.find((p) => p.id === pointId && p.sede === sede) ?? sedePoints[0];
  const [issueDate, setIssueDate] = useState(existingPayment?.paidAt ?? today);

  // Buyer
  const [member, setMember] = useState<MemberOpt | null>(initialMember);
  const [search, setSearch] = useState(initialMember ? `${initialMember.firstName} ${initialMember.lastName}` : "");
  const [consumerFinal, setConsumerFinal] = useState(false);
  const [idType, setIdType] = useState<TaxIdType>(initialMember?.taxIdType ?? "CEDULA");
  const startsThirdParty = !!existingPayment?.depositorName && !!initialMember && !existingPayment.depositorName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(initialMember.firstName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  const [taxId, setTaxId] = useState(startsThirdParty ? "" : initialMember?.taxId ?? "");
  const [buyerName, setBuyerName] = useState(
    startsThirdParty ? existingPayment!.depositorName! : initialMember ? `${initialMember.firstName} ${initialMember.lastName}` : "",
  );
  const [email, setEmail] = useState(startsThirdParty ? "" : initialMember?.email ?? "");
  const [phone, setPhone] = useState(startsThirdParty ? "" : initialMember?.phone ?? "");
  const [address, setAddress] = useState(startsThirdParty ? "" : initialMember?.address ?? "");
  const [saveToMember, setSaveToMember] = useState(true);
  // The person who pays and gets the invoice can differ from the member
  // (a parent paying for a child). Their ID never goes on the member's file.
  const [thirdParty, setThirdParty] = useState(startsThirdParty);
  const [memberships, setMemberships] = useState<MembershipOpt[]>([]);

  // Lines
  const [lines, setLines] = useState<Line[]>([]);

  // Payment
  const [method, setMethod] = useState<PaymentMethod>(existingPayment?.method ?? "CASH");
  const [payForm, setPayForm] = useState(defaultPayForm(existingPayment?.method ?? "CASH"));
  const [depositor, setDepositor] = useState("");
  const [reference, setReference] = useState("");
  const [bank, setBank] = useState("Banco Pichincha");
  const [notes, setNotes] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || (member && search === `${member.firstName} ${member.lastName}`)) return [];
    return members
      .filter((m) => `${m.firstName} ${m.lastName} ${m.taxId ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, members, member]);

  // Load the member's memberships (and, when invoicing an existing collection, prefill its line).
  useEffect(() => {
    if (!member) {
      setMemberships([]);
      return;
    }
    let cancel = false;
    fetch(`/api/members/${member.id}/memberships`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MembershipOpt[]) => {
        if (cancel) return;
        setMemberships(data);
        if (existingPayment && lines.length === 0) {
          const ms = data.find((m) => m.id === existingPayment.membershipId) ?? data[0];
          setLines([
            ms
              ? membershipLine(ms, existingPayment.amountCents)
              : freeLine("Mensualidad", existingPayment.amountCents, "4.1.01"),
          ]);
        }
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  // An existing collection without a member still gets a line to edit.
  useEffect(() => {
    if (existingPayment && !existingPayment.memberId && lines.length === 0) {
      setLines([freeLine("Mensualidad", existingPayment.amountCents, "4.1.01")]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fillBuyerFrom(m: MemberOpt | null) {
    setBuyerName(m ? `${m.firstName} ${m.lastName}` : "");
    setIdType(m?.taxIdType ?? "CEDULA");
    setTaxId(m?.taxId ?? "");
    setEmail(m?.email ?? "");
    setPhone(m?.phone ?? "");
    setAddress(m?.address ?? "");
  }

  function toggleThirdParty(on: boolean) {
    setThirdParty(on);
    fillBuyerFrom(on ? null : member);
    if (on) setSaveToMember(false);
  }

  function pickMember(m: MemberOpt) {
    setMember(m);
    setSearch(`${m.firstName} ${m.lastName}`);
    if (!thirdParty) fillBuyerFrom(m);
    setConsumerFinal(false);
    if (!existingPayment) setSede(m.sede);
    setLines((ls) => ls.filter((l) => !l.membershipId));
  }

  function clearMember() {
    setMember(null);
    setSearch("");
    setLines((ls) => ls.filter((l) => !l.membershipId));
  }

  function membershipLine(ms: MembershipOpt, amountCents?: number): Line {
    const cycle = ms.plan.billingCycle;
    const price = amountCents ?? ms.customPriceCents ?? ms.plan.priceCents;
    return {
      key: nextKey++,
      membershipId: ms.id,
      saleItemId: null,
      code: cycle === "ONE_TIME" || cycle === "TRIAL" ? "PASE" : "MEM",
      description: `${ms.plan.name} · ${monthName(issueDate + "T12:00:00")}`,
      quantity: "1",
      price: dollars(price),
      discount: "0.00",
      ivaRate: 15,
      incomeAccountCode: cycle === "ONE_TIME" || cycle === "TRIAL" ? "4.1.02" : "4.1.01",
    };
  }

  function freeLine(description = "", cents = 0, account = "4.1.01"): Line {
    return {
      key: nextKey++,
      membershipId: null,
      saleItemId: null,
      code: "VARIOS",
      description,
      quantity: "1",
      price: cents ? dollars(cents) : "",
      discount: "0.00",
      ivaRate: 15,
      incomeAccountCode: account,
    };
  }

  function itemLine(it: SaleItemOpt): Line {
    return {
      key: nextKey++,
      membershipId: null,
      saleItemId: it.id,
      code: it.name.normalize("NFD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10) || "ITEM",
      description: it.name,
      quantity: "1",
      price: dollars(it.priceCents),
      discount: "0.00",
      ivaRate: it.ivaRate,
      incomeAccountCode: it.incomeAccountCode,
    };
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Computed amounts (null when a line is incomplete).
  const computed = lines.map((l) => {
    const quantity = Number(l.quantity);
    const unitPriceCents = toCents(l.price);
    const discountCents = toCents(l.discount || "0");
    try {
      return { ok: true as const, input: { quantity, unitPriceCents, discountCents, ivaRate: l.ivaRate }, a: lineAmounts({ quantity, unitPriceCents, discountCents, ivaRate: l.ivaRate }) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Línea inválida" };
    }
  });
  const allOk = computed.length > 0 && computed.every((c) => c.ok);
  const totals = allOk ? invoiceTotals(computed.map((c) => (c.ok ? c.input : null!))) : null;
  const total = totals?.totalCents ?? 0;
  const cfAllowed = total <= CONSUMER_FINAL_MAX_CENTS;
  const idError = consumerFinal ? null : taxId ? taxIdError(idType, taxId) : null;
  const mismatch = existingPayment && totals && totals.totalCents !== existingPayment.amountCents;

  const sedeItems = saleItems.filter((s) => !s.sede || s.sede === sede);
  const entity = ENTITIES[sede];

  function submit() {
    if (!point) return toast.error("Esta entidad no tiene punto de emisión: créalo en Facturación › Configuración.");
    if (!allOk || !totals) return toast.error("Revisa las líneas de la factura.");
    if (consumerFinal && !cfAllowed) return toast.error("A consumidor final solo hasta $50.");
    if (!consumerFinal && (idError || !taxId)) return toast.error(idError ?? "Falta la cédula o el RUC.");
    const draftLines: InvoiceLineDraft[] = lines.map((l, i) => {
      const c = computed[i];
      if (!c.ok) throw new Error(c.error);
      return {
        membershipId: l.membershipId,
        saleItemId: l.saleItemId,
        code: l.code,
        description: l.description,
        quantity: c.input.quantity,
        unitPriceCents: c.input.unitPriceCents,
        discountCents: c.input.discountCents,
        ivaRate: l.ivaRate,
        incomeAccountCode: l.incomeAccountCode,
      };
    });
    start(async () => {
      try {
        const { id, emission } = await createInvoice({
          sede,
          emissionPointId: point.id,
          issueDate,
          memberId: member?.id ?? null,
          buyer: consumerFinal
            ? { type: "CONSUMIDOR_FINAL", id: "", name: "" }
            : { type: idType, id: taxId, name: buyerName, email, address, phone },
          saveToMember: !!member && !thirdParty && saveToMember,
          lines: draftLines,
          payForm,
          paymentId: existingPayment?.id ?? null,
          payment: existingPayment ? undefined : { method, depositorName: depositor, bankReference: reference, bankEntity: method === "CASH" ? "" : bank },
          notes,
        });
        if (!emission) toast.success("Factura generada (borrador: falta la firma electrónica)");
        else if (emission.status === "AUTHORIZED") toast.success("Factura autorizada por el SRI");
        else if (emission.status === "ERROR") toast.error(`Factura guardada, pero no se pudo enviar al SRI: ${"error" in emission ? emission.error : ""}`);
        else toast.message(emission.status === "REJECTED" ? "Factura guardada, el SRI la rechazó: revisa los mensajes" : "Factura enviada: el SRI aún la está autorizando");
        router.push(`/dashboard/facturas/${id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo facturar.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {point?.environment !== "PRODUCCION" && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Ambiente de <strong>pruebas</strong>: la factura no tiene validez tributaria. El cobro sí se registra.
        </p>
      )}

      {/* The invoice "paper" */}
      <div className="rounded-lg border bg-card shadow-sm">
        {/* Issuer + document box */}
        <div className="grid gap-4 border-b p-5 md:grid-cols-[1fr_320px]">
          <div className="space-y-1 text-sm">
            <select className="h-9 rounded-md border border-input bg-background px-2 text-base font-semibold" value={sede} onChange={(e) => { setSede(e.target.value as Sede); setPointId(""); }} disabled={!!existingPayment}>
              {ENTITY_ORDER.map((s) => (
                <option key={s} value={s}>{ENTITIES[s].legalName}</option>
              ))}
            </select>
            <p className="text-muted-foreground">{entity.tradeName}</p>
            <p className="text-muted-foreground">Dirección: {point?.address ?? "—"}</p>
            <p className="text-muted-foreground">Obligado a llevar contabilidad: {entity.accountingRequired ? "SÍ" : "NO"}</p>
          </div>
          <div className="space-y-2 rounded-md border p-3 text-sm">
            <p className="text-xs text-muted-foreground">R.U.C. {entity.ruc}</p>
            <p className="text-lg font-bold tracking-wide">FACTURA</p>
            {sedePoints.length > 1 ? (
              <select className={selectCls} value={point?.id ?? ""} onChange={(e) => setPointId(e.target.value)}>
                {sedePoints.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.establishment}-{p.point} · {p.environment === "PRUEBAS" ? "pruebas" : "producción"}
                  </option>
                ))}
              </select>
            ) : null}
            <p className="font-mono">
              No. {point ? formatDocNumber(point.establishment, point.point, point.lastSequential + 1) : "— sin punto de emisión —"}
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" className="h-8" value={issueDate} max={today} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            <p className="text-[11px] text-muted-foreground">La clave de acceso se genera al guardar.</p>
          </div>
        </div>

        {/* Buyer */}
        <div className="space-y-3 border-b p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Socio</h2>
            <label className={`flex items-center gap-2 text-sm ${cfAllowed ? "" : "opacity-50"}`}>
              <input type="checkbox" checked={consumerFinal} disabled={!cfAllowed && !consumerFinal} onChange={(e) => setConsumerFinal(e.target.checked)} />
              Consumidor final (hasta $50)
            </label>
          </div>

          <div className="relative">
            <Input placeholder="Buscar socio por nombre o cédula…" value={search} onChange={(e) => { setSearch(e.target.value); if (member) setMember(null); }} />
            {member && (
              <button type="button" onClick={clearMember} className="absolute right-2 top-1.5 text-xs text-muted-foreground hover:underline">
                quitar
              </button>
            )}
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md">
                {filtered.map((m) => (
                  <button key={m.id} type="button" onClick={() => pickMember(m)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                    <span>{m.firstName} {m.lastName}</span>
                    <span className="text-xs text-muted-foreground">{m.taxId ?? "sin cédula"} · {ENTITIES[m.sede].name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {member && invoicedThisMonth[member.id] && existingPayment?.status !== "SUCCEEDED" && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {member.firstName} ya tiene factura de membresía este mes ({invoicedThisMonth[member.id]}). Solo se vuelve a
              facturar con otro pago comprobado: regístralo en Pagos, confírmalo con el banco y factúralo desde ese cobro.
            </p>
          )}

          {!consumerFinal && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <h3 className="text-sm font-semibold">Facturar a</h3>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={thirdParty} onChange={(e) => toggleThirdParty(e.target.checked)} />
                Otra persona paga y recibe la factura (p. ej. mamá o papá)
              </label>
            </div>
          )}

          {consumerFinal ? (
            <div className="space-y-1 text-sm">
              <p>CONSUMIDOR FINAL · 9999999999999</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Desde 2026 una factura a consumidor final no se puede anular ni corregir con nota de crédito.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[140px_1fr_1.5fr]">
              <div className="space-y-1">
                <Label className="text-xs">Identificación</Label>
                <select className={selectCls} value={idType} onChange={(e) => setIdType(e.target.value as TaxIdType)}>
                  {(Object.keys(TAX_ID_LABELS) as TaxIdType[]).map((t) => (
                    <option key={t} value={t}>{TAX_ID_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Número</Label>
                <Input
                  className="h-8"
                  value={taxId}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setTaxId(v);
                    if (/^\d{10}$|^\d{13}$/.test(v)) setIdType(guessTaxIdType(v));
                  }}
                  aria-invalid={!!idError}
                />
                {idError && <p className="text-[11px] text-destructive">{idError}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nombre o razón social</Label>
                <Input className="h-8" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Teléfono</Label>
                <Input className="h-8" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Correo (recibe la factura)</Label>
                <Input className="h-8" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dirección</Label>
                <Input className="h-8" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              {member && !thirdParty && (member.taxId !== taxId || member.taxIdType !== idType) && taxId && !idError && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground md:col-span-3">
                  <input type="checkbox" checked={saveToMember} onChange={(e) => setSaveToMember(e.target.checked)} />
                  Guardar esta identificación en la ficha de {member.firstName}
                </label>
              )}
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="space-y-3 border-b p-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Descripción</th>
                  <th className="w-16 px-2 font-medium">Cant.</th>
                  <th className="w-24 px-2 font-medium">P. unit. (con IVA)</th>
                  <th className="w-20 px-2 font-medium">Descuento</th>
                  <th className="w-40 px-2 font-medium">Cuenta de ingreso</th>
                  <th className="w-24 px-2 text-right font-medium">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const c = computed[i];
                  return (
                    <tr key={l.key} className="border-b align-top">
                      <td className="py-2 pr-2">
                        <Input className="h-8" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="Descripción" />
                        {l.membershipId && <p className="mt-0.5 text-[11px] text-muted-foreground">Membresía del socio</p>}
                      </td>
                      <td className="px-2 py-2">
                        <Input className="h-8" inputMode="numeric" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <Input className="h-8" inputMode="decimal" value={l.price} onChange={(e) => update(l.key, { price: e.target.value })} placeholder="0.00" />
                      </td>
                      <td className="px-2 py-2">
                        <Input className="h-8" inputMode="decimal" value={l.discount} onChange={(e) => update(l.key, { discount: e.target.value })} />
                      </td>
                      <td className="px-2 py-2">
                        <select className={selectCls} value={l.incomeAccountCode} onChange={(e) => update(l.key, { incomeAccountCode: e.target.value })}>
                          {INCOME_ACCOUNTS.map((a) => (
                            <option key={a.code} value={a.code}>{a.label}</option>
                          ))}
                        </select>
                        <label className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <input type="checkbox" checked={l.ivaRate === 0} onChange={(e) => update(l.key, { ivaRate: e.target.checked ? 0 : 15 })} />
                          IVA 0 %
                        </label>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {c.ok ? fmtUsd(c.a.totalCents) : <span className="text-[11px] text-destructive">{l.price ? c.error : "—"}</span>}
                      </td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Quitar línea">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Agrega lo que se cobra: la membresía del socio, algo del catálogo o una línea libre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            {member && memberships.length > 0 && (
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value=""
                onChange={(e) => {
                  const ms = memberships.find((m) => m.id === e.target.value);
                  if (ms) setLines((ls) => [...ls, membershipLine(ms)]);
                }}
              >
                <option value="">+ Membresía de {member.firstName}…</option>
                {memberships.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.plan.name} · {fmtUsd(m.customPriceCents ?? m.plan.priceCents)}
                  </option>
                ))}
              </select>
            )}
            {sedeItems.length > 0 && (
              <select
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                value=""
                onChange={(e) => {
                  const it = sedeItems.find((s) => s.id === e.target.value);
                  if (it) setLines((ls) => [...ls, itemLine(it)]);
                }}
              >
                <option value="">+ Del catálogo…</option>
                {sedeItems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · {fmtUsd(s.priceCents)}</option>
                ))}
              </select>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, freeLine()])}>
              + Línea libre
            </Button>
          </div>
        </div>

        {/* Payment + totals */}
        <div className="grid gap-6 p-5 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Forma de pago</h2>
            {existingPayment ? (
              <p className="text-sm">
                Cobro ya registrado: <strong>{fmtUsd(existingPayment.amountCents)}</strong> · {METHOD_LABEL[existingPayment.method]} · {existingPayment.paidAt}
                {existingPayment.bankReference ? ` · ref. ${existingPayment.bankReference}` : ""}
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Cómo pagó</Label>
                  <select className={selectCls} value={method} onChange={(e) => { const m = e.target.value as PaymentMethod; setMethod(m); setPayForm(defaultPayForm(m)); }}>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                {method !== "CASH" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Banco</Label>
                      <select className={selectCls} value={bank} onChange={(e) => setBank(e.target.value)}>
                        {BANKS.map((b) => (
                          <option key={b}>{b}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Quién depositó / tarjetahabiente</Label>
                      <Input className="h-8" value={depositor} onChange={(e) => setDepositor(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">N.º de referencia</Label>
                      <Input className="h-8" value={reference} onChange={(e) => setReference(e.target.value)} />
                    </div>
                  </>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Forma de pago (SRI)</Label>
                <select className={selectCls} value={payForm} onChange={(e) => setPayForm(e.target.value)}>
                  {Object.entries(PAY_FORM_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{code} · {label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nota interna (no sale en la factura)</Label>
                <Input className="h-8" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            {!existingPayment && method !== "CASH" && (
              <p className="text-[11px] text-muted-foreground">
                El cobro queda como “fondos sin depositar” hasta que Isabel lo vea en el banco.
              </p>
            )}
          </div>

          <dl className="space-y-1.5 text-sm">
            {(totals?.byRate ?? [{ rate: 15, baseCents: 0, ivaCents: 0 }]).map((r) => (
              <div key={r.rate} className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal {r.rate} %</dt>
                <dd className="tabular-nums">{fmtUsd(r.baseCents)}</dd>
              </div>
            ))}
            {!!totals?.discountCents && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Descuento (sin IVA)</dt>
                <dd className="tabular-nums">{fmtUsd(totals.discountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA 15 %</dt>
              <dd className="tabular-nums">{fmtUsd(totals?.ivaCents ?? 0)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-lg font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{fmtUsd(total)}</dd>
            </div>
            {mismatch && (
              <p className="text-[11px] text-destructive">El total debe ser igual al cobro ({fmtUsd(existingPayment!.amountCents)}).</p>
            )}
          </dl>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={pending}>
          Cancelar
        </Button>
        <Button type="button" onClick={submit} disabled={pending || !allOk || !!mismatch || !point}>
          {pending ? "Guardando…" : existingPayment ? "Facturar este cobro" : `Cobrar ${total ? fmtUsd(total) : ""} y facturar`}
        </Button>
      </div>
    </div>
  );
}
