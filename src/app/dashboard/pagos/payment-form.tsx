"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ecuadorDateString } from "@/lib/timezone";
import { assignPoolEntryToMembership, findMatchingPoolEntries, registerMemberPayment } from "@/lib/actions/payments";
import type { PaymentMethod, Sede } from "@/generated/prisma/enums";

type MemberOpt = { id: string; firstName: string; lastName: string; sede: Sede };
type MembershipOpt = {
  id: string;
  plan: { name: string; priceCents: number };
  endsAt: string;
  customPriceCents: number | null;
  paidCents: number;
};
type Match = {
  id: string;
  amountCents: number;
  paidAt: Date | string | null;
  depositorName: string | null;
  bankReference: string | null;
  bankEntity: string | null;
};

const METHODS: { value: PaymentMethod; label: string; badge: string }[] = [
  { value: "CASH", label: "Efectivo", badge: "💵" },
  { value: "BANK_TRANSFER", label: "Transferencia", badge: "🏦" },
  { value: "STRIPE_CARD", label: "Tarjeta (datáfono)", badge: "💳" },
  { value: "PLUX_CARD", label: "TC Plux", badge: "💳" },
  { value: "STRIPE_LINK", label: "Link de pago", badge: "🔗" },
  { value: "OTHER", label: "Otro", badge: "📋" },
];
const BANKS = ["Banco Pichincha", "Produbanco", "Banco Guayaquil", "Banco Internacional", "Banco del Pacifico", "Banco Bolivariano", "Mutualista Pichincha", "Cooperativa JEP", "PayPhone", "Otro"];
const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
const fmtDate = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("es-EC") : "—");
const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

/**
 * Full-page "registrar cobro" (replaces the Pagos and member-panel popups).
 * Cash is confirmed at once; transfers and cards wait as "fondos sin depositar".
 */
