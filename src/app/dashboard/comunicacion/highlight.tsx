"use client";

import { Fragment } from "react";
import { matchRanges, snippetAround } from "@/lib/whatsapp/search";

const MARK = "bg-amber-200/80 text-amber-950 rounded-[2px] px-[1px]";

function paint(text: string, ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(<Fragment key={`t${i}`}>{text.slice(cursor, r.start)}</Fragment>);
    parts.push(
      <mark key={`m${i}`} className={MARK}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>);
  return parts;
}

/** Texto completo con la consulta resaltada (sin acentos ni mayúsculas de por medio). */
export function Highlight({ text, query }: { text: string; query: string }) {
  return <>{paint(text, matchRanges(text, query))}</>;
}

/**
 * Fragmento alrededor de la primera coincidencia, resaltado. Para la lista de
 * resultados: un mensaje largo no puede ocupar la pantalla solo porque la
 * palabra buscada estaba al final.
 */
export function HighlightSnippet({ text, query }: { text: string; query: string }) {
  const s = snippetAround(text, query);
  return (
    <>
      {s.leadingEllipsis && "…"}
      {paint(s.text, s.ranges)}
      {s.trailingEllipsis && "…"}
    </>
  );
}
