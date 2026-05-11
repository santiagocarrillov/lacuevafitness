"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Align = "left" | "right";
type ColumnFormat = "text" | "date" | "money" | "badge" | "memberLink" | "int";

export type Column = {
  key: string;
  label: string;
  format?: ColumnFormat;
  align?: Align;
  filterable?: boolean; // show a dropdown of distinct values
};

export type Row = Record<string, string | number | Date | null | undefined> & {
  id: string;
  memberId?: string | null;
};

const SEDE_OPTIONS = [
  { value: "", label: "Ambas sedes" },
  { value: "FITNESS_CENTER", label: "Fitness Center" },
  { value: "XTREME", label: "Xtreme" },
];

function fmt(value: unknown, format: ColumnFormat = "text"): string {
  if (value == null) return "—";
  if (format === "date") return new Date(value as Date).toLocaleDateString("es-EC");
  if (format === "money") return `$${(Number(value) / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}`;
  if (format === "int") return String(value);
  return String(value);
}

function csvEscape(s: string): string {
  if (s == null) return "";
  const needsQuote = /["\n,]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

export function DetailView({
  title,
  subtitle,
  columns,
  rows,
  backHref,
  fileName,
  sedeScoped,
  currentSede,
  currentFrom,
  currentTo,
}: {
  title: string;
  subtitle: string;
  columns: Column[];
  rows: Row[];
  backHref: string;
  fileName: string;
  sedeScoped: boolean;        // if user has a sede scope (can't choose)
  currentSede: string;
  currentFrom: string;
  currentTo: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});

  function updateParam(updates: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`?${next.toString()}`);
  }

  // Distinct values per filterable column
  const distinctValues = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      if (!col.filterable) continue;
      const set = new Set<string>();
      for (const r of rows) {
        const v = r[col.key];
        if (v != null && v !== "") set.add(String(v));
      }
      map[col.key] = Array.from(set).sort();
    }
    return map;
  }, [columns, rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      // Per-column filters
      for (const [key, val] of Object.entries(colFilters)) {
        if (!val) continue;
        if (String(row[key] ?? "") !== val) return false;
      }
      // Free-text search across all string-ish cells
      if (q) {
        const anyMatch = Object.values(row).some((v) =>
          String(v ?? "").toLowerCase().includes(q),
        );
        if (!anyMatch) return false;
      }
      return true;
    });
  }, [rows, search, colFilters]);

  const hasActiveFilters = search.trim() !== "" || Object.values(colFilters).some((v) => v);

  // Totals for money columns
  const moneyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const col of columns) {
      if (col.format === "money") {
        totals[col.key] = filteredRows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
      }
    }
    return totals;
  }, [columns, filteredRows]);

  // CSV based on filtered rows
  const csv = useMemo(() => {
    const header = columns.map((c) => csvEscape(c.label)).join(",");
    const body = filteredRows.map((r) =>
      columns.map((c) => csvEscape(fmt(r[c.key], c.format))).join(","),
    );
    return [header, ...body].join("\n");
  }, [columns, filteredRows]);

  function handleExport() {
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrint() {
    window.print();
  }

  function clearFilters() {
    setSearch("");
    setColFilters({});
  }

  return (
    <div className="p-6 md:p-8 space-y-4 max-w-7xl">
      {/* Action bar */}
      <div className="print:hidden flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition"
        >
          ← Volver al reporte
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>🖨️ Imprimir</Button>
          <Button variant="outline" size="sm" onClick={handleExport}>📥 Exportar CSV</Button>
        </div>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* Filter bar (hidden in print) */}
      <div className="print:hidden rounded-md border bg-muted/30 p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <Input
              placeholder="Filtrar por nombre, plan, método…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8"
            />
          </div>
          {!sedeScoped && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Sede</label>
              <select
                value={currentSede}
                onChange={(e) => updateParam({ sede: e.target.value })}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {SEDE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input
              type="date"
              value={currentFrom}
              onChange={(e) => updateParam({ from: e.target.value })}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input
              type="date"
              value={currentTo}
              onChange={(e) => updateParam({ to: e.target.value })}
              className="h-8"
            />
          </div>
          {columns
            .filter((c) => c.filterable && (distinctValues[c.key]?.length ?? 0) > 1)
            .map((c) => (
              <div key={c.key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{c.label}</label>
                <select
                  value={colFilters[c.key] ?? ""}
                  onChange={(e) => setColFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm max-w-[160px]"
                >
                  <option value="">Todos</option>
                  {distinctValues[c.key].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
            ))}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8">
              Limpiar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Mostrando <strong>{filteredRows.length}</strong> de {rows.length} registros
          {Object.entries(moneyTotals).map(([key, total]) => {
            const col = columns.find((c) => c.key === key)!;
            return (
              <span key={key}>
                {" · "}Total {col.label.toLowerCase()}:{" "}
                <strong>${(total / 100).toLocaleString("es-EC", { minimumFractionDigits: 2 })}</strong>
              </span>
            );
          })}
        </p>
      </div>

      {/* Table */}
      {filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-8 text-center">
          Sin registros para este filtro.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 border-b">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`px-3 py-2 font-medium whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  {columns.map((c) => {
                    const value = r[c.key];
                    const cellClass = `px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`;
                    if (c.format === "memberLink" && r.memberId) {
                      return (
                        <td key={c.key} className={cellClass}>
                          <Link
                            href={`/dashboard/socios/${r.memberId}`}
                            className="text-primary hover:underline"
                          >
                            {fmt(value, "text")}
                          </Link>
                        </td>
                      );
                    }
                    if (c.format === "badge") {
                      return (
                        <td key={c.key} className={cellClass}>
                          <Badge variant="outline" className="text-xs">{fmt(value, "text")}</Badge>
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className={cellClass}>
                        {fmt(value, c.format)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground print:hidden">
        Hora del reporte: {new Date().toLocaleString("es-EC")}
      </p>
    </div>
  );
}
