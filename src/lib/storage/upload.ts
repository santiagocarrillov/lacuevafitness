import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// First Supabase Storage use in the app. Public-read bucket for non-sensitive
// images (recipe photos); paths are random UUIDs so nothing is guessable or
// listable from the client. Server-only: uploads go through the service role.
export const NUTRITION_BUCKET = "nutrition-media";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

let bucketReady: Promise<void> | null = null;

/** Creates the bucket on first use (idempotent). */
function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.getBucket(NUTRITION_BUCKET);
    if (data) return;
    const { error } = await supabase.storage.createBucket(NUTRITION_BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: [...ALLOWED],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((e) => {
    bucketReady = null; // retry next time
    throw e;
  });
  return bucketReady;
}

/** Uploads an image and returns its public URL. `folder` e.g. "recipes". */
export async function uploadPublicImage(file: File, folder: string): Promise<string> {
  if (!(ALLOWED as readonly string[]).includes(file.type)) throw new Error("La foto debe ser JPG, PNG o WebP.");
  if (file.size > MAX_BYTES) throw new Error("La foto pesa más de 2 MB.");
  await ensureBucket();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${randomUUID()}.${ext}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(NUTRITION_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new Error("No se pudo subir la foto.");
  return supabase.storage.from(NUTRITION_BUCKET).getPublicUrl(path).data.publicUrl;
}
