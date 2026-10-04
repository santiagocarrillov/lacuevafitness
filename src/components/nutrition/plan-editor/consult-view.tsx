"use client";

// "Modo consulta": the nutritionist sits with the socio and builds their usual
// day out loud. Big numbers the socio can read across the desk, a "+124 kcal"
// flash every time something is added (the egg fried in oil…), one-tap hidden
// calories, and the day copied to the whole week at the end. Same plan content
// as the full editor — this is just another way to fill it.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { FoodPicker } from "@/components/nutrition/food-picker";
import { publishMemberPlan, saveMemberPlanDraft } from "@/lib/actions/meal-plans";
import {
  WEEKDAY_LABEL,
  emptyOption,
  enabledMeals,
  newOptionId,
  optionTotals,
  type MenuDay,
  type PlanContent,
  type PlanItem,
  type PlanTargets,
} from "@/lib/nutrition/plan-schema";
import { MEAL_LABEL, type MealKey } from "@/lib/nutrition/meals";
import { foodToItem, setItemAmount } from "./item-adder";

export type QuickExtra = { label: string; item: PlanItem };

const COLORS = { protein: "#e5533f", carbs: "#d97e0a", fat: "#3a8fd1" };
const r0 = (n: number) => Math.round(n);

function Ring({ value, target }: { value: number; target: number }) {
  const pct = target > 0 ? value / target : 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const over = pct > 1.1;
  const color = over ? "#e5533f" : pct >= 0.9 ? "#2f855a" : "#3a8fd1";
  return (
    <svg viewBox="0 0 128 128" className="size-36 shrink-0" role="img" aria-label={`${r0(value)} de ${r0(target)} kcal`}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="#ecebe8" strokeWidth="12" />
      <circle
        cx="64" cy="64" r={R} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${Math.min(1, pct) * C} ${C}`} transform="rotate(-90 64 64)" style={{ transition: "stroke-dasharray .5s ease" }}
      />
      <text x="64" y="60" textAnchor="middle" className="fill-stone-900 text-[26px] font-bold tabular-nums">{r0(value).toLocaleString("es-EC")}</text>
      <text x="64" y="80" textAnchor="middle" className="fill-stone-500 text-[11px]">de {r0(target).toLocaleString("es-EC")} kcal</text>
    </svg>
  );
}

function MacroBar({ label, grams, target, color }: { label: string; grams: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (grams / target) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums"><b className="text-lg">{r0(grams)}</b> <span className="text-muted-foreground">/ {r0(target)} g</span></span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

/** Share of the day's calories from each macro. */
function Split({ p, c, f }: { p: number; c: number; f: number }) {
  const total = p * 4 + c * 4 + f * 9 || 1;
  const parts = [
    { label: "Proteína", v: (p * 4) / total, color: COLORS.protein },
    { label: "Carbohidratos", v: (c * 4) / total, color: COLORS.carbs },
    { label: "Grasa", v: (f * 9) / total, color: COLORS.fat },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {parts.map((x) => <div key={x.label} style={{ width: `${x.v * 100}%`, backgroundColor: x.color, transition: "width .5s ease" }} />)}
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        {parts.map((x) => <span key={x.label}><span className="mr-1 inline-block size-2 rounded-full" style={{ backgroundColor: x.color }} />{x.label} {Math.round(x.v * 100)}%</span>)}
      </div>
    </div>
  );
}

export function ConsultView(props: {
  id: string;
  title: string;
  member: { id: string; name: string };
  memberTarget: PlanTargets | null;
  content: PlanContent;
  published: boolean;
  extras: QuickExtra[];
}) {
  const router = useRouter();
  const [content, setContent] = useState<PlanContent>(props.content);
  const [saved, setSaved] = useState(JSON.stringify(props.content));
  const [dayIdx, setDayIdx] = useState(0);
  const keys = enabledMeals(content);
  const [active, setActive] = useState<MealKey>(keys[0]);
  // How much one "unit" weighs for each item: the amount it was added with.
  const units = useRef(new Map<string, number>());
  const [flash, setFlash] = useState<{ n: number; key: number } | null>(null);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(content) !== saved;
  const targets = content.targets.kcal > 0 ? content.targets : props.memberTarget ?? content.targets;

  const day: MenuDay = useMemo(() => {
    const d = content.days[Math.min(dayIdx, content.days.length - 1)] ?? { day: "ALL" as const, meals: [] };
    return { ...d, meals: keys.map((k) => d.meals.find((m) => m.key === k) ?? { key: k, options: [emptyOption()] }) };
  }, [content.days, dayIdx, keys]);

  const mealTotals = (k: MealKey) => optionTotals(day.meals.find((m) => m.key === k)!.options[0] ?? emptyOption());
  const totals = keys.reduce(
    (a, k) => {
      const t = mealTotals(k);
      return { kcal: a.kcal + t.kcal, proteinG: a.proteinG + t.proteinG, carbsG: a.carbsG + t.carbsG, fatG: a.fatG + t.fatG };
    },
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  // The "+124 kcal" flash: compare with the previous total of the same day.
  const prev = useRef({ kcal: totals.kcal, day: dayIdx });
  useEffect(() => {
    const diff = Math.round(totals.kcal - prev.current.kcal);
    if (prev.current.day === dayIdx && diff !== 0) setFlash({ n: diff, key: Date.now() });
    prev.current = { kcal: totals.kcal, day: dayIdx };
  }, [totals.kcal, dayIdx]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(t);
  }, [flash]);

  function setItems(k: MealKey, fn: (items: PlanItem[]) => PlanItem[]) {
    setContent((c) => {
      const days = c.days.length ? [...c.days] : [{ day: "ALL" as const, meals: [] }];
      const i = Math.min(dayIdx, days.length - 1);
      const d = days[i];
      const meals = keys.map((key) => d.meals.find((m) => m.key === key) ?? { key, options: [emptyOption()] });
      days[i] = {
        ...d,
        meals: meals.map((m) => {
          if (m.key !== k) return m;
          const [first, ...rest] = m.options.length ? m.options : [emptyOption()];
          return { ...m, options: [{ ...first, items: fn(first.items) }, ...rest] };
        }),
      };
      return { ...c, days };
    });
  }

  const add = (k: MealKey, item: PlanItem) => setItems(k, (items) => [...items, item]);

  function step(k: MealKey, idx: number, dir: 1 | -1) {
    setItems(k, (items) =>
      items.flatMap((it, i) => {
        if (i !== idx) return [it];
        const amount = (it.recipeId ? it.servings : it.grams) ?? 0;
        const key = `${k}|${it.name}`;
        const unit = units.current.get(key) ?? amount;
        units.current.set(key, unit);
        const next = Math.round((amount + dir * unit) * 10) / 10;
        return next <= 0 ? [] : [setItemAmount(it, next)];
      }),
    );
  }

  function copyToWeek() {
    if (content.days.length === 1 && content.days[0].day === "ALL") {
      toast.success("Este menú ya es el mismo para todos los días. Para cambiar algunos días, usa «Personalizar por día».");
      return;
    }
    if (!confirm(`¿Copiar el ${WEEKDAY_LABEL[day.day as number]?.toLowerCase()} a todos los días?`)) return;
    setContent((c) => ({
      ...c,
      days: c.days.map((d) =>
        d.day === day.day ? d : { day: d.day, meals: day.meals.map((m) => ({ key: m.key, options: m.options.map((o) => ({ ...o, id: newOptionId(), items: o.items.map((x) => ({ ...x })) })) })) },
      ),
    }));
  }

  function perDay() {
    const base = day;
    setContent((c) => ({
      ...c,
      days: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ day: n, meals: base.meals.map((m) => ({ key: m.key, options: m.options.map((o) => ({ ...o, id: newOptionId(), items: o.items.map((x) => ({ ...x })) })) })) })),
    }));
    setDayIdx(0);
    toast.success("Ahora cada día es editable: cambia solo lo que difiere.");
  }

  function save(publish: boolean) {
    start(async () => {
      try {
        const input = { title: props.title, content };
        if (publish) await publishMemberPlan(props.id, input);
        else await saveMemberPlanDraft(props.id, input);
        setSaved(JSON.stringify(content));
        toast.success(publish ? `Publicado: ${props.member.name} ya lo ve en su app.` : "Guardado.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      }
    });
  }

  if (content.kind !== "MENU") {
    return (
      <div className="rounded-xl border bg-white p-8 text-center text-sm">
        El modo consulta es para planes de menú. Este plan es de intercambios.{" "}
        <Link href={`/dashboard/nutricion/planes/socio/${props.id}`} className="font-medium text-primary hover:underline">Abrir el editor</Link>
      </div>
    );
  }

  const perDayPlan = !(content.days.length === 1 && content.days[0].day === "ALL");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/dashboard/nutricion/planes/socio/${props.id}`} className="text-xs text-muted-foreground hover:underline">← Editor completo</Link>
          <h2 className="text-2xl font-semibold tracking-tight">Un día de {props.member.name.split(" ")[0]}</h2>
          <p className="text-sm text-muted-foreground">Pregunta qué come en un día normal y agrégalo comida por comida. {dirty && <span className="text-amber-700">● sin guardar</span>}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending || !dirty} onClick={() => save(false)} className="rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-40">Guardar</button>
          <button type="button" disabled={pending} onClick={() => save(true)} className="rounded-full bg-[#2f855a] px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
            {props.published ? "Publicar cambios" : "Publicar al socio"}
          </button>
        </div>
      </header>

      {/* Scoreboard: readable across the desk */}
      <section className="sticky top-2 z-10 grid items-center gap-5 rounded-2xl border border-stone-200 bg-white/95 p-5 shadow-sm backdrop-blur md:grid-cols-[auto_1fr_1fr]">
        <div className="relative flex justify-center">
          <Ring value={totals.kcal} target={targets.kcal} />
          {flash && (
            <span key={flash.key} className={`absolute -top-2 right-0 animate-bounce rounded-full px-3 py-1 text-base font-bold text-white shadow ${flash.n > 0 ? "bg-[#e5533f]" : "bg-[#2f855a]"}`}>
              {flash.n > 0 ? "+" : ""}{flash.n} kcal
            </span>
          )}
        </div>
        <div className="space-y-2.5">
          <MacroBar label="Proteína" grams={totals.proteinG} target={targets.proteinG} color={COLORS.protein} />
          <MacroBar label="Carbohidratos" grams={totals.carbsG} target={targets.carbsG} color={COLORS.carbs} />
          <MacroBar label="Grasa" grams={totals.fatG} target={targets.fatG} color={COLORS.fat} />
        </div>
        <div className="space-y-3">
          <Split p={totals.proteinG} c={totals.carbsG} f={totals.fatG} />
          <p className="text-sm">
            {totals.kcal > targets.kcal * 1.1
              ? <span className="font-medium text-[#e5533f]">{r0(totals.kcal - targets.kcal)} kcal por encima de su meta</span>
              : totals.kcal < targets.kcal * 0.9
                ? <span className="text-muted-foreground">Le faltan {r0(targets.kcal - totals.kcal)} kcal para su meta</span>
                : <span className="font-medium text-[#2f855a]">Dentro de su meta</span>}
          </p>
        </div>
      </section>

      {perDayPlan && (
        <div className="flex flex-wrap items-center gap-1">
          {content.days.map((d, i) => (
            <button key={String(d.day)} type="button" onClick={() => setDayIdx(i)} className={`rounded-full px-3 py-1 text-sm ${i === dayIdx ? "bg-stone-900 text-white" : "bg-white text-muted-foreground"}`}>
              {WEEKDAY_LABEL[d.day as number]?.slice(0, 3)}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          {keys.map((k) => {
            const meal = day.meals.find((m) => m.key === k)!;
            const items = meal.options[0]?.items ?? [];
            const t = mealTotals(k);
            const slot = content.meals.find((m) => m.key === k);
            const isActive = active === k;
            return (
              <section key={`${dayIdx}-${k}`} onClick={() => setActive(k)} className={`rounded-2xl border bg-white p-4 transition ${isActive ? "border-[#2f855a] ring-2 ring-[#2f855a]/20" : "border-stone-200"}`}>
                <header className="mb-2 flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{slot?.label || MEAL_LABEL[k]}{slot?.time && <span className="ml-2 text-sm font-normal text-muted-foreground">{slot.time}</span>}</h3>
                  <span className="text-lg font-semibold tabular-nums">{r0(t.kcal)} <span className="text-sm font-normal text-muted-foreground">kcal</span></span>
                </header>
                {items.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">¿Qué come en {(slot?.label || MEAL_LABEL[k]).toLowerCase()}?</p>
                ) : (
                  <ul className="divide-y">
                    {items.map((it, i) => (
                      <li key={`${it.name}-${i}`} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{it.name}</p>
                          <p className="text-xs text-muted-foreground">{it.portionLabel ?? (it.grams ? `${it.grams} g` : `${it.servings} porción`)} · P {r0(it.proteinG)} · C {r0(it.carbsG)} · G {r0(it.fatG)}</p>
                        </div>
                        <span className="w-16 text-right font-semibold tabular-nums">{r0(it.kcal)}</span>
                        <span className="flex gap-1">
                          <button type="button" aria-label="Menos" onClick={() => step(k, i, -1)} className="rounded-full border p-1.5 hover:bg-stone-50"><Minus className="size-3.5" /></button>
                          <button type="button" aria-label="Más" onClick={() => step(k, i, 1)} className="rounded-full border p-1.5 hover:bg-stone-50"><Plus className="size-3.5" /></button>
                          <button type="button" aria-label="Quitar" onClick={() => setItems(k, (xs) => xs.filter((_, j) => j !== i))} className="rounded-full border p-1.5 text-red-700 hover:bg-red-50"><Trash2 className="size-3.5" /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {isActive && (
                  <div className="mt-2">
                    <FoodPicker placeholder="Escribe un alimento: huevo, arroz, pan…" autoFocus onPick={(f) => add(k, foodToItem(f))} />
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-56 lg:self-start">
          <section className="rounded-2xl border border-stone-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Calorías escondidas</h3>
            <p className="mb-2 text-xs text-muted-foreground">¿Con aceite? ¿Con azúcar? Se suma a {(content.meals.find((m) => m.key === active)?.label || MEAL_LABEL[active]).toLowerCase()}.</p>
            <div className="flex flex-wrap gap-1.5">
              {props.extras.map((x) => (
                <button key={x.label} type="button" onClick={() => add(active, { ...x.item })} className="rounded-full border border-stone-300 px-2.5 py-1 text-xs hover:border-[#e5533f] hover:bg-[#e5533f]/5">
                  + {x.label} <b className="text-[#e5533f]">{x.item.kcal}</b>
                </button>
              ))}
            </div>
          </section>
          <section className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
            <h3 className="font-semibold">Al terminar el día</h3>
            <button type="button" onClick={copyToWeek} className="w-full rounded-lg border px-3 py-2 text-left hover:bg-stone-50">Usar este día para toda la semana</button>
            {!perDayPlan && <button type="button" onClick={perDay} className="w-full rounded-lg border px-3 py-2 text-left hover:bg-stone-50">Personalizar por día</button>}
            <Link href={`/dashboard/nutricion/planes/socio/${props.id}`} onClick={(e) => { if (dirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) e.preventDefault(); }} className="block rounded-lg border px-3 py-2 hover:bg-stone-50">
              Sugerir opciones e indicaciones (editor completo)
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
