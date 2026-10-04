"use client";

import { SlotPicker } from "@/components/nutrition/slot-picker";
import { bookMySlot } from "@/lib/actions/nutrition-booking";
import type { SedeKey, SlotDay } from "@/lib/nutrition/slots";

export function PortalBooking({ days, defaultSede, moving }: { days: SlotDay[]; defaultSede: SedeKey; moving: boolean }) {
  return (
    <SlotPicker
      days={days}
      defaultSede={defaultSede}
      confirmLabel={moving ? "Cambiar a" : "Confirmar"}
      book={async (s) => {
        const r = await bookMySlot(s.startsAt, s.sede, s.staffUserId);
        return { startsAt: r.startsAt, sede: r.sede as SedeKey, moved: r.moved };
      }}
    />
  );
}
