"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { saveEmissionPoint, saveSaleItem } from "@/lib/actions/invoicing";
import { ENTITIES, ENTITY_ORDER } from "@/lib/finance/entities";
import { INCOME_ACCOUNTS, fmtUsd, formatDocNumber } from "@/lib/invoicing/core";
import type { SaleItemKind, Sede, SriEnvironment } from "@/generated/prisma/enums";

const selectCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

type Point = { id: string; sede: Sede; establishment: string; point: string; address: string; lastSequential: number; environment: SriEnvironment; active: boolean };
type Item = { id: string; sede: Sede | null; name: string; priceCents: number; ivaRate: number; kind: SaleItemKind; incomeAccountCode: string; active: boolean };

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function useSave<T>(action: (v: T) => Promise<unknown>, onDone: () => void) {
  const [pending, start] = useTransition();
  return {
    pending,
    run: (v: T) =>
      start(async () => {
        try {
          await action(v);
          toast.success("Guardado");
          onDone();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
        }
      }),
  };
}

function PointDialog({ point, trigger }: { point?: Point; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useSave(saveEmissionPoint, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{point ? "Editar punto de emisión" : "Nuevo punto de emisión"}</DialogTitle>
          <DialogDescription>
            Usa un punto propio para la app, distinto del que usa Ecuafact, para que la numeración no choque.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run({
              id: point?.id,
              sede: fd.get("sede") as Sede,
              establishment: String(fd.get("establishment")).trim(),
              point: String(fd.get("point")).trim(),
              address: String(fd.get("address")),
              lastSequential: Number(fd.get("lastSequential")),
              environment: fd.get("environment") as SriEnvironment,
              active: fd.get("active") === "on",
            });
          }}
        >
          <Field label="Entidad">
            <select name="sede" className={selectCls} defaultValue={point?.sede}>
              {ENTITY_ORDER.map((s) => (
                <option key={s} value={s}>{ENTITIES[s].name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ambiente">
            <select name="environment" className={selectCls} defaultValue={point?.environment ?? "PRUEBAS"}>
              <option value="PRUEBAS">Pruebas</option>
              <option value="PRODUCCION">Producción</option>
            </select>
          </Field>
          <Field label="Establecimiento" hint="3 dígitos, p. ej. 001">
            <Input name="establishment" className="h-8" defaultValue={point?.establishment ?? "001"} required pattern="\d{3}" />
          </Field>
          <Field label="Punto de emisión" hint="3 dígitos, distinto del de Ecuafact">
            <Input name="point" className="h-8" defaultValue={point?.point ?? ""} required pattern="\d{3}" />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Dirección del establecimiento">
              <Input name="address" className="h-8" defaultValue={point?.address ?? ""} required />
            </Field>
          </div>
          <Field label="Último secuencial emitido" hint="La próxima factura será este + 1">
            <Input name="lastSequential" type="number" min={0} className="h-8" defaultValue={point?.lastSequential ?? 0} required />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={point?.active ?? true} /> Activo
          </label>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmissionPointsCard({ points }: { points: Point[] }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Puntos de emisión</h2>
          <p className="text-xs text-muted-foreground">Numeración de las facturas de cada entidad.</p>
        </div>
        <PointDialog trigger={<Button size="sm" variant="outline">Nuevo</Button>} />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Entidad</th>
            <th className="py-1 font-medium">Próxima factura</th>
            <th className="py-1 font-medium">Ambiente</th>
            <th className="py-1 font-medium">Dirección</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.id} className={`border-t ${p.active ? "" : "text-muted-foreground"}`}>
              <td className="py-2">{ENTITIES[p.sede].name}</td>
              <td className="py-2 font-mono">{formatDocNumber(p.establishment, p.point, p.lastSequential + 1)}</td>
              <td className="py-2">{p.environment === "PRUEBAS" ? "Pruebas" : "Producción"}{p.active ? "" : " · inactivo"}</td>
              <td className="py-2">{p.address}</td>
              <td className="py-2 text-right">
                <PointDialog point={p} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
              </td>
            </tr>
          ))}
          {points.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">Sin puntos de emisión.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function ItemDialog({ item, trigger }: { item?: Item; trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useSave(saveSaleItem, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Editar producto o servicio" : "Nuevo producto o servicio"}</DialogTitle>
          <DialogDescription>Lo que se vende y no es membresía: evaluaciones, bebidas, pases.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const sede = String(fd.get("sede"));
            run({
              id: item?.id,
              sede: sede ? (sede as Sede) : null,
              name: String(fd.get("name")),
              priceCents: Math.round(Number(String(fd.get("price")).replace(",", ".")) * 100),
              ivaRate: fd.get("iva0") === "on" ? 0 : 15,
              kind: fd.get("kind") as SaleItemKind,
              incomeAccountCode: String(fd.get("account")),
              active: fd.get("active") === "on",
            });
          }}
        >
          <div className="sm:col-span-2">
            <Field label="Nombre (sale en la factura)">
              <Input name="name" className="h-8" defaultValue={item?.name} required />
            </Field>
          </div>
          <Field label="Precio con IVA">
            <Input name="price" className="h-8" inputMode="decimal" defaultValue={item ? (item.priceCents / 100).toFixed(2) : ""} required />
          </Field>
          <Field label="Entidad">
            <select name="sede" className={selectCls} defaultValue={item?.sede ?? ""}>
              <option value="">Ambas</option>
              {ENTITY_ORDER.map((s) => (
                <option key={s} value={s}>{ENTITIES[s].name}</option>
              ))}
            </select>
          </Field>
          <Field label="Tipo">
            <select name="kind" className={selectCls} defaultValue={item?.kind ?? "SERVICE"}>
              <option value="SERVICE">Servicio</option>
              <option value="GOOD">Bien (producto)</option>
            </select>
          </Field>
          <Field label="Cuenta de ingreso">
            <select name="account" className={selectCls} defaultValue={item?.incomeAccountCode ?? "4.1.02"}>
              {INCOME_ACCOUNTS.map((a) => (
                <option key={a.code} value={a.code}>{a.code} · {a.label}</option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="iva0" defaultChecked={item?.ivaRate === 0} /> IVA 0 %
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Activo
          </label>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaleItemsCard({ items }: { items: Item[] }) {
  const account = Object.fromEntries(INCOME_ACCOUNTS.map((a) => [a.code, a.label]));
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Catálogo</h2>
          <p className="text-xs text-muted-foreground">Las membresías salen de los planes; aquí va todo lo demás.</p>
        </div>
        <ItemDialog trigger={<Button size="sm" variant="outline">Nuevo</Button>} />
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="py-1 font-medium">Nombre</th>
            <th className="py-1 text-right font-medium">Precio</th>
            <th className="py-1 font-medium pl-4">Entidad</th>
            <th className="py-1 font-medium">Cuenta</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((s) => (
            <tr key={s.id} className={`border-t ${s.active ? "" : "text-muted-foreground"}`}>
              <td className="py-2">{s.name}{s.active ? "" : " · inactivo"}</td>
              <td className="py-2 text-right tabular-nums">{fmtUsd(s.priceCents)}{s.ivaRate === 0 ? " (IVA 0 %)" : ""}</td>
              <td className="py-2 pl-4">{s.sede ? ENTITIES[s.sede].name : "Ambas"}</td>
              <td className="py-2">{account[s.incomeAccountCode] ?? s.incomeAccountCode}</td>
              <td className="py-2 text-right">
                <ItemDialog item={s} trigger={<Button size="sm" variant="ghost">Editar</Button>} />
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-center text-muted-foreground">El catálogo está vacío.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
