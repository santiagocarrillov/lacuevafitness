import { redirect } from "next/navigation";
import { requireAuth, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { InviteUserButton } from "./invite-user-button";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  OWNER: "Fundador",
  ACCOUNTING: "Contabilidad",
  ADMIN: "Administrador",
  COACH: "Coach",
  NUTRITIONIST: "Nutricionista",
  MEMBER: "Socio",
};

const sedeLabels: Record<string, string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};

const roleColors: Record<string, string> = {
  OWNER: "text-purple-700 bg-purple-50 border-purple-200",
  ACCOUNTING: "text-indigo-700 bg-indigo-50 border-indigo-200",
  ADMIN: "text-blue-700 bg-blue-50 border-blue-200",
  COACH: "text-emerald-700 bg-emerald-50 border-emerald-200",
  NUTRITIONIST: "text-pink-700 bg-pink-50 border-pink-200",
};

export default async function UsuariosPage() {
  const user = await requireAuth();
  if (!can.manageUsers(user)) redirect("/dashboard?forbidden=1");

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { fullName: "asc" }],
  });

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Usuarios y accesos</h1>
          <p className="text-sm text-muted-foreground">
            Gestión del equipo — crear cuentas, asignar roles y sedes.
          </p>
        </div>
        <InviteUserButton />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Staff ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Auth</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.fullName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={roleColors[u.role] ?? ""}>
                      {roleLabels[u.role] ?? u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.sede ? sedeLabels[u.sede] : <span className="text-muted-foreground">Ambas</span>}
                  </TableCell>
                  <TableCell>
                    {u.active ? (
                      <Badge variant="outline" className="text-emerald-700 border-emerald-200 text-xs">Activo</Badge>
                    ) : (
                      <Badge variant="outline" className="text-red-700 border-red-200 text-xs">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.supabaseUserId ? (
                      <Badge variant="outline" className="text-xs">Vinculado</Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-700 border-amber-200 text-xs">
                        Sin acceso
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
