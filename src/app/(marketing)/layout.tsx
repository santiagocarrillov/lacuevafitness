import type { Metadata } from "next";
import localFont from "next/font/local";
import { Barlow_Condensed, Barlow_Semi_Condensed } from "next/font/google";
import "./marketing.css";

// IMPACTED 2.0 — titulares brutalistas (archivo de marca)
const impacted = localFont({
  src: "./fonts/Impacted.ttf",
  variable: "--mkt-display",
  display: "swap",
});

// JungleFeverNF — marca / palabras muy importantes. Nunca párrafos.
const jungleFever = localFont({
  src: "./fonts/JungleFeverNF.ttf",
  variable: "--mkt-brand",
  display: "swap",
});

// Condensada: subtítulos, información, fechas, detalles.
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--mkt-sans",
  display: "swap",
});

const barlowSemiCondensed = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--mkt-sans2",
  display: "swap",
});

export const metadata: Metadata = {
  title: "La Cueva SRXFIT — No solo entrenas. Te transformas.",
  description:
    "Fitness Prescrito Científicamente en Sangolquí. Te evaluamos, te prescribimos y medimos cada avance. Más saludable. Más fit. Más longeva.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = [
    impacted.variable,
    jungleFever.variable,
    barlowCondensed.variable,
    barlowSemiCondensed.variable,
  ].join(" ");

  return (
    <>
      {/*
        Brush Script (brush-script-std) vive en Adobe Typekit y está atado a dominios:
        hay que autorizar lacuevasrxfit.com y los previews *.vercel.app en el kit,
        o en producción caerá al fallback en silencio.
      */}
      <link rel="stylesheet" href="https://use.typekit.net/imy7tie.css" precedence="default" />
      <div className={`mkt ${fontVars}`}>{children}</div>
    </>
  );
}
