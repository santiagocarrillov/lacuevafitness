import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import {
  getRevenueDetail, getLeadsDetail, getSalesDetail,
  getActiveMembersDetail, getExpiredMembershipsDetail, getUpcomingRenewalsDetail,
  getChurnsDetail, getRenewalsDetail, getAttendanceDetail, getDiscrepanciesDetail,
} from "@/lib/actions/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const sourceLabels: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  PHONE_CALL: "Llamada",
  WEB_FORM: "Web",
  WALK_IN: "Visita directa",
  REFERRAL: "Referido",
  TIKTOK: "TikTok",
  OTHER: "Otro",
};

const stageLabels: Record<string, string> = {
  NEW: "Nuevo",
  CONTACTED: "Contactado",
  SCHEDULED_TRIAL: "C.P. agendada",
  TRIAL_ATTENDED: "C.P. asistió",
  TRIAL_NO_SHOW: "No asistió",
  NEGOTIATING: "Negociando",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};

const methodLabels: Record<string, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia",
  CREDIT_CARD: "T. Crédito",
  DEBIT_CARD: "T. Débito",
  OTHER: "Otro",
};

const detailTitles: Record<string, string> = {
  revenue: "Facturación",
  leads: "Visitantes / Leads",
  evaluaciones: "Asistencia a invitación",
  convertidos: "Convertidos",
  sales: "Ventas (membresías creadas)",
  activos: "Socios activos",
  vencidas: "Membresías vencidas",
  por_vencer: "Renovaciones próximas",
  bajas: "Bajas del periodo",
  renovaciones: "Renovaciones del periodo",
  agendados: "Leads agendados (C.P.)",
  asistencia: "Asistencias",
  discrepancias: "Discrepancias",
};

interface DetailPanelProps {
  detail: string;
  from: string;
  to: string;
  sede?: Sede;
  closeHref: string;
}

export async function DetailPanel({ detail, from, to, sede, closeHref }: DetailPanelProps) {
  const title = detailTitles[detail] ?? detail;
  const fromLabel = new Date(from + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
  const toLabel = new Date(to + "T00:00:00").toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">
          Detalle: {title} &mdash; {fromLabel} al {toLabel}
        </CardTitle>
        <Link
          href={closeHref}
          className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded border hover:bg-accent transition"
        >
          Cerrar ✕
        </Link>
      </CardHeader>
      <CardContent>
        {detail === "revenue" && <RevenueTable from={from} to={to} sede={sede} />}
        {detail === "leads" && <LeadsTable from={from} to={to} sede={sede} label="Leads" />}
        {detail === "evaluaciones" && (
          <LeadsTable from={from} to={to} sede={sede}
            stages={["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"]} label="Evaluaciones" />
        )}
        {detail === "convertidos" && (
          <LeadsTable from={from} to={to} sede={sede} stages={["CONVERTED"]} label="Convertidos" />
        )}
        {detail === "agendados" && (
          <LeadsTable from={from} to={to} sede={sede}
            stages={["SCHEDULED_TRIAL", "TRIAL_ATTENDED", "TRIAL_NO_SHOW", "NEGOTIATING", "CONVERTED"]}
            label="Agendados" />
        )}
        {detail === "sales" && <SalesTable from={from} to={to} sede={sede} />}
        {detail === "renovaciones" && <SalesTable from={from} to={to} sede={sede} renewalsOnly />}
        {detail === "activos" && <ActiveMembersTable sede={sede} />}
        {detail === "vencidas" && <ExpiredMembershipsTable sede={sede} />}
        {detail === "por_vencer" && <UpcomingRenewalsTable sede={sede} />}
        {detail === "bajas" && <ChurnsTable from={from} to={to} sede={sede} />}
        {detail === "asistencia" && <AttendanceTable from={from} to={to} sede={sede} />}
        {detail === "discrepancias" && <DiscrepanciesTable from={from} to={to} sede={sede} />}
      </CardContent>
    </Card>
  );
}

