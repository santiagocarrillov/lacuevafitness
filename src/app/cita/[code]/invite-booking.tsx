"use client";

import { SlotPicker } from "@/components/nutrition/slot-picker";
import { bookWithInvite } from "@/lib/actions/nutrition-booking";
import type { SedeKey, SlotDay } from "@/lib/nutrition/slots";

export function InviteBooking({ code, days, defaultSede, deadline, moving }: { code: string; days: SlotDay[]; defaultSede: SedeKey; deadline: string | null; moving: boolean }) {
  return (
    <SlotPicker
      days={days}
      defaultSede={defaultSede}
      deadline={deadline}
      confirmLabel={moving ? "Cambiar a" : "Confirmar"}
      book={async (s) => {
        const r = await bookWithInvite(code, s.startsAt, s.sede, s.staffUserId);
        return { startsAt: r.startsAt, sede: r.sede as SedeKey, moved: r.moved };
      }}
    />
  );
}
