"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ListPlus, MessageCircle, X } from "lucide-react";
import { setAppointmentStatus } from "@/lib/actions/nutrition-appointments";
import { createBookingLink } from "@/lib/actions/nutrition-booking";
import { QuickTaskForm, type QuickTaskBase } from "@/components/tasks/quick-task-form";
import type { PersonRef } from "@/lib/tasks/meta";
import { ACTIVITY_LEVELS, GOALS, calculateTarget, type ActivityLevel, type CalcSex, type Goal } from "@/lib/nutrition/calc";

const err = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar.");

/** Attended / no-show, right from the list. */
export function ApptStatusButtons({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const set = (status: "ATTENDED" | "NO_SHOW") =>
    start(async () => {
      try {
        await setAppointmentStatus(id, status);
        toast.success(status === "ATTENDED" ? "Marcado como atendido." : "Marcado como no vino.");
      } catch (e) {
        toast.error(err(e));
      }
    });
  return (
    <span className="flex shrink-0 gap-1">
      <button type="button" disabled={pending} title="Atendido" onClick={() => set("ATTENDED")} className="rounded-full border p-1.5 text-emerald-700 hover:bg-emerald-50">
        <Check className="size-3.5" />
      </button>
      <button type="button" disabled={pending} title="No vino" onClick={() => set("NO_SHOW")} className="rounded-full border p-1.5 text-red-700 hover:bg-red-50">
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/** Booking link by WhatsApp (from her own phone, no template needed) or staff books it. */
export function ToScheduleActions({
  memberId,
  name,
  reason,
  deadline,
  sent,
  taskBase,
}: {
  memberId: string;
  name: string;
  reason: "TRIAL" | "MEASUREMENT";
  deadline: string | null;
  sent: boolean;
  taskBase: QuickTaskBase;
}) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; text: string; whatsappUrl: string | null } | null>(null);
  const [tasking, setTasking] = useState(false);
  return (
    <>
    <div className="flex flex-wrap items-center gap-2 pl-12 text-xs">
      {link ? (
        <>
          {link.whatsappUrl ? (
            <a href={link.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#25d366] px-2.5 py-1 font-medium text-white hover:opacity-90">
              <MessageCircle className="size-3.5" /> Abrir WhatsApp
            </a>
          ) : (
            <span className="text-amber-700">Sin celular registrado</span>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 hover:bg-stone-50"
            onClick={() => navigator.clipboard.writeText(link.text).then(() => toast.success("Mensaje con el enlace copiado."))}
          >
            <Copy className="size-3.5" /> Copiar mensaje
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setLink(await createBookingLink(memberId, reason, deadline));
              } catch (e) {
                toast.error(err(e));
              }
            })
          }
          className="inline-flex items-center gap-1 rounded-full border border-[#25d366] px-2.5 py-1 font-medium text-[#128c4a] hover:bg-[#25d366]/10"
        >
          <MessageCircle className="size-3.5" /> {pending ? "Creando…" : sent ? "Reenviar enlace" : "Enviar enlace para agendar"}
        </button>
      )}
      <Link href={`/dashboard/nutricion/citas/nueva?socio=${memberId}&volver=/dashboard/nutricion`} className="text-primary hover:underline">
        Agendar yo
      </Link>
      <button type="button" onClick={() => setTasking((t) => !t)} className="text-primary hover:underline">
        Tarea
      </button>
      {sent && !link && <span className="text-muted-foreground">· enlace ya enviado</span>}
    </div>
    {tasking && (
      <InlineTaskBox
        base={taskBase}
        person={{ kind: "member", id: memberId, name }}
        initialTitle={`${reason === "TRIAL" ? "Agendar consulta inicial" : "Agendar medición"} con ${name.split(" ")[0]}`}
        onDone={() => setTasking(false)}
      />
    )}
    </>
  );
}

