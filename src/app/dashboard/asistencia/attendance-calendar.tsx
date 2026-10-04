"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import type { CalendarAttendee, CalendarSession } from "@/lib/attendance-calendar";

// Week calendar of attendance (Google Calendar-style). Pure presentation: all
// data comes pre-loaded from the server component for one week.

const HOUR_PX = 72;
/** Height of a collapsed run of hours with no classes in any visible day. */
const GAP_PX = 28;
const CHIP_PX = 20;
const CHIP_GAP = 2;

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const DAY_NAMES_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const SEDE_LABEL: Record<CalendarSession["sede"], string> = {
  FITNESS_CENTER: "Fitness Center",
  XTREME: "Xtreme",
};
const SEDE_SHORT: Record<CalendarSession["sede"], string> = {
  FITNESS_CENTER: "FC",
  XTREME: "XT",
};
// Sede colors reuse the chart tokens from globals.css.
const SEDE_BLOCK: Record<CalendarSession["sede"], string> = {
  FITNESS_CENTER: "bg-chart-2/10 border-chart-2/30 border-l-chart-2 hover:bg-chart-2/15",
  XTREME: "bg-chart-4/15 border-chart-4/40 border-l-chart-4 hover:bg-chart-4/25",
};
const SEDE_DOT: Record<CalendarSession["sede"], string> = {
  FITNESS_CENTER: "bg-chart-2",
  XTREME: "bg-chart-4",
};

