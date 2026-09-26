"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPlanMeal } from "@/lib/actions/meal-checks";
import { addPlanOptionToDiary } from "@/lib/actions/food-log";
import { sendNutritionMessage } from "@/lib/actions/nutrition-messages";
import { ADHERENCE_META, adherenceFromChecks, type AdherenceLevel } from "@/lib/nutrition/adherence";
import type { ExchangeGroup } from "@/lib/nutrition/exchanges";
import type { Equivalent } from "@/lib/portal/nutrition-plan";
import type { VmDay, VmMeal } from "./view-model";

export type Check = { ate: boolean; optionId: string | null; freeText: string | null };

const btn = (bg: string, fg: string, border = bg): React.CSSProperties => ({
  flex: 1,
  padding: "9px 10px",
  borderRadius: 10,
  border: `1px solid ${border}`,
  background: bg,
  color: fg,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
});

export function EquivalentsList({ items, unitLabel }: { items: Equivalent[]; unitLabel?: string }) {
  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>Tu nutricionista aún no cargó equivalencias de este grupo.</p>;
  }
  return (
    <ul style={{ display: "grid", gap: 4, margin: 0, padding: 0, listStyle: "none" }}>
      {items.map((e) => (
        <li key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
          <span>{e.name}</span>
          <span style={{ color: "var(--pt-ink-2)", whiteSpace: "nowrap" }}>
            {e.portion ? `${e.portion} · ` : ""}
            {Math.round(e.grams)} {e.isLiquid ? "ml" : "g"}
            {unitLabel ?? ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MealBlock({
  meal,
  check,
  equivalents,
  onMark,
  pending,
}: {
  meal: VmMeal;
  check: Check | undefined;
  equivalents: Partial<Record<ExchangeGroup, Equivalent[]>>;
  onMark: (status: "done" | "missed" | null, optionId?: string | null) => void;
  pending: boolean;
}) {
  const [optIdx, setOptIdx] = useState(() => Math.max(0, meal.options.findIndex((o) => o.id === check?.optionId)));
  const [openGroup, setOpenGroup] = useState<ExchangeGroup | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, startSend] = useTransition();
  const [adding, startAdd] = useTransition();
  const [diaryMsg, setDiaryMsg] = useState<string | null>(null);
  const opt = meal.options[optIdx];

  const state = !check ? "pending" : check.ate ? "done" : "missed";
  const border = state === "done" ? "var(--pt-green)" : state === "missed" ? "var(--pt-red)" : "var(--pt-line)";

  return (
    <section className="portal-card" style={{ marginBottom: 10, borderColor: border, borderWidth: state === "pending" ? 1 : 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div>
          <div style={{ fontFamily: "var(--pt-font-cond)", fontSize: 18, fontWeight: 600, textTransform: "uppercase" }}>{meal.label}</div>
          {meal.time && <div style={{ fontSize: 11, color: "var(--pt-ink-3)" }}>{meal.time}</div>}
        </div>
        <div style={{ fontSize: 12, color: "var(--pt-ink-3)", whiteSpace: "nowrap" }}>≈ {opt?.kcal ?? meal.kcal} kcal</div>
      </div>

      {meal.options.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {meal.options.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOptIdx(i)}
              style={{
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 12,
                border: "1px solid var(--pt-line)",
                background: i === optIdx ? "var(--pt-ink)" : "transparent",
                color: i === optIdx ? "#fff" : "var(--pt-ink-2)",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {opt && (
        <ul style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
          {opt.items.map((it, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
              <span>{it.name}</span>
              <span style={{ color: "var(--pt-ink-2)", whiteSpace: "nowrap", fontSize: 13 }}>{it.amount}</span>
            </li>
          ))}
        </ul>
      )}
      {opt?.notes && <p style={{ fontSize: 12, color: "var(--pt-ink-2)", marginTop: 8, whiteSpace: "pre-wrap" }}>{opt.notes}</p>}

      {meal.groups.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {meal.groups.map((g) => (
              <button
                key={g.group}
                type="button"
                onClick={() => setOpenGroup(openGroup === g.group ? null : g.group)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 20,
                  fontSize: 13,
                  border: "1px solid var(--pt-line)",
                  background: openGroup === g.group ? "var(--pt-bg-card-alt)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <strong>{g.count}</strong> × {g.label} {openGroup === g.group ? "▴" : "▾"}
              </button>
            ))}
          </div>
          {openGroup && (
            <div className="portal-card-alt" style={{ marginTop: 8, padding: 12 }}>
              <div className="portal-kicker">1 intercambio de {meal.groups.find((g) => g.group === openGroup)?.label.toLowerCase()} =</div>
              <EquivalentsList items={equivalents[openGroup] ?? []} />
            </div>
          )}
          {meal.notes && <p style={{ fontSize: 12, color: "var(--pt-ink-2)", marginTop: 8 }}>{meal.notes}</p>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {state === "pending" ? (
          <>
            <button type="button" disabled={pending} onClick={() => onMark("done", opt?.id ?? null)} style={btn("var(--pt-ink)", "#fff")}>
              ✓ Lo cumplí
            </button>
            <button type="button" disabled={pending} onClick={() => onMark("missed")} style={btn("transparent", "var(--pt-ink-2)", "var(--pt-line)")}>
              No lo cumplí
            </button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: state === "done" ? "var(--pt-green)" : "var(--pt-red)", alignSelf: "center" }}>
              {state === "done"
                ? `✓ Cumplido${meal.options.length > 1 ? ` · ${meal.options.find((o) => o.id === check?.optionId)?.label ?? ""}` : ""}`
                : "✗ No cumplido"}
            </div>
            <button type="button" disabled={pending} onClick={() => onMark(null)} style={{ ...btn("transparent", "var(--pt-ink-3)", "var(--pt-line)"), flex: "none" }}>
              Deshacer
            </button>
          </>
        )}
      </div>

      {state === "done" && check?.optionId && meal.options.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {diaryMsg ? (
            <span style={{ fontSize: 12, color: "var(--pt-green)" }}>{diaryMsg}</span>
          ) : (
            <button
              type="button"
              disabled={adding}
              onClick={() =>
                startAdd(async () => {
                  try {
                    const r = await addPlanOptionToDiary({ mealKey: meal.key, optionId: check.optionId! });
                    setDiaryMsg(r.added ? "Agregado a tu diario ✓" : "Ya estaba en tu diario");
                  } catch (e) {
                    setDiaryMsg(e instanceof Error ? e.message : "No se pudo agregar.");
                  }
                })
              }
              style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--pt-ink-2)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
            >
              + Agregar esta comida a mi diario de calorías
            </button>
          )}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {sent ? (
          <p style={{ fontSize: 12, color: "var(--pt-green)" }}>Enviado a tu nutricionista ✓</p>
        ) : commenting ? (
          <div style={{ display: "grid", gap: 6 }}>
            <textarea
              autoFocus
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={`¿Algo sobre ${meal.label.toLowerCase()}? (no me gustó, lo cambié por…, tuve hambre…)`}
              style={{ width: "100%", borderRadius: 10, border: "1px solid var(--pt-line)", padding: 8, fontSize: 13, fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                disabled={sending || !comment.trim()}
                onClick={() =>
                  startSend(async () => {
                    await sendNutritionMessage({ body: comment, mealKey: meal.key });
                    setSent(true);
                    setCommenting(false);
                  })
                }
                style={btn("var(--pt-ink)", "#fff")}
              >
                {sending ? "Enviando…" : "Enviar a mi nutricionista"}
              </button>
              <button type="button" onClick={() => setCommenting(false)} style={{ ...btn("transparent", "var(--pt-ink-3)", "var(--pt-line)"), flex: "none" }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCommenting(true)}
            style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "var(--pt-ink-3)", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
          >
            Comentar esta comida
          </button>
        )}
      </div>
    </section>
  );
}

/** Today's plan as tappable blocks; marking recomputes the day's semáforo. */
export function PlanToday({
  day,
  initialChecks,
  equivalents,
}: {
  day: VmDay;
  initialChecks: Record<string, Check>;
  equivalents: Partial<Record<ExchangeGroup, Equivalent[]>>;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState(initialChecks);
  const [pending, startTransition] = useTransition();

  const summary = adherenceFromChecks(
    day.meals.map((m) => m.key),
    Object.entries(checks).map(([mealKey, c]) => ({ mealKey, ate: c.ate })),
  );
  const level: AdherenceLevel | null = summary.level;

  function mark(mealKey: string, status: "done" | "missed" | null, optionId?: string | null) {
    const prev = checks;
    const next = { ...checks };
    if (status === null) delete next[mealKey];
    else next[mealKey] = { ate: status === "done", optionId: optionId ?? null, freeText: null };
    setChecks(next);
    startTransition(async () => {
      try {
        await markPlanMeal({ mealKey, status, optionId });
        router.refresh();
      } catch {
        setChecks(prev);
      }
    });
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 2px 12px" }}>
        <div style={{ fontSize: 13, color: "var(--pt-ink-2)" }}>
          {summary.followed} de {day.meals.length} comidas cumplidas · ≈{day.kcal} kcal
        </div>
        {level && (
          <span className="portal-status-pill" style={{ background: `${ADHERENCE_META[level].color}22`, color: ADHERENCE_META[level].color }}>
            {ADHERENCE_META[level].emoji} {summary.pct}%
          </span>
        )}
      </div>
      {day.meals.map((m) => (
        <MealBlock
          key={m.key}
          meal={m}
          check={checks[m.key]}
          equivalents={equivalents}
          pending={pending}
          onMark={(status, optionId) => mark(m.key, status, optionId)}
        />
      ))}
    </div>
  );
}
