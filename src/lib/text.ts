// Client-safe text matching for lists filtered in the browser: ignores case and
// accents, and every word must appear ("maria rojas" → María Rojas).
import { foldText } from "@/lib/whatsapp/search";

export { foldText };

export function textMatches(text: string, query: string): boolean {
  const words = foldText(query.trim()).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = foldText(text);
  return words.every((w) => hay.includes(w));
}
