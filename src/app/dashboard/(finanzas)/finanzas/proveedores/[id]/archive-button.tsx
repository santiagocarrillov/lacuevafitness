"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setSupplierActive } from "@/lib/actions/suppliers";

export function ArchiveSupplierButton({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          try {
            await setSupplierActive(id, !active);
            toast.success(active ? "Proveedor archivado" : "Proveedor restaurado");
            router.refresh();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo.");
          }
        })
      }
      className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
    >
      {active ? "Archivar (sale del directorio; sus documentos se conservan)" : "Restaurar al directorio"}
    </button>
  );
}