function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function initials(a: CalendarAttendee): string {
  const f = a.firstName.trim()[0] ?? "";
  const l = a.lastName.trim()[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

function fullName(a: CalendarAttendee): string {
  return `${a.firstName} ${a.lastName}`.trim();
}

function dayLabel(iso: string): { num: number; month: string } {
  const [, m, d] = iso.split("-").map(Number);
  return { num: d, month: MONTHS_ES[m - 1] };
}

type Placed = CalendarSession & { lane: number; lanes: number };

type Row = { kind: "hour" | "gap"; from: number; to: number; top: number; height: number };

/** Side-by-side layout for overlapping sessions within one day. */
function layoutDay(sessions: CalendarSession[]): Placed[] {
  const sorted = [...sessions].sort(
    (a, b) => a.startMin - b.startMin || b.durationMin - a.durationMin,
  );
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = laneEnds.length;
    for (const p of cluster) p.lanes = lanes;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const s of sorted) {
    const end = s.startMin + s.durationMin;
    if (cluster.length && s.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= s.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    cluster.push({ ...s, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return out;
}

export function AttendanceCalendar({
  days,
  sessions,
  showSunday,
  showSedeTag,
  todayIso,
  nowMin,
}: {
  /** "YYYY-MM-DD" Mon..Sun. */
  days: string[];
  sessions: CalendarSession[];
  showSunday: boolean;
  showSedeTag: boolean;
  todayIso: string;
  /** Minutes since 00:00 Ecuador at render time. */
  nowMin: number;
}) {
  const dayIdx = showSunday ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4, 5];
  const visible = sessions.filter((s) => dayIdx.includes(s.dayIndex));

  let startHour = 6;
  let endHour = 21;
  if (visible.length) {
    const min = Math.min(...visible.map((s) => s.startMin));
    const max = Math.max(...visible.map((s) => s.startMin + s.durationMin));
    startHour = Math.max(0, Math.floor(min / 60));
    endHour = Math.min(24, Math.max(Math.ceil(max / 60), startHour + 1));
  }

  const byDay = new Map<number, Placed[]>();
  for (const i of dayIdx) byDay.set(i, layoutDay(visible.filter((s) => s.dayIndex === i)));

  // Vertical rows: hours with classes keep full height; runs of 2+ idle hours
  // (e.g. the mid-day lull) collapse into a thin band so the grid stays compact.
  const busy = (h: number) =>
    visible.some((s) => s.startMin < (h + 1) * 60 && s.startMin + s.durationMin > h * 60);
  const rows: Row[] = [];
  let y = 0;
  for (let h = startHour; h < endHour; ) {
    let run = 0;
    while (h + run < endHour && !busy(h + run)) run++;
    if (run >= 2) {
      rows.push({ kind: "gap", from: h, to: h + run, top: y, height: GAP_PX });
      y += GAP_PX;
      h += run;
    } else {
      rows.push({ kind: "hour", from: h, to: h + 1, top: y, height: HOUR_PX });
      y += HOUR_PX;
      h += 1;
    }
  }
  const bodyHeight = y;
  const yOf = (min: number): number => {
    const r = rows.find((row) => min < row.to * 60) ?? rows[rows.length - 1];
    const frac = Math.min(1, Math.max(0, (min - r.from * 60) / ((r.to - r.from) * 60)));
    return r.top + frac * r.height;
  };
  const maxLanes = Math.max(1, ...Array.from(byDay.values()).flatMap((d) => d.map((p) => p.lanes)));
  const colMin = maxLanes > 1 ? 168 : 128;

  const [open, setOpen] = useState<{ session: Placed; anchor: HTMLElement } | null>(null);
  const close = useCallback(() => setOpen(null), []);

  const nowTop = nowMin >= startHour * 60 && nowMin <= endHour * 60 ? yOf(nowMin) : null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 44 + dayIdx.length * colMin }}>
          {/* Day headers */}
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `44px repeat(${dayIdx.length}, minmax(0, 1fr))` }}
          >
            <div />
            {dayIdx.map((i) => {
              const iso = days[i];
              const { num, month } = dayLabel(iso);
              const isToday = iso === todayIso;
              const count = byDay.get(i)?.reduce((n, s) => n + s.attendees.length, 0) ?? 0;
              return (
                <div
                  key={iso}
                  className={`border-l border-border px-2 py-2 text-center ${isToday ? "bg-muted/60" : ""}`}
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {DAY_NAMES[i]}
                  </div>
                  <div className="mt-0.5 flex items-center justify-center gap-1">
                    <span
                      className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold ${
                        isToday ? "bg-primary text-primary-foreground" : ""
                      }`}
                    >
                      {num}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{month}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {count > 0 ? `${count} asist.` : " "}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `44px repeat(${dayIdx.length}, minmax(0, 1fr))`,
              height: bodyHeight,
            }}
          >
            {/* Time gutter */}
            <div className="relative">
              {rows.map((r, k) => (
                <div
                  key={r.from}
                  className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: r.top }}
                >
                  {k === 0 ? "" : `${r.from}:00`}
                </div>
              ))}
            </div>

            {/* Collapsed idle hours */}
            {rows
              .filter((r) => r.kind === "gap")
              .map((r) => (
                <div
                  key={`gap-${r.from}`}
                  className="pointer-events-none absolute right-0 z-[5] flex items-center border-y border-border bg-muted/50 px-2 text-[10px] text-muted-foreground"
                  style={{ top: r.top, height: r.height, left: 44 }}
                >
                  Sin clases · {r.from}:00 – {r.to}:00
                </div>
              ))}

            {dayIdx.map((i) => {
              const iso = days[i];
              const isToday = iso === todayIso;
              const placed = byDay.get(i) ?? [];
              return (
                <div
                  key={iso}
                  className={`relative border-l border-border ${isToday ? "bg-muted/40" : ""}`}
                >
                  {/* Hour lines */}
                  {rows
                    .filter((r) => r.kind === "hour")
                    .map((r) => (
                      <div key={r.from}>
                        <div
                          className="absolute inset-x-0 border-t border-border/70"
                          style={{ top: r.top }}
                        />
                        <div
                          className="absolute inset-x-0 border-t border-dashed border-border/40"
                          style={{ top: r.top + HOUR_PX / 2 }}
                        />
                      </div>
                    ))}

                  {isToday && nowTop !== null && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 h-0 border-t-2 border-destructive"
                      style={{ top: nowTop }}
                    >
                      <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-destructive" />
                    </div>
                  )}

                  {placed.map((s) => (
                    <EventBlock
                      key={s.id}
                      session={s}
                      top={yOf(s.startMin)}
                      height={yOf(s.startMin + s.durationMin) - yOf(s.startMin)}
                      showSedeTag={showSedeTag}
                      selected={open?.session.id === s.id}
                      onOpen={(anchor) =>
                        setOpen((cur) => (cur?.session.id === s.id ? null : { session: s, anchor }))
                      }
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="border-t border-border px-4 py-3 text-center text-sm text-muted-foreground">
          No hay clases registradas esta semana.
        </p>
      )}

      {open && (
        <SessionCard
          key={open.session.id}
          session={open.session}
          anchor={open.anchor}
          dayIso={days[open.session.dayIndex]}
          onClose={close}
        />
      )}
    </div>
  );
}

function EventBlock({
  session,
  top,
  height: rawHeight,
  showSedeTag,
  selected,
  onOpen,
}: {
  session: Placed;
  top: number;
  height: number;
  showSedeTag: boolean;
  selected: boolean;
  onOpen: (anchor: HTMLElement) => void;
}) {
  const height = Math.max(22, rawHeight - 2);
  const widthPct = 100 / session.lanes;
  const count = session.attendees.length;

  // How many initials chips fit in the remaining space of the block.
  const chipsRef = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(0);
  useEffect(() => {
    const el = chipsRef.current;
    if (!el) return;
    const measure = () => {
      // Fractional size (clientWidth/Height round up and would over-count by one).
      const { width, height } = el.getBoundingClientRect();
      const perRow = Math.floor((width - 0.5 + CHIP_GAP) / (CHIP_PX + CHIP_GAP));
      const rows = Math.floor((height - 0.5 + CHIP_GAP) / (CHIP_PX + CHIP_GAP));
      setCapacity(Math.max(0, perRow * rows));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const overflow = count > capacity;
  const shown = overflow ? session.attendees.slice(0, Math.max(0, capacity - 1)) : session.attendees;
  const rest = count - shown.length;

  return (
    <button
      type="button"
      data-cal-event=""
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={`${session.name}, ${hhmm(session.startMin)}, ${count} asistentes`}
      aria-expanded={selected}
      className={`absolute z-10 flex flex-col overflow-hidden rounded-md border border-l-[3px] px-1.5 py-1 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        SEDE_BLOCK[session.sede]
      } ${count === 0 ? "opacity-60" : ""} ${selected ? "ring-2 ring-ring" : ""}`}
      style={{
        top: top + 1,
        height,
        left: `calc(${session.lane * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate text-[11px] font-semibold leading-tight">{session.name}</span>
        {showSedeTag && (
          <span className="ml-auto shrink-0 rounded bg-card/80 px-1 text-[9px] font-semibold leading-tight text-muted-foreground">
            {SEDE_SHORT[session.sede]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
        <span className="tabular-nums">{hhmm(session.startMin)}</span>
        <span aria-hidden>·</span>
        <Users className="h-2.5 w-2.5" aria-hidden />
        <span className="tabular-nums font-medium text-foreground">{count}</span>
      </div>
      <div
        ref={chipsRef}
        className="mt-0.5 flex min-h-0 flex-1 flex-wrap content-start overflow-hidden"
        style={{ gap: CHIP_GAP }}
      >
        {shown.map((a) => (
          <span
            key={a.memberId}
            title={fullName(a)}
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-border bg-card text-[9px] font-semibold leading-none text-foreground"
            style={{ width: CHIP_PX, height: CHIP_PX }}
          >
            {initials(a)}
          </span>
        ))}
        {overflow && rest > 0 && capacity > 0 && (
          <span
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-foreground/80 text-[9px] font-semibold leading-none text-background"
            style={{ minWidth: CHIP_PX, height: CHIP_PX, paddingInline: 2 }}
          >
            +{rest}
          </span>
        )}
      </div>
    </button>
  );
}

const CARD_W = 288;
const MARGIN = 8;

function SessionCard({
  session,
  anchor,
  dayIso,
  onClose,
}: {
  session: Placed;
  anchor: HTMLElement;
  dayIso: string;
  onClose: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const isPlaced = pos !== null;

  const place = useCallback(() => {
    const card = cardRef.current;
    if (!card || !anchor.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(CARD_W, vw - MARGIN * 2);
    const h = card.offsetHeight;
    let left: number;
    let top: number;
    if (r.right + MARGIN + w <= vw - MARGIN) {
      left = r.right + MARGIN; // right of the block
      top = r.top;
    } else if (r.left - MARGIN - w >= MARGIN) {
      left = r.left - MARGIN - w; // left of the block
      top = r.top;
    } else {
      // Narrow screens: below (or above) the block.
      left = Math.min(Math.max(MARGIN, r.left), vw - w - MARGIN);
      top = r.bottom + MARGIN + h <= vh - MARGIN ? r.bottom + MARGIN : r.top - MARGIN - h;
    }
    top = Math.min(Math.max(MARGIN, top), Math.max(MARGIN, vh - h - MARGIN));
    setPos({ top, left });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  // Move focus into the card once it is visible (hidden elements can't take focus).
  useEffect(() => {
    if (isPlaced) closeRef.current?.focus({ preventScroll: true });
  }, [isPlaced]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        anchor.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (cardRef.current?.contains(t)) return;
      // Clicks on another block are handled by the block itself (switch card).
      if (t instanceof Element && t.closest("[data-cal-event]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, onClose, place]);

  const { num, month } = dayLabel(dayIso);
  const count = session.attendees.length;

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label={`${session.name} — asistentes`}
      className="fixed z-50 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
      style={{
        width: `min(${CARD_W}px, calc(100vw - ${MARGIN * 2}px))`,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="flex items-start gap-2 border-b border-border px-4 pb-3 pt-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${SEDE_DOT[session.sede]}`} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{session.name}</p>
          <p className="text-xs text-muted-foreground">
            {DAY_NAMES_LONG[session.dayIndex]} {num} {month} · {hhmm(session.startMin)} –{" "}
            {hhmm(session.startMin + session.durationMin)}
          </p>
          <p className="text-xs text-muted-foreground">
            {SEDE_LABEL[session.sede]}
            {session.coachName ? ` · Coach ${session.coachName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          ref={closeRef}
          className="-mr-1 -mt-0.5 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 pb-1 pt-2 text-xs font-medium text-muted-foreground">
        {count === 1 ? "1 asistente" : `${count} asistentes`}
      </div>
      {count === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">Nadie registrado en esta clase.</p>
      ) : (
        <ul className="max-h-72 overflow-y-auto px-2 pb-2">
          {session.attendees.map((a) => (
            <li key={a.memberId}>
              <Link
                href={`/dashboard/socios/${a.memberId}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-semibold">
                  {initials(a)}
                </span>
                <span className="truncate">{fullName(a)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
