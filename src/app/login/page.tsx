"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (params.get("disabled")) toast.error("Tu cuenta está deshabilitada.");
    if (params.get("unlinked")) {
      toast.error(
        "Tu correo no está vinculado a una cuenta del staff. Contacta a Santiago.",
        { duration: 8000 },
      );
    }
    if (params.get("error") === "callback") {
      toast.error("El link expiró o no es válido. Solicita uno nuevo.");
    }
  }, [params]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email) {
      toast.error("Ingresa tu correo.");
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const next = params.get("next") ?? "/dashboard";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMagicSent(true);
    toast.success("Te enviamos un link a tu correo.");
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bienvenido a La Cueva");
    const next = params.get("next") ?? "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>Dashboard SRXFit — La Cueva</CardDescription>
        </CardHeader>
        <CardContent>
          {magicSent ? (
            <div className="space-y-3 text-sm">
              <p>
                Revisa tu correo <strong>{email}</strong>. Haz click en el link
                para entrar.
              </p>
              <p className="text-muted-foreground">
                ¿No te llegó? Revisa spam o solicita otro.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setMagicSent(false)}>
                Volver
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <form onSubmit={handleMagicLink} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Enviando…" : "Enviar link de acceso"}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Te enviamos un link de 1 click — sin contraseña.
                </p>
              </form>

              {showPassword ? (
                <>
                  <Separator />
                  <form onSubmit={handlePasswordLogin} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña</Label>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                      {loading ? "Entrando…" : "Entrar con contraseña"}
                    </Button>
                  </form>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowPassword(true)}
                  className="text-xs text-muted-foreground hover:text-foreground underline w-full text-center"
                >
                  ¿Tienes contraseña? Úsala
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
