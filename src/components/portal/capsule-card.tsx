import { capsuleForWeek } from "@/lib/portal/capsules";

/**
 * Rotates through 52 SRXFit capsules — one per ISO week of the year.
 * Same component used on /portal/hoy and /portal/cuenta.
 */
export function CapsuleCard({ now = new Date() }: { now?: Date }) {
  const c = capsuleForWeek(now);
  return (
    <article className="portal-capsule">
      <div className="label">SRXFit · Cápsula {String(c.number).padStart(2, "0")}</div>
      <h5>{c.title}</h5>
      <div className="capsule-body">
        {c.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <div className="read">{c.readMinutes} min · lectura</div>
    </article>
  );
}