/** The quick task form in a soft box, refreshing the page when a task is created. */
function InlineTaskBox({
  base,
  person,
  initialTitle,
  onDone,
}: {
  base: QuickTaskBase;
  person?: PersonRef;
  initialTitle?: string;
  onDone: () => void;
}) {
  const router = useRouter();
  return (
    <div className="mt-2 rounded-lg border border-primary/30 bg-muted/30 p-2.5">
      <QuickTaskForm
        {...base}
        person={person ?? null}
        allowPersonPick={!person}
        initialTitle={initialTitle}
        onCreated={() => {
          onDone();
          router.refresh();
        }}
        onCancel={onDone}
      />
    </div>
  );
}

/** "+ Nueva tarea" at the top of "Mis tareas": the form opens right there. */
export function NewTaskInline({ base }: { base: QuickTaskBase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-stone-100 px-4 py-2.5">
      {open ? (
        <InlineTaskBox base={base} onDone={() => setOpen(false)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <ListPlus className="size-4" /> Nueva tarea
        </button>
      )}
    </div>
  );
}

const inputCls = "h-8 w-full rounded-md border border-input bg-background px-2 text-sm";

/** Kcal and macros in seconds, while talking with someone (full version in Calculadora). */
export function QuickCalculator() {
  const [sex, setSex] = useState<CalcSex>("FEMALE");
  const [age, setAge] = useState("30");
  const [weight, setWeight] = useState("70");
  const [height, setHeight] = useState("165");
  const [fat, setFat] = useState("");
  const [activity, setActivity] = useState<ActivityLevel>("moderate");
  const [goal, setGoal] = useState<Goal>("lose");
  const r = useMemo(() => {
    const w = Number(weight), h = Number(height), a = Number(age);
    if (!(w > 30 && h > 120 && a > 12)) return null;
    return calculateTarget({ sex, ageYears: a, weightKg: w, heightCm: h, bodyFatPct: fat ? Number(fat) : null, activity, goal });
  }, [sex, age, weight, height, fat, activity, goal]);
  const kcalOf = (g: number, k: number) => (r ? Math.round(((g * k) / r.kcal) * 100) : 0);
  return (
    <div className="space-y-3 p-4 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <select value={sex} onChange={(e) => setSex(e.target.value as CalcSex)} className={inputCls} aria-label="Sexo">
          <option value="FEMALE">Mujer</option>
          <option value="MALE">Hombre</option>
        </select>
        <input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" className={inputCls} aria-label="Edad" placeholder="Edad" />
        <input value={fat} onChange={(e) => setFat(e.target.value)} inputMode="decimal" className={inputCls} aria-label="% grasa" placeholder="% grasa" />
        <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className={inputCls} aria-label="Peso kg" placeholder="kg" />
        <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" className={inputCls} aria-label="Talla cm" placeholder="cm" />
        <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)} className={inputCls} aria-label="Objetivo">
          {Object.entries(GOALS).map(([k, v]) => <option key={k} value={k}>{v.label.split(" (")[0]}</option>)}
        </select>
      </div>
      <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)} className={inputCls} aria-label="Actividad">
        {Object.entries(ACTIVITY_LEVELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {r && (
        <div className="rounded-lg bg-stone-50 p-3">
          <p className="text-2xl font-semibold tabular-nums">{r.kcal.toLocaleString("es-EC")} <span className="text-sm font-normal text-muted-foreground">kcal/día</span></p>
          <p className="text-xs text-muted-foreground">Basal {Math.round(r.bmr)} · gasto {Math.round(r.tdee)}</p>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
            <div style={{ width: `${kcalOf(r.proteinG, 4)}%` }} className="bg-[#e5533f]" />
            <div style={{ width: `${kcalOf(r.carbsG, 4)}%` }} className="bg-[#d97e0a]" />
            <div style={{ width: `${kcalOf(r.fatG, 9)}%` }} className="bg-[#3a8fd1]" />
          </div>
          <p className="mt-1.5 flex justify-between text-xs">
            <span><b>{r.proteinG} g</b> prot.</span>
            <span><b>{r.carbsG} g</b> carb.</span>
            <span><b>{r.fatG} g</b> grasa</span>
          </p>
        </div>
      )}
    </div>
  );
}
