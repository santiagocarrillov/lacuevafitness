import { ecuadorDateString } from "@/lib/timezone";

/** Month in the URL (YYYY-MM, never in the future) or the current one. */
export function monthParam(mes: string | undefined) {
  const thisMonth = ecuadorDateString().slice(0, 7);
  const ym = /^\d{4}-\d{2}$/.test(mes ?? "") && mes! <= thisMonth ? mes! : thisMonth;
  return { ym, thisMonth };
}