async function RevenueTable({ from, to, sede }: { from: string; to: string; sede?: Sede }) {
  const payments = await getRevenueDetail(sede, from, to);

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin pagos en este período.</p>;
  }

  const total = payments.reduce((s, p) => s + p.amountCents, 0) / 100;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{payments.length} pagos — Total: <strong>${total.toLocaleString("es-EC", { minimumFractionDigits: 2 })}</strong></p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Socio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-xs">
                  {p.paidAt ? new Date(p.paidAt).toLocaleDateString("es-EC") : "—"}
                </TableCell>
                <TableCell>
                  {p.member ? `${p.member.firstName} ${p.member.lastName}` : "—"}
                </TableCell>
                <TableCell className="text-xs">
                  {p.membership?.plan?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {methodLabels[p.method] ?? p.method}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${(p.amountCents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function LeadsTable({
  from,
  to,
  sede,
  stages,
  label,
}: {
  from: string;
  to: string;
  sede?: Sede;
  stages?: string[];
  label: string;
}) {
  const leads = await getLeadsDetail(sede, from, to, stages);

  if (leads.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin {label.toLowerCase()} en este período.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{leads.length} {label.toLowerCase()}</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Fuente</TableHead>
              <TableHead>Etapa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-xs">
                  {new Date(l.createdAt).toLocaleDateString("es-EC")}
                </TableCell>
                <TableCell>
                  {l.firstName} {l.lastName ?? ""}
                </TableCell>
                <TableCell className="text-xs">
                  {sourceLabels[l.source] ?? l.source}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {stageLabels[l.stage] ?? l.stage}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Sales / memberships tables ─────────────────────────────────────

function fmt$(cents: number) {
  return `$${(cents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`;
}

async function SalesTable({
  from, to, sede, renewalsOnly,
}: { from: string; to: string; sede?: Sede; renewalsOnly?: boolean }) {
  const rows = renewalsOnly
    ? await getRenewalsDetail(sede, from, to)
    : await getSalesDetail(sede, from, to);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin {renewalsOnly ? "renovaciones" : "ventas"} en este período.</p>;
  }

  const total = rows.reduce((s, r) => s + (r.customPriceCents ?? r.plan.priceCents), 0);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {rows.length} {renewalsOnly ? "renovaciones" : "ventas"} — Total facturado: <strong>{fmt$(total)}</strong>
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Socio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs">{new Date(r.createdAt).toLocaleDateString("es-EC")}</TableCell>
                <TableCell>
                  {r.member ? (
                    <Link href={`/dashboard/socios/${r.member.id}`} className="hover:underline text-primary">
                      {r.member.firstName} {r.member.lastName}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs">{r.plan?.name ?? "—"}</TableCell>
                <TableCell className="text-right font-medium">{fmt$(r.customPriceCents ?? r.plan.priceCents)}</TableCell>
                <TableCell><Badge variant="outline" className="text-xs">{r.state}</Badge></TableCell>
                <TableCell className="text-xs">{new Date(r.endsAt).toLocaleDateString("es-EC")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function ActiveMembersTable({ sede }: { sede?: Sede }) {
  const rows = await getActiveMembersDetail(sede);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin socios activos.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} socios activos (ACTIVE + TRIAL)</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Sede</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const mem = m.memberships[0];
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/dashboard/socios/${m.id}`} className="hover:underline text-primary">
                      {m.firstName} {m.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{mem?.plan?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{m.status}</Badge></TableCell>
                  <TableCell className="text-xs">{mem ? new Date(mem.endsAt).toLocaleDateString("es-EC") : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.sede === "FITNESS_CENTER" ? "Fitness" : "Xtreme"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function ExpiredMembershipsTable({ sede }: { sede?: Sede }) {
  const rows = await getExpiredMembershipsDetail(sede);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin membresías vencidas.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} membresías activas con fecha vencida</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Venció</TableHead>
              <TableHead className="text-right">Días vencido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const days = Math.floor((Date.now() - new Date(m.endsAt).getTime()) / 86400000);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/dashboard/socios/${m.member.id}`} className="hover:underline text-primary">
                      {m.member.firstName} {m.member.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{m.plan.name}</TableCell>
                  <TableCell className="text-xs">{new Date(m.endsAt).toLocaleDateString("es-EC")}</TableCell>
                  <TableCell className="text-right text-red-600 font-medium">{days}d</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function UpcomingRenewalsTable({ sede }: { sede?: Sede }) {
  const rows = await getUpcomingRenewalsDetail(sede, 7);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin renovaciones próximas en 7 días.</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} membresías vencen en los próximos 7 días</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">En</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const days = Math.ceil((new Date(m.endsAt).getTime() - Date.now()) / 86400000);
              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/dashboard/socios/${m.member.id}`} className="hover:underline text-primary">
                      {m.member.firstName} {m.member.lastName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{m.plan.name}</TableCell>
                  <TableCell className="text-xs">{new Date(m.endsAt).toLocaleDateString("es-EC")}</TableCell>
                  <TableCell className="text-right text-amber-700 font-medium">{days}d</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function ChurnsTable({ from, to, sede }: { from: string; to: string; sede?: Sede }) {
  const rows = await getChurnsDetail(sede, from, to);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin bajas en este período.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} bajas</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Socio</TableHead>
              <TableHead>Baja</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Sede</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Link href={`/dashboard/socios/${m.id}`} className="hover:underline text-primary">
                    {m.firstName} {m.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">{m.churnedAt ? new Date(m.churnedAt).toLocaleDateString("es-EC") : "—"}</TableCell>
                <TableCell className="text-xs italic">{m.churnReason ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.sede === "FITNESS_CENTER" ? "Fitness" : "Xtreme"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function AttendanceTable({ from, to, sede }: { from: string; to: string; sede?: Sede }) {
  const rows = await getAttendanceDetail(sede, from, to);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin asistencias en este período.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} registros (máx 500)</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Socio</TableHead>
              <TableHead>Clase</TableHead>
              <TableHead>Hora</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs">{new Date(a.classSession.date).toLocaleDateString("es-EC")}</TableCell>
                <TableCell>
                  <Link href={`/dashboard/socios/${a.member.id}`} className="hover:underline text-primary">
                    {a.member.firstName} {a.member.lastName}
                  </Link>
                </TableCell>
                <TableCell className="text-xs">{a.classSession.schedule?.name ?? "—"}</TableCell>
                <TableCell className="text-xs">{a.classSession.schedule?.startTime ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

async function DiscrepanciesTable({ from, to, sede }: { from: string; to: string; sede?: Sede }) {
  const rows = await getDiscrepanciesDetail(sede, from, to);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Sin discrepancias en este período.</p>;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{rows.length} clases con discrepancia admin vs coach</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Clase</TableHead>
              <TableHead className="text-right">Admin</TableHead>
              <TableHead className="text-right">Coach</TableHead>
              <TableHead className="text-right">Δ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">{new Date(c.date).toLocaleDateString("es-EC")}</TableCell>
                <TableCell className="text-xs">{c.schedule?.name ?? "—"} ({c.schedule?.startTime})</TableCell>
                <TableCell className="text-right">{c.adminCount ?? "—"}</TableCell>
                <TableCell className="text-right">{c.coachCount ?? "—"}</TableCell>
                <TableCell className="text-right font-medium text-red-600">
                  {c.adminCount != null && c.coachCount != null ? (c.adminCount - c.coachCount) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
