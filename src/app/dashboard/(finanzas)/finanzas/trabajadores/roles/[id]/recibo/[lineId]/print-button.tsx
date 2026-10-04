"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border border-stone-300 px-3.5 py-1.5 text-sm font-medium hover:border-stone-500 print:hidden">
      Imprimir o guardar PDF
    </button>
  );
}
