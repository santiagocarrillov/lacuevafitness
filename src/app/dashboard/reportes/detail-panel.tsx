import Link from "next/link";
import { Sede } from "@/generated/prisma/client";
import { getRevenueDetail, getLeadsDetail } from "@/lib/actions/reports";
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
  leads: "Leads",
  evaluaciones: "Evaluaciones",
  convertidos: "Convertidos",
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
          <LeadsTable
            from={from}
            to={to}
            sede={sede}
            stages={["TRIAL_ATTENDED", "NEGOTIATING", "CONVERTED"]}
            label="Evaluaciones"
          />
        )}
        {detail === "convertidos" && (
          <LeadsTable
            from={from}
            to={to}
            sede={sede}
            stages={["CONVERTED"]}
            label="Convertidos"
          />
        )}
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
