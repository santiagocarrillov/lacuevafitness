"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addFoodLogEntry, addPlanOptionToDiary, copyMeal } from "@/lib/actions/food-log";
import { addDays } from "@/lib/nutrition/appointments";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import type { DiaryDay, DiaryEntryVm } from "@/lib/portal/food-diary";
import { AddFoodSheet } from "./add-food-sheet";
import { EntrySheet } from "./entry-sheet";
import { TargetWizard, type WizardPrefill } from "./target-wizard";

function dayLabel(date: string, today: string) {
  if (date === today) return "Hoy";
  if (date === addDays(today, -1)) return "Ayer";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "short" });
}

function Ring({ consumed, target }: { consumed: number; target: number }) {
  const pct = target > 0 ? Math.min(1, consumed / target) : 0;
  const over = target > 0 && consumed > target;
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${consumed} de ${target} kcal`}>
      <circle cx="56" cy="56" r={r} fill="none" stroke="var(--pt-line)" strokeWidth="10" />
      <circle
        cx="56"
        cy="56"
        r={r}
        fill="none"
        stroke={over ? "var(--pt-red)" : "var(--pt-accent-deep, #a6cc1f)"}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform="rotate(-90 56 56)"
      />
      <text x="56" y="54" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--pt-ink)">
        {Math.abs(target - consumed)}
      </text>
      <text x="56" y="70" textAnchor="middle" fontSize="10" fill="var(--pt-ink-3)">
        {over ? "kcal de más" : "kcal restantes"}
      </text>
    </svg>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
        <span>{label}</span>
        <span style={{ color: "var(--pt-ink-3)" }}>
          {value}/{target} g
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: "var(--pt-line-soft)", overflow: "hidden", marginTop: 3 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

export function DiaryView({
  day,
  today,
  prefill,
  targetLocked,
}: {
  day: DiaryDay;
  today: string;
  prefill: WizardPrefill;
  targetLocked: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState<MealKey | null>(null);
  const [editing, setEditing] = useState<DiaryEntryVm | null>(null);
  const [wizard, setWizard] = useState(false);
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const isToday = day.date === today;
  const canEdit = day.date >= addDays(today, -7) && day.date <= today;
  const t = day.target;

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        setNote(e instanceof Error ? e.message : "No se pudo.");
      }
    });
  }

  const href = (d: string) => `/portal/nutricion?tab=diario${d === today ? "" : `&fecha=${d}`}`;

  return (
    <div>
      {/* Day navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Link href={href(addDays(day.date, -1))} style={{ padding: "4px 12px", fontSize: 20, textDecoration: "none", color: "var(--pt-ink)" }} aria-label="Día anterior">
          ‹
        </Link>
        <div style={{ fontFamily: "var(--pt-font-cond)", fontSize: 18, fontWeight: 600, textTransform: "uppercase" }}>{dayLabel(day.date, today)}</div>
        {isToday ? (
          <span style={{ width: 44 }} />
        ) : (
          <Link href={href(addDays(day.date, 1))} style={{ padding: "4px 12px", fontSize: 20, textDecoration: "none", color: "var(--pt-ink)" }} aria-label="Día siguiente">
            ›
          </Link>
        )}
      </div>

      {/* Summary */}
      {t ? (
        <section className="portal-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Ring consumed={day.totals.kcal} target={t.kcal} />
            <div style={{ flex: 1, display: "grid", gap: 8 }}>
              <div style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
                <strong style={{ color: "var(--pt-ink)" }}>{day.totals.kcal}</strong> de {t.kcal} kcal
              </div>
              <MacroBar label="Proteína" value={day.totals.proteinG} target={t.proteinG} color="var(--pt-green)" />
              <MacroBar label="Carbos" value={day.totals.carbsG} target={t.carbsG} color="var(--pt-blue)" />
              <MacroBar label="Grasa" value={day.totals.fatG} target={t.fatG} color="var(--pt-orange)" />
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--pt-ink-3)", marginTop: 8 }}>
            {t.source === "PLAN" || t.source === "NUTRITIONIST" ? "Meta de tu nutricionista" : "Meta calculada por ti"}
            {!targetLocked && (
              <>
                {" · "}
                <button type="button" onClick={() => setWizard(true)} style={{ background: "none", border: "none", padding: 0, fontSize: 11, textDecoration: "underline", cursor: "pointer", color: "inherit" }}>
                  recalcular
                </button>
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="portal-card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Hoy llevas {day.totals.kcal} kcal</div>
          <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: "4px 0 10px" }}>
            Con una meta diaria te decimos cuánto te queda para cada comida.
          </p>
          <button
            type="button"
            onClick={() => setWizard(true)}
            style={{ padding: "10px 14px", borderRadius: 12, border: "none", background: "var(--pt-ink)", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Calcular mi meta
          </button>
        </section>
      )}

      {/* "Soluciones": what's left and where */}
      {isToday && day.budget?.message && (
        <section className="portal-callout" style={{ marginBottom: 12, padding: 12, borderRadius: 12, background: day.budget.remaining < 0 ? "var(--pt-red-bg)" : "var(--pt-blue-bg)", fontSize: 14 }}>
          {day.budget.message}
        </section>
      )}

      {note && <p style={{ color: "var(--pt-red)", fontSize: 13 }}>{note}</p>}

      {/* Meals */}
      {day.meals.map((k) => {
        const entries = day.entries.filter((e) => e.mealKey === k);
        const b = day.budget?.meals.find((m) => m.key === k);
        const kcal = entries.reduce((a, e) => a + e.kcal, 0);
        const yesterdayKcal = day.yesterdayMeals[k];
        const planOpts = day.planOptions.filter((o) => o.mealKey === k);
        return (
          <section key={k} className="portal-card" style={{ marginBottom: 10, padding: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "12px 14px 8px" }}>
              <div style={{ fontFamily: "var(--pt-font-cond)", fontSize: 17, fontWeight: 600, textTransform: "uppercase" }}>{MEAL_LABEL[k]}</div>
              <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                {kcal} kcal
                {b ? (b.closed ? ` / ${b.planned}` : b.suggested !== null ? ` · te quedan ≈${b.suggested}` : "") : ""}
              </div>
            </div>
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setEditing(e)}
                style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 8, padding: "9px 14px", background: "none", border: "none", borderTop: "1px solid var(--pt-line-soft)", textAlign: "left", cursor: canEdit ? "pointer" : "default" }}
              >
                <span style={{ fontSize: 14 }}>
                  {e.name}
                  <span style={{ display: "block", fontSize: 12, color: "var(--pt-ink-3)" }}>{e.amount}</span>
                </span>
                <span style={{ fontSize: 14, whiteSpace: "nowrap" }}>{e.kcal}</span>
              </button>
            ))}
            {canEdit && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 14px", borderTop: "1px solid var(--pt-line-soft)" }}>
                <button type="button" onClick={() => setAdding(k)} style={{ background: "none", border: "none", padding: 0, fontSize: 14, fontWeight: 600, cursor: "pointer", color: "var(--pt-ink)" }}>
                  + Agregar
                </button>
                {entries.length === 0 && isToday && planOpts.length === 1 && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => addPlanOptionToDiary({ mealKey: k, optionId: planOpts[0].id }))}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 13, cursor: "pointer", color: "var(--pt-ink-2)", textDecoration: "underline" }}
                  >
                    Comí lo del plan ({planOpts[0].kcal} kcal)
                  </button>
                )}
                {entries.length === 0 && yesterdayKcal ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => copyMeal({ fromDate: addDays(day.date, -1), fromMeal: k, toDate: day.date, toMeal: k }))}
                    style={{ background: "none", border: "none", padding: 0, fontSize: 13, cursor: "pointer", color: "var(--pt-ink-2)", textDecoration: "underline" }}
                  >
                    Copiar de ayer ({yesterdayKcal} kcal)
                  </button>
                ) : null}
              </div>
            )}
          </section>
        );
      })}

      {/* Ideas for the next meal */}
      {isToday && day.suggestions && day.suggestions.items.length > 0 && (
        <>
          <div className="portal-section-title">
            <h4>
              Ideas para {MEAL_LABEL[day.suggestions.mealKey].toLowerCase()} (≈{day.suggestions.budget} kcal)
            </h4>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {day.suggestions.items.map((s) => (
              <div key={s.id} className="portal-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                    {s.grams ? `${s.grams} g · ` : ""}
                    {Math.round(s.kcal)} kcal · P {s.proteinG} g
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    act(() =>
                      s.kind === "plan"
                        ? addPlanOptionToDiary({ mealKey: day.suggestions!.mealKey, optionId: s.refId })
                        : addFoodLogEntry({
                            mealKey: day.suggestions!.mealKey,
                            foodId: s.kind === "food" ? s.refId : null,
                            recipeId: s.kind === "recipe" ? s.refId : null,
                            grams: s.grams ?? null,
                            servings: s.servings ?? null,
                            source: "SUGGESTION",
                          }),
                    )
                  }
                  style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--pt-line)", background: "var(--pt-bg-card)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  + Agregar
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <p style={{ fontSize: 11, color: "var(--pt-ink-3)", marginTop: 16, textAlign: "center" }}>
        Tu nutricionista puede ver tu diario para ayudarte mejor.
      </p>

      {adding && (
        <AddFoodSheet mealKey={adding} date={day.date} isToday={isToday} planOptions={day.planOptions} onClose={() => setAdding(null)} />
      )}
      {editing && <EntrySheet entry={editing} meals={day.meals} onClose={() => setEditing(null)} />}
      {wizard && <TargetWizard prefill={prefill} onClose={() => setWizard(false)} />}
    </div>
  );
}
