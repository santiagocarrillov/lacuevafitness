"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MemberRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  sede: string;
  status: string;
  joinedAt: Date;
  memberships: {
    endsAt: Date;
    state: string;
    plan: { name: string };
  }[];
};

const statusColors: Record<string, string> = {
  ACTIVE: "text-emerald-700 bg-emerald-50 border-emerald-200",
  TRIAL: "text-blue-700 bg-blue-50 border-blue-200",
  PAUSED: "text-amber-700 bg-amber-50 border-amber-200",
  CHURNED: "text-red-700 bg-red-50 border-red-200",
  LEAD: "text-zinc-600 bg-zinc-50 border-zinc-200",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  TRIAL: "Trial",
  PAUSED: "Pausado",
  CHURNED: "Baja",
  LEAD: "Lead",
};

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

export function MemberTable({
  members,
  total,
  page,
  totalPages,
}: {
  members: MemberRow[];
  total: number;
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", p.toString());
    router.push(`/dashboard/socios?${params.toString()}`);
  }

  const now = new Date();

  return (
    <div className="space-y-3">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Sede</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Plan actual</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Contacto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No hay socios que coincidan con los filtros.
                </TableCell>
              </TableRow>
            ) : (
              members.map((m) => {
                const membership = m.memberships[0];
                const isExpired = membership && new Date(membership.endsAt) < now;
                return (
                  <TableRow key={m.id} className="cursor-pointer hover:bg-accent">
                    <TableCell>
                      <Link href={`/dashboard/socios/${m.id}`} className="font-medium hover:underline">
                        {m.lastName}, {m.firstName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {sedeLabels[m.sede] ?? m.sede}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[m.status] ?? ""}>
                        {statusLabels[m.status] ?? m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {membership?.plan.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {membership ? (
                        <span className={isExpired ? "text-red-600 font-medium" : ""}>
                          {new Date(membership.endsAt).toLocaleDateString("es-EC")}
                          {isExpired && " (vencida)"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.email ?? m.phone ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{total} socios encontrados</span>
        {totalPages > 1 && (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goToPage(page - 1)}
            >
              Anterior
            </Button>
            <span className="px-2 py-1">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goToPage(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
