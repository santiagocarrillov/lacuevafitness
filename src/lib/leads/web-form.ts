import type { Sede } from "@/generated/prisma/client";

/**
 * Public-facing branch options for the web lead form. The socio-facing labels
 * use the neighbourhood ("sector Bomberos" / "sector Colibrí") because that's
 * how people locate us; internally they map to the Sede enum.
 *
 * Plain module — imported by both the client form and the "use server" action,
 * which may only export async functions.
 */
export const BRANCH_OPTIONS = [
  { value: "BOMBEROS", label: "Sangolquí — sector Bomberos", sede: "FITNESS_CENTER" as Sede },
  { value: "COLIBRI", label: "Sangolquí — sector Colibrí", sede: "XTREME" as Sede },
  { value: "CUALQUIERA", label: "Cualquiera de las dos", sede: null },
] as const;

export type BranchValue = (typeof BRANCH_OPTIONS)[number]["value"];

export function branchByValue(value: string) {
  return BRANCH_OPTIONS.find((b) => b.value === value) ?? null;
}
