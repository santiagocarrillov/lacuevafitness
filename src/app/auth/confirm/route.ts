import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Exchanges a hashed email token (recovery link we minted and sent via Resend)
 * for a real session cookie, then forwards to `next`.
 *
 * Separate from /auth/callback, which handles Supabase's own `?code=` flow
 * (magic links). Only same-origin relative `next` paths are honoured so a
 * crafted link can't bounce a freshly authenticated socio off-site.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/portal/nueva-clave";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//")
    ? rawNext
    : "/portal/nueva-clave";

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/portal/recuperar?expired=1", url.origin));
}
