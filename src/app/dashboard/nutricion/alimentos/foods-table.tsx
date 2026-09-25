"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { FoodDialog } from "@/components/nutrition/food-dialog";
import { setFoodActive, verifyFood, type FoodListFilter, type FoodRow } from "@/lib/actions/foods";
import { EXCHANGE_GROUPS, EXCHANGE_LABEL } from "@/lib/nutrition/exchanges";

export function FoodsTable({
  rows,
  total,
  page,
  pageSize,
  unverified,
  q,
  filter,
}: {
  rows: FoodRow[];
  total: number;
  page: number;
  pageSize: number;
  unverified: number;
  q: string;
  filter: FoodListFilter;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState<FoodRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [isPending, startTransition] = useTransition();

  function go(patch: { q?: string; filtro?: string; p?: number }) {
    const sp = new URLSearchParams();
    const nq = patch.q ?? q;
    const nf = patch.filtro ?? filter;
    if (nq) sp.set("q", nq);
    if (nf !== "todos") sp.set("filtro", nf);
    if (patch.p && patch.p > 1) sp.set("p", String(patch.p));
    router.push(`/dashboard/nutricion/alimentos?${sp.toString()}`);
  }

  function act(fn: () => Promise<void>, msg: string) {
    startTransition(async () => {
      try {
        await fn();
        toast.success(msg);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error.");
      }
    });
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const chips: { key: string; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "sin-verificar", label: `Por verificar${unverified ? ` (${unverified})` : ""}` },
    ...EXCHANGE_GROUPS.map((g) => ({ key: g, label: EXCHANGE_LABEL[g] })),
    { key: "archivados", label: "Archivados" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: search, p: 1 });
          }}
          className="flex gap-2 flex-1 min-w-60"
        >
          <Input placeholder="Buscar alimento…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
        <Button onClick={() => setCreating(true)}>+ Nuevo alimento</Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => go({ filtro: c.key, p: 1 })}
            className={`rounded-full border px-3 py-1 text-xs ${
              filter === c.key ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="px-3 py-2 font-medium">Alimento</th>
                <th className="px-3 py-2 font-medium">Grupo</th>
                <th className="px-3 py-2 font-medium text-right">kcal</th>
                <th className="px-3 py-2 font-medium text-right">P</th>
                <th className="px-3 py-2 font-medium text-right">C</th>
                <th className="px-3 py-2 font-medium text-right">G</th>
                <th className="px-3 py-2 font-medium">Porciones</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    No hay alimentos con ese filtro.
                  </td>
                </tr>
              )}
              {rows.map((f) => (
                <tr key={f.id} className={f.active ? "" : "opacity-50"}>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {f.name}
                      {!f.verified && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-normal text-amber-800">
                          sin verificar
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[f.brand, f.createdByMember ? `de ${f.createdByMember}` : f.sourceNote, f.barcode]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.exchangeGroup ? (
                      <>
                        {EXCHANGE_LABEL[f.exchangeGroup]}
                        {f.exchangeGrams && (
                          <span className="block text-muted-foreground">
                            1 int. = {f.exchangeGrams} {f.isLiquid ? "ml" : "g"}
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(f.kcal)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.proteinG}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.carbsG}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.fatG}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {f.portions.map((p) => `${p.label} (${p.grams})`).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    {!f.verified && f.active && (
                      <Button size="sm" variant="secondary" disabled={isPending} onClick={() => act(() => verifyFood(f.id), "Verificado: ya es público.")}>
                        Verificar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => act(() => setFoodActive(f.id, !f.active), f.active ? "Archivado." : "Restaurado.")}
                    >
                      {f.active ? "Archivar" : "Restaurar"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} {total === 1 ? "alimento" : "alimentos"} · valores por 100 g / 100 ml
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => go({ p: page - 1 })}>
              ←
            </Button>
            <span>
              {page} / {pages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => go({ p: page + 1 })}>
              →
            </Button>
          </div>
        )}
      </div>

      {(creating || editing) && (
        <FoodDialog
          open
          food={editing}
          onOpenChange={(o) => {
            if (!o) {
              setCreating(false);
              setEditing(null);
            }
          }}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
