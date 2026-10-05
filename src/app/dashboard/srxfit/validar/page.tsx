import Link from "next/link";
import { redirect } from "next/navigation";
import type { Sede } from "@/generated/prisma/client";
import { requireAuth, getSedeScope, parseSedeParam } from "@/lib/auth";
import { getValidationQueue, validationKinds } from "@/lib/self-log/queue";
import { ValidationQueue } from "./validation-queue";

export const dynamic = "force-dynamic";

const SEDES = [
  { key: "todas", label: "Ambas" },
  { key: "FITNESS_CENTER", label: "Fitness Center" },
  { key: "XTREME", label: "Xtreme" },
] as const;

/**
 * SRXFIT › Por validar — the coach's phone screen: every PR or measurement a
 * socio logged from the app, oldest first, with their official history next
 * to it. Validate / discard with one tap; "Validar todos los verdes" clears the
 * plausible ones. Nothing is validated without a coach tapping.
 */
export default async function ValidarPage({ searchParams }: { searchParams: Promise<{ sede?: string }> }) {
  const user = await requireAuth();
  const kinds = validationKinds(user);
  if (kinds.length === 0) redirect("/dashboard/srxfit?forbidden=1");

  const scoped = getSedeScope(user);
  const params = await searchParams;
  // Default to the coach's own sede; "Ambas" is an explicit choice.
  const sede: Sede | null =
    scoped ?? (params.sede === "todas" ? null : parseSedeParam(params.sede) ?? user.sede ?? null);

  const items = await getValidationQueue({ sede, kinds });

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard/srxfit" className="hover:text-foreground">
            SRXFIT
          </Link>
          <span>/</span>
        </div>
        <h1 className="text-2xl font-semibold">Por validar</h1>
        <p className="text-sm text-muted-foreground">
          {kinds.includes("measurement") ? "Marcas y medidas" : "Marcas"} que los socios registraron desde su app. No
          cuentan para retos ni reportes hasta que las valides.
        </p>
      </div>

      {!scoped && (
        <div className="flex gap-1.5">
          {SEDES.map((s) => {
            const active = s.key === "todas" ? sede === null : sede === s.key;
            return (
              <Link
                key={s.key}
                href={`/dashboard/srxfit/validar?sede=${s.key}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      )}

      <ValidationQueue items={items} showSede={sede === null} />
    </div>
  );
}
