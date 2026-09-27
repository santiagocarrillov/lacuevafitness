/**
 * Datos demo de nutrición en la ficha de UN socio (pensado para la de Santiago), para grabar
 * el video de cómo funciona la app: plan publicado hace 3 semanas (desde la plantilla
 * "Semana tipo SRXFIT 2000 kcal"), meta nutricional, semáforo diario, diario de comidas,
 * pesajes propios, conversación con la nutricionista, prioridad de la semana, una cita
 * atendida y otra próxima, y una receta propia.
 *
 * Seguridad:
 *   - Solo escribe si el socio NO tiene ya datos de nutrición (no mezcla demo con datos reales).
 *   - --undo borra TODA la nutrición de ese socio (plan, semáforo, diario, chat, meta, prioridad,
 *     citas, recetas propias) y sus pesajes MEMBER sin verificar creados por este script.
 *   - Nada manda push/WhatsApp: se escribe directo en la base. Los mensajes del socio quedan
 *     leídos para no aparecer como pendientes en la bandeja de la nutricionista.
 *   - Ojo: la cita futura SÍ generará el recordatorio push normal (solo al socio) el día anterior.
 *
 * Uso:
 *   npx tsx scripts/seed-demo-nutricion.ts --member <email|id>            # dry run
 *   npx tsx scripts/seed-demo-nutricion.ts --member <email|id> --write
 *   npx tsx scripts/seed-demo-nutricion.ts --member <email|id> --undo --write
 */
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { adherenceFromChecks, isoWeekday } from "../src/lib/nutrition/adherence";
import { enabledMeals, menuDayFor, optionTotals, parsePlanContent, type PlanOption } from "../src/lib/nutrition/plan-schema";
import { normalizeSearch } from "../src/lib/nutrition/nutrients";
import { ecuadorDateAt, ecuadorDateString } from "../src/lib/timezone";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const WRITE = process.argv.includes("--write");
const UNDO = process.argv.includes("--undo");
const MEMBER = arg("--member");
const TEMPLATE = "Semana tipo SRXFIT 2000 kcal";
const DAYS = 21; // plan published 3 weeks ago
const DIARY_DAYS = 14; // detailed diary for the last 2 weeks
const DEMO_NOTE = "Demo para el video de la app (scripts/seed-demo-nutricion.ts).";

const DAY_MS = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;
const dayUtc = (ds: string) => new Date(`${ds}T00:00:00Z`);
const addDays = (ds: string, n: number) => new Date(dayUtc(ds).getTime() + n * DAY_MS).toISOString().slice(0, 10);

// Deterministic "random" so re-runs produce the same demo.
let seed = 20260927;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
};

