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

// ── Private finance documents (receipts, invoices) ─────────────────────────
// Financial documents must never be public: private bucket, served through
// short-lived signed URLs generated server-side for OWNER/ACCOUNTING only.
export const FINANCE_BUCKET = "finance-docs";
const FINANCE_ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
// Server actions accept 1 MB bodies: images are compressed in the browser first.
const FINANCE_MAX_BYTES = 1024 * 1024;

let financeBucketReady: Promise<void> | null = null;

function ensureFinanceBucket(): Promise<void> {
  financeBucketReady ??= (async () => {
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase.storage.getBucket(FINANCE_BUCKET);
    if (data) return;
    const { error } = await supabase.storage.createBucket(FINANCE_BUCKET, {
      public: false,
      fileSizeLimit: FINANCE_MAX_BYTES,
      allowedMimeTypes: [...FINANCE_ALLOWED],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((e) => {
    financeBucketReady = null;
    throw e;
  });
  return financeBucketReady;
}

/** Uploads a receipt/invoice and returns its storage path (not a URL). */
export async function uploadFinanceDoc(file: File, folder: string): Promise<string> {
  if (!(FINANCE_ALLOWED as readonly string[]).includes(file.type)) {
    throw new Error("El comprobante debe ser foto (JPG, PNG, WebP) o PDF.");
  }
  if (file.size > FINANCE_MAX_BYTES) throw new Error("El comprobante pesa más de 1 MB (los PDF del SRI pesan mucho menos).");
  await ensureFinanceBucket();
  const ext = file.type === "application/pdf" ? "pdf"
    : file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${folder}/${randomUUID()}.${ext}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(FINANCE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) throw new Error("No se pudo subir el comprobante.");
  return path;
}

/** Signed URL valid for 10 minutes. */
export async function signFinanceDoc(path: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.storage.from(FINANCE_BUCKET).createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}