export function RegisterPaymentForm({
  members,
  initialMember,
  initialMembershipId,
  canPickSede,
  defaultSede,
  backHref,
  invoiceHref,
}: {
  members: MemberOpt[];
  initialMember: MemberOpt | null;
  initialMembershipId: string | null;
  canPickSede: boolean;
  defaultSede: Sede;
  backHref: string;
  invoiceHref: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [member, setMember] = useState<MemberOpt | null>(initialMember);
  const [search, setSearch] = useState(initialMember ? `${initialMember.firstName} ${initialMember.lastName}` : "");
  const [memberships, setMemberships] = useState<MembershipOpt[]>([]);
  const [membershipId, setMembershipId] = useState(initialMembershipId ?? "");
  const [matches, setMatches] = useState<Match[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(ecuadorDateString());
  const [depositor, setDepositor] = useState("");
  const [reference, setReference] = useState("");
  const [bank, setBank] = useState("Banco Pichincha");
  const [sede, setSede] = useState<Sede>(initialMember?.sede ?? defaultSede);
  const [notes, setNotes] = useState("");
  const isCash = method === "CASH";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || member) return [];
    return members.filter((m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(q)).slice(0, 8);
  }, [search, member, members]);

  // Memberships (with what's already paid) and bank deposits that look like this member.
  useEffect(() => {
    if (!member) return;
    let cancel = false;
    fetch(`/api/members/${member.id}/memberships`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: MembershipOpt[]) => {
        if (cancel) return;
        setMemberships(data);
        const chosen = data.find((m) => m.id === initialMembershipId) ?? data[0];
        setMembershipId((cur) => cur || chosen?.id || "");
        if (chosen && !amount) {
          const expected = chosen.customPriceCents ?? chosen.plan.priceCents;
          const left = expected - chosen.paidCents;
          setAmount(((left > 0 ? left : expected) / 100).toFixed(2));
        }
      })
      .catch(() => {});
    findMatchingPoolEntries(member.id)
      .then((m) => !cancel && setMatches(m as Match[]))
      .catch(() => {});
    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const ms = memberships.find((m) => m.id === membershipId) ?? null;
  const expected = ms ? ms.customPriceCents ?? ms.plan.priceCents : 0;

  function pick(m: MemberOpt) {
    setMember(m);
    setSearch(`${m.firstName} ${m.lastName}`);
    setMembershipId("");
    setMemberships([]);
    setMatches([]);
    setAmount("");
    setSede(m.sede);
  }

  function assign(poolId: string) {
    if (!member || !membershipId) return toast.error("Elige la membresía a la que corresponde el depósito.");
    start(async () => {
      try {
        await assignPoolEntryToMembership(poolId, member.id, membershipId);
        toast.success("Depósito del banco asignado a la membresía.");
        router.push(backHref);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo asignar.");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return toast.error("Elige al socio.");
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) return toast.error("Monto inválido.");
    start(async () => {
      try {
        await registerMemberPayment({
          memberId: member.id,
          membershipId: membershipId || undefined,
          amountCents: cents,
          method,
          paidAt,
          depositorName: depositor || undefined,
          bankReference: reference || undefined,
          bankEntity: isCash ? undefined : bank,
          sede,
          notes: notes || undefined,
        });
        toast.success(isCash ? "Pago en efectivo registrado." : "Registrado como fondos sin depositar: Isabel lo confirma con el banco.");
        router.push(backHref);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo registrar.");
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-1 relative">
        <Label className="text-xs">Socio</Label>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (member) setMember(null);
          }}
          placeholder="Buscar por nombre…"
          autoComplete="off"
        />
        {filtered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
            {filtered.map((m) => (
              <button key={m.id} type="button" onClick={() => pick(m)} className="w-full px-3 py-2 text-left text-sm hover:bg-accent">
                {m.firstName} {m.lastName}
              </button>
            ))}
          </div>
        )}
        {member && (
          <Link href={`/dashboard/socios/${member.id}`} className="text-xs text-primary hover:underline">
            Ver ficha de {member.firstName}
          </Link>
        )}
      </div>

      {member && (
        <div className="space-y-1">
          <Label className="text-xs">Membresía</Label>
          {memberships.length ? (
            <select className={selectCls} value={membershipId} onChange={(e) => setMembershipId(e.target.value)}>
              <option value="">— Sin vincular a una membresía —</option>
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.plan.name} · vence {new Date(m.endsAt).toLocaleDateString("es-EC")}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-muted-foreground">Sin membresías activas.</p>
          )}
          {ms && (
            <p className="text-xs text-muted-foreground">
              Precio {fmt(expected)} · pagado {fmt(ms.paidCents)}
              {expected > ms.paidCents ? ` · falta ${fmt(expected - ms.paidCents)}` : " · ✓ al día"}
            </p>
          )}
        </div>
      )}

      {matches.length > 0 && (
        <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold">💡 Depósitos del banco que parecen de este socio</p>
          <p className="text-[11px] text-muted-foreground">Si uno es este pago, asígnalo y queda conciliado: no lo vuelvas a registrar abajo.</p>
          {matches.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 rounded border bg-background px-2.5 py-1.5 text-xs">
              <span>
                <strong>{fmt(m.amountCents)}</strong> · {m.depositorName} · {fmtDate(m.paidAt)}
                {m.bankEntity && ` · ${m.bankEntity}`}
                {m.bankReference && ` · Ref ${m.bankReference}`}
              </span>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => assign(m.id)}>
                Asignar
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Cómo pagó</Label>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMethod(m.value)}
              className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm transition ${method === m.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
            >
              <span>{m.badge}</span>
              {m.label}
            </button>
          ))}
        </div>
        {!isCash && <p className="text-xs text-amber-700 dark:text-amber-300">Queda como fondos sin depositar hasta que Isabel lo vea en el banco.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Monto ($)</Label>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" required />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fecha</Label>
          <Input type="date" value={paidAt} max={ecuadorDateString()} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        {!isCash && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Depositante / titular de la tarjeta</Label>
              <Input value={depositor} onChange={(e) => setDepositor(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Referencia</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Banco</Label>
              <select className={selectCls} value={bank} onChange={(e) => setBank(e.target.value)}>
                {BANKS.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {canPickSede && (
          <div className="space-y-1">
            <Label className="text-xs">Sede</Label>
            <select className={selectCls} value={sede} onChange={(e) => setSede(e.target.value as Sede)}>
              <option value="FITNESS_CENTER">Fitness Center</option>
              <option value="XTREME">Xtreme</option>
            </select>
          </div>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Notas</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: renovación octubre, descuento…" />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        {invoiceHref ? (
          <Link href={`${invoiceHref}${member ? `?socio=${member.id}` : ""}`} className="text-sm text-primary hover:underline">
            ¿Cobrar y facturar a la vez? →
          </Link>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || !member}>
            {pending ? "Guardando…" : isCash ? "Registrar efectivo" : "Registrar fondos sin depositar"}
          </Button>
        </div>
      </div>
    </form>
  );
}
