import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { CANONICAL_SITE_URL, LEGACY_VERCEL_HOST } from "@/lib/site-url";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Force human traffic off the legacy Vercel alias onto the canonical domain,
  // so nobody signs up / installs the PWA on a throwaway URL. /api is left alone
  // (webhooks + crons hit the deployment host directly and must not be redirected).
  const host = request.headers.get("host") ?? "";
  if (host === LEGACY_VERCEL_HOST && !path.startsWith("/api/")) {
    return NextResponse.redirect(
      new URL(path + request.nextUrl.search, CANONICAL_SITE_URL),
      308,
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Touch the session so cookies refresh on every request
  const { data: { user } } = await supabase.auth.getUser();

  // Public API endpoints that must bypass session auth:
  // - the WhatsApp webhook (Meta calls it; it's guarded by HMAC signature)
  // - cron endpoints (guarded by CRON_SECRET, not a user session)
  const isPublicApi =
    path.startsWith("/api/whatsapp/webhook") || path.startsWith("/api/cron/");
  const isStaffProtected =
    !isPublicApi && (path.startsWith("/dashboard") || path.startsWith("/api/"));
  const isPortalProtected =
    path.startsWith("/portal") &&
    path !== "/portal/login" &&
    path !== "/portal/signup";
  const isStaffAuthPage = path === "/login";
  const isPortalAuthPage = path === "/portal/login" || path === "/portal/signup";

  if (isStaffProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (isPortalProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // A logged-in user revisiting any auth page is sent to the role-aware landing,
  // which forwards socios to the portal and staff to the dashboard.
  if ((isStaffAuthPage || isPortalAuthPage) && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/bienvenida";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets, images, and favicon
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
