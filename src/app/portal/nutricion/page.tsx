import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/portal/portal-shell";
import { MealCheck } from "@/components/portal/MealCheck";
import { NextAppointmentCard } from "@/components/portal/next-appointment-card";
import { PlanToday, type Check } from "@/components/portal/nutrition/plan-today";
import { PlanFull } from "@/components/portal/nutrition/plan-full";
import { NutritionChat } from "@/components/portal/nutrition/nutrition-chat";
import { buildDay, type VmDay } from "@/components/portal/nutrition/view-model";
import { getNextNutritionAppointment } from "@/lib/portal/nutrition-appointment";
import { getCurrentPlanForMember, getDayChecks, getExchangeEquivalents } from "@/lib/portal/nutrition-plan";
import { shortDate } from "@/lib/portal/format";
import { isoWeekday } from "@/lib/nutrition/adherence";
import { menuDayFor } from "@/lib/nutrition/plan-schema";
import { MEAL_LABEL, isMealKey } from "@/lib/nutrition/meals";
import type { ExchangeGroup } from "@/lib/nutrition/exchanges";
import { ecuadorDateString, todayDateUtc } from "@/lib/timezone";
import { DiaryView } from "@/components/portal/nutrition/diary-view";
import { DiaryProgress } from "@/components/portal/nutrition/diary-progress";
import { getDiaryDay, getDiaryHistory } from "@/lib/portal/food-diary";
import { addDays } from "@/lib/nutrition/appointments";
import { ageFrom } from "@/lib/nutrition/calc";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "hoy", label: "Hoy" },
  { key: "diario", label: "Diario" },
  { key: "progreso", label: "Progreso" },
  { key: "plan", label: "Mi plan" },
  { key: "recetas", label: "Recetas" },
  { key: "chat", label: "Nutricionista" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function NutricionPage({ searchParams }: { searchParams: Promise<{ tab?: string; fecha?: string }> }) {
  const { member } = await requireMember();
  const { tab: rawTab, fecha } = await searchParams;
  const tab: Tab = (TABS.find((t) => t.key === rawTab)?.key ?? "hoy") as Tab;

  const today = ecuadorDateString();
  const todayUtc = todayDateUtc();

  const [focus, plan, nextAppt, unread, nutritionist] = await Promise.all([
    prisma.nutritionFocus.findUnique({ where: { memberId: member.id } }),
    getCurrentPlanForMember(member.id),
    getNextNutritionAppointment(member.id),
    prisma.nutritionMessage.count({ where: { memberId: member.id, author: "STAFF", readAt: null } }),
    prisma.user.findFirst({ where: { active: true, role: "NUTRITIONIST" }, orderBy: { createdAt: "asc" }, select: { fullName: true } }),
  ]);
  const staffName = nutritionist?.fullName.split(" ")[0] ?? "tu nutricionista";
  const content = plan?.content ?? null;

  // Days of the plan as view models (MENU per-day → 7; otherwise one).
  const days: VmDay[] = content
    ? content.kind === "MENU" && content.days.length > 1
      ? content.days.map((d) => buildDay(content, d))
      : [buildDay(content, content.kind === "MENU" ? content.days[0] ?? null : null)]
    : [];
  const todayDay = content ? buildDay(content, content.kind === "MENU" ? menuDayFor(content, isoWeekday(today)) : null) : null;
  const todayIndex = Math.max(0, days.findIndex((d) => d.day === isoWeekday(today)));

  const needsEquivalents = content?.kind === "EXCHANGES" && (tab === "hoy" || tab === "plan");
  const groups = needsEquivalents
    ? ([...new Set(content!.exchanges.flatMap((e) => Object.keys(e.groups)))] as ExchangeGroup[])
    : [];

  const [checks, equivalents, tips, messages, recipes] = await Promise.all([
    tab === "hoy" && plan ? getDayChecks(member.id, todayUtc) : Promise.resolve(null),
    needsEquivalents ? getExchangeEquivalents(groups) : Promise.resolve({}),
    tab === "hoy"
      ? prisma.nutritionTip.findMany({
          where: { active: true, OR: [{ sede: member.sede }, { sede: null }] },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    tab === "chat"
      ? prisma.nutritionMessage.findMany({ where: { memberId: member.id }, orderBy: { createdAt: "asc" }, take: 200 })
      : Promise.resolve([]),
    tab === "recetas"
      ? prisma.recipe.findMany({
          where: { active: true, status: "PUBLISHED" },
          orderBy: { title: "asc" },
          select: { id: true, title: true, description: true, kcal: true, proteinG: true, carbsG: true, fatG: true, servings: true, prepMinutes: true, mealKeys: true, tags: true, instructions: true, ingredients: { orderBy: { sortOrder: "asc" }, select: { label: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Diary: any day from 30 days back (editable only the last week) up to today.
  const diaryDate =
    fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= today && fecha >= addDays(today, -30) ? fecha : today;
  const [diary, history, bodyComps] = await Promise.all([
    tab === "diario" ? getDiaryDay(member.id, diaryDate, diaryDate === today) : Promise.resolve(null),
    tab === "progreso" ? getDiaryHistory(member.id, todayUtc, 30) : Promise.resolve(null),
    tab === "diario"
      ? prisma.bodyComposition.findMany({
          where: { memberId: member.id },
          orderBy: { measuredAt: "desc" },
          take: 12,
          select: { weightKg: true, heightCm: true, bodyFatPct: true, basalMetabolism: true },
        })
      : Promise.resolve([]),
  ]);
  const progressTarget = tab === "progreso" ? (await getDiaryDay(member.id, today, false)).target : null;
  const latest = <K extends keyof (typeof bodyComps)[number]>(k: K) => bodyComps.find((b) => b[k] !== null)?.[k] ?? null;
  const storedTargetSource =
    tab === "diario"
      ? (await prisma.nutritionTarget.findUnique({ where: { memberId: member.id }, select: { source: true } }))?.source ?? null
      : null;

  const initialChecks: Record<string, Check> = Object.fromEntries(
    (checks?.entries ?? []).map((e) => [e.mealKey, { ate: e.ate, optionId: e.optionId, freeText: e.freeText }]),
  );

  return (
    <PortalShell avatarInitial={member.firstName.charAt(0).toUpperCase()}>
      <div style={{ marginBottom: 14 }}>
        <div className="portal-kicker">Nutrición</div>
        <h2 className="portal-title">
          Mi <em>nutrición</em>
        </h2>
      </div>

      <nav style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "hoy" ? "/portal/nutricion" : `/portal/nutricion?tab=${t.key}`}
            style={{
              padding: "7px 14px",
              borderRadius: 20,
              fontSize: 13,
              whiteSpace: "nowrap",
              border: "1px solid var(--pt-line)",
              background: tab === t.key ? "var(--pt-ink)" : "var(--pt-bg-card)",
              color: tab === t.key ? "#fff" : "var(--pt-ink-2)",
              textDecoration: "none",
            }}
          >
            {t.label}
            {t.key === "chat" && unread > 0 && (
              <span style={{ marginLeft: 6, background: "var(--pt-red)", color: "#fff", borderRadius: 10, padding: "0 6px", fontSize: 11 }}>
                {unread}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {tab === "hoy" && (
        <>
          {nextAppt && <NextAppointmentCard appointment={nextAppt} />}
          {focus && (
            <section className="portal-card" style={{ marginBottom: 14, borderLeft: "3px solid var(--pt-green, #16a34a)" }}>
              <div className="portal-kicker">Prioridad de la semana</div>
              <div style={{ fontSize: 14, color: "var(--pt-ink-1)", marginTop: 6, whiteSpace: "pre-wrap" }}>{focus.message}</div>
              <div style={{ fontSize: 11, color: "var(--pt-ink-3)", marginTop: 8 }}>
                Actualizado {shortDate(focus.updatedAt)} · {staffName}
              </div>
            </section>
          )}

          {!plan ? (
            <div className="portal-card">
              <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>
                Tu nutricionista aún no ha compartido un plan. Cuando lo haga, aparecerá aquí.
              </p>
            </div>
          ) : content && todayDay ? (
            <>
              <div className="portal-section-title" style={{ marginTop: 4 }}>
                <h4>Tu plan de hoy</h4>
                <Link href="/portal/nutricion?tab=plan" className="portal-section-link">
                  Ver plan completo
                </Link>
              </div>
              <PlanToday day={todayDay} initialChecks={initialChecks} equivalents={equivalents} />
            </>
          ) : (
            // Link-only plan (Google Doc): keep the manual semáforo.
            <section className="portal-card">
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <div className="portal-kicker">Tu plan</div>
                {plan.calorieTarget && <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>{plan.calorieTarget} kcal/día</div>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 2 }}>{plan.title}</div>
              {plan.externalUrl && (
                <a
                  href={plan.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "inline-block", marginTop: 6, fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}
                >
                  Ver mi plan alimenticio →
                </a>
              )}
              <MealCheck initialAdherence={checks?.adherence ?? null} initialFreeText={checks?.freeText ?? null} />
            </section>
          )}

          {tips.length > 0 && (
            <>
              <div className="portal-section-title" style={{ marginTop: 20 }}>
                <h4>Cápsulas de nutrición</h4>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {tips.map((t) => (
                  <div key={t.id} className="portal-card">
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</div>
                    <div style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 4, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{t.body}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "diario" && diary && (
        <DiaryView
          day={diary}
          today={today}
          targetLocked={diary.target?.source === "PLAN" || storedTargetSource === "NUTRITIONIST"}
          prefill={{
            sex: member.sex,
            ageYears: member.dateOfBirth ? ageFrom(member.dateOfBirth) : null,
            weightKg: latest("weightKg") as number | null,
            heightCm: latest("heightCm") as number | null,
            bodyFatPct: latest("bodyFatPct") as number | null,
            measuredBmr: latest("basalMetabolism") as number | null,
          }}
        />
      )}

      {tab === "progreso" && history && (
        <DiaryProgress
          days={history.days}
          weights={history.weights}
          targetKcal={progressTarget?.kcal ?? null}
          targetProtein={progressTarget?.proteinG ?? null}
        />
      )}

      {tab === "plan" &&
        (!plan ? (
          <div className="portal-card">
            <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>Aún no tienes un plan publicado.</p>
          </div>
        ) : content ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "0 2px 12px" }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{plan.title}</div>
              <div style={{ fontSize: 12, color: "var(--pt-ink-3)" }}>
                {Math.round(content.targets.kcal)} kcal · P {content.targets.proteinG} g
              </div>
            </div>
            <PlanFull
              days={days}
              todayIndex={todayIndex}
              kind={content.kind}
              notes={content.notes ?? null}
              recommendations={content.recommendations}
              equivalents={equivalents}
            />
          </>
        ) : (
          <div className="portal-card">
            <div style={{ fontSize: 15, fontWeight: 500 }}>{plan.title}</div>
            {plan.externalUrl && (
              <a href={plan.externalUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, textDecoration: "underline" }}>
                Ver plan alimenticio →
              </a>
            )}
          </div>
        ))}

      {tab === "recetas" && (
        <div style={{ display: "grid", gap: 10 }}>
          {recipes.length === 0 ? (
            <div className="portal-card">
              <p style={{ fontSize: 13, color: "var(--pt-ink-2)", margin: 0 }}>Pronto: el recetario de La Cueva.</p>
            </div>
          ) : (
            recipes.map((r) => (
              <details key={r.id} className="portal-card">
                <summary style={{ cursor: "pointer", listStyle: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{r.title}</span>
                    <span style={{ fontSize: 12, color: "var(--pt-ink-3)", whiteSpace: "nowrap" }}>{Math.round(r.kcal)} kcal</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pt-ink-3)", marginTop: 2 }}>
                    P {r.proteinG} · C {r.carbsG} · G {r.fatG} por porción
                    {r.mealKeys.filter(isMealKey).length > 0 && ` · ${r.mealKeys.filter(isMealKey).map((k) => MEAL_LABEL[k]).join(", ")}`}
                  </div>
                </summary>
                {r.description && <p style={{ fontSize: 13, color: "var(--pt-ink-2)", marginTop: 10 }}>{r.description}</p>}
                <div className="portal-kicker" style={{ marginTop: 10 }}>
                  Ingredientes {r.servings > 1 ? `(${r.servings} porciones)` : ""}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, display: "grid", gap: 2 }}>
                  {r.ingredients.map((i, k) => (
                    <li key={k}>{i.label}</li>
                  ))}
                </ul>
                <div className="portal-kicker" style={{ marginTop: 10 }}>
                  Preparación {r.prepMinutes ? `· ${r.prepMinutes} min` : ""}
                </div>
                <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.5 }}>{r.instructions}</p>
              </details>
            ))
          )}
        </div>
      )}

      {tab === "chat" && (
        <NutritionChat
          staffName={staffName}
          messages={messages.map((m) => ({
            id: m.id,
            author: m.author,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            mealLabel: m.mealKey && isMealKey(m.mealKey) ? MEAL_LABEL[m.mealKey] : null,
          }))}
        />
      )}
    </PortalShell>
  );
}
