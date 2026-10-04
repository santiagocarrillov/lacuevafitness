// Automatic segments: labels shared by /dashboard/segmentos and the ficha.
// The rules live in actions/analytics.ts (segmentMembersCore).
import type { SegmentKey } from "@/lib/actions/analytics";

export const SEGMENT_INFO: Record<SegmentKey, { title: string; description: string; emoji: string; color: string }> = {
  at_risk: {
    title: "En riesgo",
    description: "No asisten hace 7-14 días",
    emoji: "⚠",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  high_risk: {
    title: "Riesgo alto",
    description: "No asisten hace 14-30 días",
    emoji: "🚨",
    color: "text-red-700 bg-red-50 border-red-200",
  },
  ghost: {
    title: "Fantasmas",
    description: "30+ días sin venir",
    emoji: "👻",
    color: "text-zinc-700 bg-zinc-100 border-zinc-200",
  },
  expiring_soon: {
    title: "Por vencer",
    description: "Membresía vence en 7 días",
    emoji: "⏰",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  expired_no_renewal: {
    title: "Vencidos sin renovar",
    description: "Membresía expiró y no han renovado",
    emoji: "❌",
    color: "text-red-700 bg-red-50 border-red-200",
  },
  low_attendance: {
    title: "Baja frecuencia",
    description: "≤2 clases en últimos 28 días",
    emoji: "📉",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  morning_members: {
    title: "Cavernarios de la mañana",
    description: "Entrenan antes de mediodía",
    emoji: "🌅",
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  afternoon_members: {
    title: "Cavernarios de la tarde",
    description: "Entrenan entre 12pm y 5pm",
    emoji: "☀️",
    color: "text-amber-700 bg-amber-50 border-amber-200",
  },
  evening_members: {
    title: "Cavernarios de la noche",
    description: "Entrenan después de 5pm",
    emoji: "🌙",
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  champions: {
    title: "Champions",
    description: "4+ clases/semana, 90+ días",
    emoji: "🏆",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
};

export const SEGMENT_ORDER: SegmentKey[] = [
  "at_risk", "high_risk", "ghost",
  "expiring_soon", "expired_no_renewal", "low_attendance",
  "champions", "morning_members", "afternoon_members", "evening_members",
];

