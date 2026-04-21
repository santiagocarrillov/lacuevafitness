"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createExpense, deleteExpense } from "@/lib/actions/reports";
import { Sede } from "@/generated/prisma/enums";

type Expense = {
  id: string;
  sede: string | null;
  category: string;
  description: string;
  amountCents: number;
  date: Date;
  recurring: boolean;
  notes: string | null;
};

const categoryLabels: Record<string, string> = {
  PAYROLL: "Sueldos",
  RENT: "Arriendo",
  UTILITIES: "Servicios",
  EQUIPMENT: "Equipamiento",
  MARKETING: "Marketing",
  SUPPLIES: "Insumos",
  SOFTWARE: "Software",
  TAXES: "Impuestos",
  PROFESSIONAL: "Profesional",
  OTHER: "Otro",
};

const categories = Object.keys(categoryLabels);

export function ExpensesPanel({
  expenses,
  sede,
}: {
  expenses: Expense[];
  sede?: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    category: "RENT",
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    recurring: false,
    sede: sede ?? "",
  });

  function update(field: string, value: string | boolean) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount) {
      toast.error("Descripción y monto son obligatorios.");
      return;
    }
    startTransition(async () => {
      await createExpense({
        sede: (form.sede || undefined) as any,
        category: form.category as any,
        description: form.description,
        amountCents: Math.round(parseFloat(form.amount) * 100),
        date: form.date,
        recurring: form.recurring,
      });
      toast.success("Gasto registrado.");
      setShowForm(false);
      setForm({ ...form, description: "", amount: "" });
      router.refresh();
    });
  }

  async function handleDelete(id: string) {
    startTransition(async () => {
      await deleteExpense(id);
      toast.success("Gasto eliminado.");
      router.refresh();
    });
  }

  const total = expenses.reduce((s, e) => s + e.amountCents, 0) / 100;
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Gastos del mes</CardTitle>
          <CardDescription>
            Total: ${total.toLocaleString("es-EC", { minimumFractionDigits: 2 })}
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "+ Nuevo gasto"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3 pb-4 border-b">
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <select value={form.category} onChange={(e) => update("category", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                {categories.map((c) => <option key={c} value={c}>{categoryLabels[c]}</option>)}
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">Descripción</Label>
              <Input placeholder="ej: Arriendo Noviembre" value={form.description} onChange={(e) => update("description", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Monto ($)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => update("amount", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sede</Label>
              <select value={form.sede} onChange={(e) => update("sede", e.target.value)}
                className="w-full h-8 rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Compartido</option>
                <option value="FITNESS_CENTER">Fitness Center</option>
                <option value="XTREME">Xtreme</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={form.recurring} onChange={(e) => update("recurring", e.target.checked)} />
                Recurrente
              </label>
              <Button type="submit" disabled={isPending} className="ml-auto">
                Guardar
              </Button>
            </div>
          </form>
        )}

        {/* Breakdown by category */}
        {byCategory.size > 0 && (
          <div className="flex flex-wrap gap-2">
            {Array.from(byCategory.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([cat, amount]) => (
                <Badge key={cat} variant="outline">
                  {categoryLabels[cat] ?? cat}: ${(amount / 100).toLocaleString("es-EC", { minimumFractionDigits: 0 })}
                </Badge>
              ))}
          </div>
        )}

        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin gastos registrados este mes.</p>
        ) : (
          <div className="rounded-md border divide-y">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs">{categoryLabels[e.category] ?? e.category}</Badge>
                  <span>{e.description}</span>
                  {e.recurring && <Badge variant="outline" className="text-xs">Recurrente</Badge>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-medium">${(e.amountCents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(e.date).toLocaleDateString("es-EC")}
                  </span>
                  <button onClick={() => handleDelete(e.id)} disabled={isPending}
                    className="text-xs text-muted-foreground hover:text-destructive">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
