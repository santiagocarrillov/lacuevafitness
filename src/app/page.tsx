import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-50 px-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-2">
          <p className="text-xs tracking-[0.3em] text-zinc-400 uppercase">
            La Cueva Fitness Center · La Cueva Xtreme
          </p>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
            Físicamente fuerte.
            <br />
            <span className="text-zinc-400">Mentalmente indestructible.</span>
          </h1>
          <p className="text-lg text-zinc-400 pt-4">
            Dashboard operativo SRXFit — gestión de socios, asistencias, pagos y evaluaciones.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-6">
          <Link href="/login" className={buttonVariants({ size: "lg" })}>
            Iniciar sesión
          </Link>
          <Link
            href="/dashboard"
            className={buttonVariants({ size: "lg", variant: "outline" })}
          >
            Ir al dashboard
          </Link>
        </div>

        <p className="text-xs text-zinc-500 pt-12">
          Scientifically Prescribed Fitness · Confidencial · v0.1
        </p>
      </div>
    </main>
  );
}
