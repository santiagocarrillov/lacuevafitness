"use client";

import { useRef, useState } from "react";
import { uploadRecipePhoto } from "@/lib/actions/uploads";

/**
 * Downscales an image in the browser (max 1600 px, JPEG) so uploads stay well
 * under the server-action body limit and phones' 5 MB photos don't matter.
 */
async function compressImage(file: File, maxSide = 1600): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const q of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 900 * 1024) return new File([blob], "foto.jpg", { type: "image/jpeg" });
  }
  throw new Error("La foto es muy pesada, prueba con otra.");
}

/** Photo picker + preview. Works in the dashboard and the portal (inline styles). */
export function PhotoUpload({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const small = await compressImage(file);
      const fd = new FormData();
      fd.append("file", small);
      const { url } = await uploadRecipePhoto(fd);
      onChange(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la foto.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Foto de la receta" style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 12 }} />
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #d6d3cc", background: "transparent", fontSize: 13, cursor: "pointer" }}
        >
          {busy ? "Subiendo…" : value ? "Cambiar foto" : "📷 Agregar foto"}
        </button>
        {value && !busy && (
          <button type="button" onClick={() => onChange(null)} style={{ background: "none", border: "none", fontSize: 13, color: "#8a8a86", cursor: "pointer" }}>
            Quitar
          </button>
        )}
      </div>
      {error && <p style={{ color: "#c8493c", fontSize: 12, margin: 0 }}>{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}
