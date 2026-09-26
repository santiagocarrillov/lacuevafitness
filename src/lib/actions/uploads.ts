"use server";

import { requireAuth, requireMember, can } from "@/lib/auth";
import { uploadPublicImage } from "@/lib/storage/upload";

/** Recipe photo upload for nutrition staff and socios (their own recipes). */
export async function uploadRecipePhoto(formData: FormData): Promise<{ url: string }> {
  const user = await requireAuth();
  if (!can.manageNutrition(user)) await requireMember(); // socios: must be an active portal member
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Elige una foto.");
  return { url: await uploadPublicImage(file, "recipes") };
}
