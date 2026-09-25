// Socios who are Santiago's staff (gyms or Enroke) and train for free as a
// perk. They look "vencido"/"sin membresía" but must stay out of collection,
// churn-risk and follow-up lists (dicho el 24 sep 2026). Matched by name until
// they get a proper $0 "Beneficio staff" plan in the DB.
const NAMES = [
  "andrew godoy",
  "jose fernandez",
  "maria jose gonzalez",
  "cristian carrillo",
  "luis bahamonde",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True if this socio is a staff member training for free (by name). */
export function isStaffFreeTraining(firstName: string, lastName: string): boolean {
  const full = norm(`${firstName} ${lastName}`);
  return NAMES.some((n) => {
    const [first, ...rest] = n.split(" ");
    const last = rest[rest.length - 1];
    return full.startsWith(first) && full.includes(last);
  });
}
