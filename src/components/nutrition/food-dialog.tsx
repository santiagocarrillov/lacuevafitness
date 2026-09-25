"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createFood, updateFood, type FoodRow } from "@/lib/actions/foods";
import { EXCHANGE_GROUPS, EXCHANGE_LABEL, exchangeGramsFor, type ExchangeGroup } from "@/lib/nutrition/exchanges";
import { kcalFromMacros } from "@/lib/nutrition/nutrients";

type NumField = "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "sugarG" | "satFatG" | "sodiumMg";

const NUM_FIELDS: { key: NumField; label: string; unit: string; required?: boolean }[] = [
  { key: "kcal", label: "Calorías", unit: "kcal", required: true },
  { key: "proteinG", label: "Proteína", unit: "g", required: true },
  { key: "carbsG", label: "Carbohidratos", unit: "g", required: true },
  { key: "fatG", label: "Grasa", unit: "g", required: true },
  { key: "fiberG", label: "Fibra", unit: "g" },
  { key: "sugarG", label: "Azúcares", unit: "g" },
  { key: "satFatG", label: "Grasa saturada", unit: "g" },
  { key: "sodiumMg", label: "Sodio", unit: "mg" },
];

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

export function FoodDialog({
  open,
  onOpenChange,
  food,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  food: FoodRow | null;
  onSaved?: (f: FoodRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(food?.name ?? "");
  const [brand, setBrand] = useState(food?.brand ?? "");
  const [barcode, setBarcode] = useState(food?.barcode ?? "");
  const [isLiquid, setIsLiquid] = useState(food?.isLiquid ?? false);
  // Nutrition labels often come per serving: let the nutritionist type them as
  // printed and convert to 100 g on save.
  const [basis, setBasis] = useState("100");
  const [nums, setNums] = useState<Record<NumField, string>>(() => ({
    kcal: str(food?.kcal),
    proteinG: str(food?.proteinG),
    carbsG: str(food?.carbsG),
    fatG: str(food?.fatG),
    fiberG: str(food?.fiberG),
    sugarG: str(food?.sugarG),
    satFatG: str(food?.satFatG),
    sodiumMg: str(food?.sodiumMg),
  }));
  const [portions, setPortions] = useState(
    (food?.portions ?? []).map((p) => ({ label: p.label, grams: String(p.grams) })),
  );
  const [group, setGroup] = useState<string>(food?.exchangeGroup ?? "");
  const [exGrams, setExGrams] = useState(str(food?.exchangeGrams));

  const factor = 100 / (Number(basis) || 100);
  const per100 = (k: NumField) => (nums[k] === "" ? null : Math.round(Number(nums[k]) * factor * 10) / 10);

  const implied = useMemo(() => {
    const p = per100("proteinG"), c = per100("carbsG"), f = per100("fatG");
    return p !== null && c !== null && f !== null ? kcalFromMacros({ proteinG: p, carbsG: c, fatG: f }) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nums, basis]);

  const autoExGrams = useMemo(() => {
    const p = per100("proteinG") ?? 0, c = per100("carbsG") ?? 0, f = per100("fatG") ?? 0;
    return exchangeGramsFor((group || null) as ExchangeGroup | null, { proteinG: p, carbsG: c, fatG: f });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nums, basis, group]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      name,
      brand: brand || null,
      barcode: barcode || null,
      isLiquid,
      kcal: per100("kcal") ?? NaN,
      proteinG: per100("proteinG") ?? NaN,
      carbsG: per100("carbsG") ?? NaN,
      fatG: per100("fatG") ?? NaN,
      fiberG: per100("fiberG"),
      sugarG: per100("sugarG"),
      satFatG: per100("satFatG"),
      sodiumMg: per100("sodiumMg"),
      portions: portions
        .filter((p) => p.label.trim() && Number(p.grams) > 0)
        .map((p) => ({ label: p.label, grams: Number(p.grams) })),
      exchangeGroup: (group || null) as ExchangeGroup | null,
      exchangeGrams: exGrams === "" ? null : Number(exGrams),
    };
    startTransition(async () => {
      try {
        const saved = food ? await updateFood(food.id, input) : await createFood(input);
        toast.success(food ? "Alimento actualizado." : "Alimento creado.");
        onSaved?.(saved);
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  const unit = isLiquid ? "ml" : "g";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{food ? "Editar alimento" : "Nuevo alimento"}</DialogTitle>
          <DialogDescription>
            {food?.createdByMember
              ? `Creado por ${food.createdByMember}. Revisa los valores antes de verificarlo.`
              : "Los valores se guardan por 100 g (o 100 ml)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="food-name">Nombre</Label>
              <Input id="food-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Yogur griego natural" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="food-brand">Marca</Label>
              <Input id="food-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="food-barcode">Código de barras</Label>
              <Input id="food-barcode" inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLiquid} onChange={(e) => setIsLiquid(e.target.checked)} />
            Es líquido (se mide en ml)
          </label>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span>Valores por</span>
              <Input className="h-8 w-20" inputMode="decimal" value={basis} onChange={(e) => setBasis(e.target.value)} />
              <span>{unit}</span>
              {basis !== "100" && Number(basis) > 0 && (
                <span className="text-xs text-muted-foreground">(se convierten a 100 {unit} al guardar)</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {NUM_FIELDS.map((f) => (
                <div key={f.key} className="space-y-1">
                  <Label htmlFor={`food-${f.key}`} className="text-xs">
                    {f.label} ({f.unit}){f.required ? " *" : ""}
                  </Label>
                  <Input
                    id={`food-${f.key}`}
                    inputMode="decimal"
                    required={f.required}
                    value={nums[f.key]}
                    onChange={(e) => setNums((n) => ({ ...n, [f.key]: e.target.value.replace(",", ".") }))}
                  />
                </div>
              ))}
            </div>
            {implied !== null && nums.kcal !== "" && (
              <p className="text-xs text-muted-foreground">
                Por 100 {unit}: {per100("kcal")} kcal · los macros suman ≈{implied} kcal
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Porciones caseras</Label>
            {portions.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="1 taza"
                  value={p.label}
                  onChange={(e) => setPortions((ps) => ps.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <Input
                  className="w-24"
                  inputMode="decimal"
                  placeholder={unit}
                  value={p.grams}
                  onChange={(e) => setPortions((ps) => ps.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => setPortions((ps) => ps.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setPortions((ps) => [...ps, { label: "", grams: "" }])}>
              + Porción
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="food-group">Grupo (intercambios)</Label>
              <select
                id="food-group"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">Sin grupo</option>
                {EXCHANGE_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {EXCHANGE_LABEL[g]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="food-exg">{unit} por intercambio</Label>
              <Input
                id="food-exg"
                inputMode="decimal"
                value={exGrams}
                onChange={(e) => setExGrams(e.target.value)}
                placeholder={autoExGrams ? `Auto: ${autoExGrams}` : "—"}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
