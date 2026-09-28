import type { AssignableUser } from "@/lib/tasks/meta";

export const SELECT_CLASS =
  "w-full h-8 rounded-md border border-input bg-background px-2 text-sm";

/** Select value meaning "no assignee: leave it in the front desk's pool". */
export const POOL = "__pool__";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Dueño",
  ACCOUNTING: "Contabilidad",
  ADMIN: "Recepción",
  COACH: "Coach",
  NUTRITIONIST: "Nutrición",
};

export function AssigneeOptions({
  users,
  currentUserId,
  canPool,
}: {
  users: AssignableUser[];
  currentUserId: string;
  canPool: boolean;
}) {
  const me = users.find((u) => u.id === currentUserId);
  const others = users.filter((u) => u.id !== currentUserId);
  return (
    <>
      {me && <option value={me.id}>Yo ({me.name})</option>}
      {canPool && <option value={POOL}>Recepción, sin responsable</option>}
      {others.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} · {ROLE_LABEL[u.role] ?? u.role}
        </option>
      ))}
    </>
  );
}