async function main() {
  if (!MEMBER) throw new Error("Falta --member <email|id>");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }) });
  const member = await prisma.member.findFirst({
    where: MEMBER.includes("@") ? { email: MEMBER } : { id: MEMBER },
    select: { id: true, firstName: true, lastName: true, sede: true },
  });
  if (!member) throw new Error(`No encontré el socio ${MEMBER}`);
  const m = member.id;
  console.log(`Socio: ${member.firstName} ${member.lastName} (${m})`);

  const counts = {
    planes: await prisma.mealPlan.count({ where: { memberId: m } }),
    semaforo: await prisma.mealLog.count({ where: { memberId: m } }),
    diario: await prisma.foodLogEntry.count({ where: { memberId: m } }),
    mensajes: await prisma.nutritionMessage.count({ where: { memberId: m } }),
    meta: await prisma.nutritionTarget.count({ where: { memberId: m } }),
    prioridad: await prisma.nutritionFocus.count({ where: { memberId: m } }),
    citas: await prisma.nutritionAppointment.count({ where: { memberId: m } }),
    recetas: await prisma.recipe.count({ where: { authorMemberId: m } }),
    pesajesDemo: await prisma.bodyComposition.count({ where: { memberId: m, source: "MEMBER", notes: DEMO_NOTE } }),
  };
  console.log("Datos de nutrición actuales:", counts);

  if (UNDO) {
    if (!WRITE) return void console.log("\nDRY RUN — correr con --undo --write para borrar todo lo anterior.");
    await prisma.$transaction([
      prisma.mealLog.deleteMany({ where: { memberId: m } }), // entries cascade
      prisma.mealPlan.deleteMany({ where: { memberId: m } }),
      prisma.foodLogEntry.deleteMany({ where: { memberId: m } }),
      prisma.nutritionMessage.deleteMany({ where: { memberId: m } }),
      prisma.nutritionTarget.deleteMany({ where: { memberId: m } }),
      prisma.nutritionFocus.deleteMany({ where: { memberId: m } }),
      prisma.nutritionAppointment.deleteMany({ where: { memberId: m } }),
      prisma.recipe.deleteMany({ where: { authorMemberId: m } }),
      prisma.bodyComposition.deleteMany({ where: { memberId: m, source: "MEMBER", notes: DEMO_NOTE } }),
    ]);
    console.log("✅ Demo borrado.");
    return void (await prisma.$disconnect());
  }

  const nutritionRows = Object.entries(counts).filter(([k]) => k !== "pesajesDemo");
  if (nutritionRows.some(([, n]) => n > 0)) {
    throw new Error("Este socio ya tiene datos de nutrición: no mezclo demo con datos reales. Usa --undo primero si son del demo.");
  }

  const [template, nutritionist, foods] = await Promise.all([
    prisma.mealPlanTemplate.findFirst({ where: { name: TEMPLATE, active: true } }),
    prisma.user.findFirst({ where: { active: true, role: "NUTRITIONIST" }, orderBy: { createdAt: "asc" }, select: { id: true } }),
    prisma.food.findMany({ where: { source: "CURATED", active: true }, select: { id: true, name: true, kcal: true, proteinG: true, carbsG: true, fatG: true, fiberG: true } }),
  ]);
  const content = parsePlanContent(template?.content);
  if (!template || !content) throw new Error(`Falta la plantilla "${TEMPLATE}" — corre scripts/seed-nutricion-base.ts --write`);
  if (!nutritionist) throw new Error("No hay usuario NUTRITIONIST activo.");
  const foodBy = new Map(foods.map((f) => [normalizeSearch(f.name), f]));
  const food = (n: string) => {
    const f = foodBy.get(normalizeSearch(n));
    if (!f) throw new Error(`Falta alimento ${n}`);
    return f;
  };

  const today = ecuadorDateString();
  const start = addDays(today, -DAYS);
  const meals = enabledMeals(content);

  // ── Plan of each day: which meals were followed, with which option ──
  type Mark = { mealKey: string; ate: boolean; option: PlanOption | null; note: string | null };
  const OFF_PLAN: Record<string, { note: string; items: { food: string; grams: number; name: string; portion: string }[] }[]> = {
    lunch: [
      { note: "Almuerzo de trabajo: menestra con carne, sin jugo.", items: [{ food: "Arroz con menestra y carne asada", grams: 450, name: "Arroz con menestra y carne asada", portion: "1 plato" }] },
      { note: "Almuerzo ejecutivo: pedí solo el segundo.", items: [{ food: "Seco de pollo (presa y salsa)", grams: 250, name: "Seco de pollo", portion: "1 porción" }, { food: "Arroz blanco, cocido", grams: 158, name: "Arroz", portion: "1 taza" }] },
    ],
    dinner: [
      { note: "Cumpleaños: pizza con los amigos.", items: [{ food: "Pizza de queso", grams: 214, name: "Pizza de queso", portion: "2 porciones" }, { food: "Cerveza", grams: 355, name: "Cerveza", portion: "1 lata" }] },
      { note: "Llegué tarde, comí un sánduche.", items: [{ food: "Sánduche de jamón y queso", grams: 150, name: "Sánduche de jamón y queso", portion: "1 sánduche" }] },
    ],
    snack_am: [{ note: "Reunión larga, no alcancé.", items: [] }],
    snack_pm: [{ note: "Se me pasó, tomé solo café.", items: [{ food: "Café con leche", grams: 240, name: "Café con leche", portion: "1 taza" }] }],
  };
  const plan: { date: string; marks: Mark[] }[] = [];
  for (let i = 0; i <= DAYS; i++) {
    const date = addDays(start, i);
    const isToday = date === today;
    const wd = isoWeekday(date);
    const menu = menuDayFor(content, wd);
    const weekend = wd >= 6;
    const marks: Mark[] = [];
    for (const key of meals) {
      if (isToday && key !== "breakfast" && key !== "snack_am") continue; // today: morning only
      const opts = menu?.meals.find((x) => x.key === key)?.options ?? [];
      const missP = (weekend ? 0.22 : 0.08) + (key === "lunch" || key === "dinner" ? 0.05 : 0);
      if (rand() < missP && OFF_PLAN[key]) {
        const off = OFF_PLAN[key][Math.floor(rand() * OFF_PLAN[key].length)];
        marks.push({ mealKey: key, ate: false, option: null, note: off.note });
      } else {
        marks.push({ mealKey: key, ate: true, option: opts[rand() < 0.8 ? 0 : Math.min(1, opts.length - 1)] ?? null, note: null });
      }
    }
    plan.push({ date, marks });
  }

  // ── Diary rows from the marks (last DIARY_DAYS days incl. today) ──
  type Row = Prisma.FoodLogEntryCreateManyInput;
  const diary: Row[] = [];
  const createdAtFor = (date: string, key: string) => {
    const h: Record<string, [number, number]> = { breakfast: [7, 20], snack_am: [10, 15], lunch: [13, 30], snack_pm: [17, 10], dinner: [19, 45] };
    return ecuadorDateAt(dayUtc(date), ...h[key]);
  };
  for (const d of plan.filter((p) => p.date >= addDays(today, -(DIARY_DAYS - 1)))) {
    for (const mk of d.marks) {
      const base = { memberId: m, date: dayUtc(d.date), mealKey: mk.mealKey, createdAt: createdAtFor(d.date, mk.mealKey) };
      if (mk.ate && mk.option) {
        for (const it of mk.option.items) {
          diary.push({
            ...base,
            foodId: it.foodId ?? null,
            recipeId: it.recipeId ?? null,
            name: it.name,
            grams: it.grams ?? null,
            servings: it.servings ?? null,
            portionLabel: it.portionLabel ?? null,
            kcal: it.kcal,
            proteinG: it.proteinG,
            carbsG: it.carbsG,
            fatG: it.fatG,
            source: "PLAN",
          });
        }
      } else if (!mk.ate) {
        const off = Object.values(OFF_PLAN).flat().find((o) => o.note === mk.note);
        for (const it of off?.items ?? []) {
          const f = food(it.food);
          const k = it.grams / 100;
          diary.push({
            ...base,
            foodId: f.id,
            name: it.name,
            grams: it.grams,
            portionLabel: it.portion,
            kcal: Math.round(f.kcal * k),
            proteinG: r1(f.proteinG * k),
            carbsG: r1(f.carbsG * k),
            fatG: r1(f.fatG * k),
            fiberG: f.fiberG != null ? r1(f.fiberG * k) : null,
            source: "SEARCH",
          });
        }
      }
    }
  }

  // Stats for the nutritionist's latest message (last 7 full days).
  const last7 = diary.filter((r) => (r.date as Date) >= dayUtc(addDays(today, -7)) && (r.date as Date) < dayUtc(today));
  const avg = (k: "kcal" | "proteinG") => Math.round(last7.reduce((a, r) => a + (r[k] as number), 0) / 7);
  const levels = plan.map((d) => adherenceFromChecks(meals, d.marks).level);
  const lastWeekGreen = levels.slice(-8, -1).filter((l) => l === "GREEN").length;

  const weights = [
    { d: -DAYS, kg: 82.0 },
    { d: -14, kg: 81.5 },
    { d: -7, kg: 81.1 },
    { d: -1, kg: 80.7 },
  ];

  console.log(`\nPlan: "${TEMPLATE}" publicado el ${start}.`);
  console.log(`Semáforo: ${plan.length} días →`, levels.map((l) => (l ?? "-").charAt(0)).join(""));
  console.log(`Diario: ${diary.length} registros en ${DIARY_DAYS} días; última semana ${avg("kcal")} kcal y ${avg("proteinG")} g de proteína en promedio.`);
  console.log(`Pesajes propios: ${weights.map((w) => w.kg).join(" → ")} kg`);

  if (!WRITE) {
    console.log("\nDRY RUN — nada escrito. Correr con --write.");
    return void (await prisma.$disconnect());
  }

  const publishedAt = ecuadorDateAt(dayUtc(start), 11, 5);
  const staff = nutritionist.id;
  await prisma.$transaction(
    async (tx) => {
      await tx.nutritionTarget.create({
        data: {
          memberId: m,
          kcal: content.targets.kcal,
          proteinG: content.targets.proteinG,
          carbsG: content.targets.carbsG,
          fatG: content.targets.fatG,
          mealSplit: { breakfast: 22, snack_am: 11, lunch: 29, snack_pm: 13, dinner: 25 },
          inputs: { weightKg: 82, heightCm: 173, bodyFatPct: 22, goal: "recomposición", note: DEMO_NOTE },
          source: "NUTRITIONIST",
          updatedById: staff,
          createdAt: publishedAt,
        },
      });

      const mp = await tx.mealPlan.create({
        data: {
          memberId: m,
          title: `Plan de ${member.firstName} · Semana tipo 2.000 kcal`,
          calorieTarget: content.targets.kcal,
          content: content as unknown as Prisma.InputJsonValue,
          draftContent: content as unknown as Prisma.InputJsonValue,
          publishedAt,
          startsAt: publishedAt,
          schemaVersion: 2,
          templateId: template.id,
          source: "MANUAL",
          authoredById: staff,
          createdAt: publishedAt,
        },
        select: { id: true },
      });

      for (const d of plan) {
        const a = adherenceFromChecks(meals, d.marks);
        await tx.mealLog.create({
          data: {
            memberId: m,
            mealPlanId: mp.id,
            date: dayUtc(d.date),
            adherence: a.level,
            followed: a.level === "GREEN" || a.level === "YELLOW",
            createdAt: createdAtFor(d.date, "breakfast"),
            entries: {
              create: d.marks.map((mk) => ({
                mealKey: mk.mealKey,
                ate: mk.ate,
                optionId: mk.option?.id ?? null,
                optionLabel: mk.option?.label ?? null,
                kcal: mk.option ? optionTotals(mk.option).kcal : null,
                freeText: mk.note,
                createdAt: createdAtFor(d.date, mk.mealKey),
              })),
            },
          },
        });
      }

      await tx.foodLogEntry.createMany({ data: diary });

      await tx.bodyComposition.createMany({
        data: weights.map((w) => ({
          memberId: m,
          measuredAt: ecuadorDateAt(dayUtc(addDays(today, w.d)), 6, 45),
          weightKg: w.kg,
          source: "MEMBER" as const,
          notes: DEMO_NOTE,
        })),
      });

      const at = (d: number, h: number, min = 0) => ecuadorDateAt(dayUtc(addDays(today, d)), h, min);
      const readAt = (d: Date) => new Date(d.getTime() + 20 * 60_000);
      const thread: { d: number; h: number; min: number; author: "STAFF" | "MEMBER"; body: string; mealKey?: string; unread?: boolean }[] = [
        { d: -DAYS, h: 11, min: 10, author: "STAFF", body: `¡Hola ${member.firstName}! Ya tienes tu plan en la app: una semana tipo de 2.000 kcal con recetas de La Cueva. Cada comida tiene 2 opciones equivalentes. Marca lo que cumples y yo reviso tu semáforo cada semana.` },
        { d: -DAYS + 1, h: 12, min: 40, author: "MEMBER", body: "¡Gracias! ¿El seco de pollo lo puedo comer con arroz y maduro?", mealKey: "lunch" },
        { d: -DAYS + 1, h: 15, min: 5, author: "STAFF", body: "Uno de los dos: ½ taza de arroz o ⅓ de maduro. Si ese día entrenas pesado (sentadilla o potencia), puedes comer los dos." },
        { d: -12, h: 9, min: 15, author: "MEMBER", body: "El sábado tuve un cumpleaños y no seguí la merienda. ¿Lo compenso hoy?", mealKey: "dinner" },
        { d: -12, h: 10, min: 30, author: "STAFF", body: "No hace falta compensar. Una comida libre no arruina nada: retoma normal en la siguiente comida. Lo que cuenta es la semana, y la tuya va bien 👏" },
        { d: -1, h: 18, min: 20, author: "STAFF", unread: true, body: `Revisé tu diario: la última semana vas en ${avg("kcal").toLocaleString("es-EC")} kcal y ${avg("proteinG")} g de proteína en promedio, ${lastWeekGreen} de 7 días en verde. Bajaste 1,3 kg en 3 semanas (≈0,5 % por semana), el ritmo justo para no perder fuerza. En la cita del jueves medimos tu % de grasa.` },
      ];
      await tx.nutritionMessage.createMany({
        data: thread.map((t) => {
          const createdAt = at(t.d, t.h, t.min);
          return {
            memberId: m,
            mealPlanId: mp.id,
            mealKey: t.mealKey ?? null,
            author: t.author,
            authorUserId: t.author === "STAFF" ? staff : null,
            body: t.body,
            readAt: t.unread ? null : readAt(createdAt),
            createdAt,
          };
        }),
      });

      await tx.nutritionFocus.create({
        data: {
          memberId: m,
          message: "Esta semana: 30 g de proteína en el desayuno y 2,5 litros de agua al día. Los días de sentadilla o potencia suma ½ taza de arroz o mote después de entrenar.",
          authoredById: staff,
          createdAt: at(-1, 18, 25),
          updatedAt: at(-1, 18, 25),
        },
      });

      // Next Thursday (at least 2 days ahead) for the follow-up.
      let ahead = 2;
      while (isoWeekday(addDays(today, ahead)) !== 4) ahead++;
      await tx.nutritionAppointment.createMany({
        data: [
          { memberId: m, staffUserId: staff, sede: member.sede, startsAt: at(-DAYS, 10), durationMin: 45, kind: "INITIAL", status: "ATTENDED", notes: DEMO_NOTE, createdById: staff },
          { memberId: m, staffUserId: staff, sede: member.sede, startsAt: at(ahead, 10), durationMin: 30, kind: "FOLLOW_UP", status: "SCHEDULED", notes: DEMO_NOTE, createdById: staff },
        ],
      });

      // One recipe of his own (private) in "Mis recetas".
      const verde = food("Verde, cocido");
      const huevo = food("Huevo entero");
      const queso = food("Queso mozzarella semidescremado");
      const ing = [
        { f: verde, grams: 150, label: "1 verde cocido y majado" },
        { f: queso, grams: 30, label: "30 g de queso mozzarella light" },
        { f: huevo, grams: 100, label: "2 huevos revueltos" },
      ];
      const tot = ing.reduce(
        (a, i) => ({
          kcal: a.kcal + (i.f.kcal * i.grams) / 100,
          proteinG: a.proteinG + (i.f.proteinG * i.grams) / 100,
          carbsG: a.carbsG + (i.f.carbsG * i.grams) / 100,
          fatG: a.fatG + (i.f.fatG * i.grams) / 100,
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      );
      await tx.recipe.create({
        data: {
          title: "Mi bolón al horno",
          description: "Bolón sin fritura: el verde majado con queso se hornea y se acompaña con huevos.",
          instructions: "1. Maja el verde cocido con sal y la mitad del queso.\n2. Forma 2 bolones, rellénalos con el resto del queso y hornéalos 15 min a 200 °C.\n3. Sirve con los huevos revueltos.",
          servings: 1,
          prepMinutes: 25,
          mealKeys: ["breakfast"],
          tags: ["ecuatoriana"],
          status: "PRIVATE",
          authorMemberId: m,
          macrosFromIngredients: true,
          kcal: Math.round(tot.kcal),
          proteinG: r1(tot.proteinG),
          carbsG: r1(tot.carbsG),
          fatG: r1(tot.fatG),
          createdAt: at(-5, 21),
          ingredients: { create: ing.map((i, k) => ({ foodId: i.f.id, label: i.label, grams: i.grams, sortOrder: k })) },
        },
      });
    },
    { timeout: 120_000 },
  );

  console.log("\n✅ Demo creado.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
