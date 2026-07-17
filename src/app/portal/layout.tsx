import { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Barlow_Semi_Condensed } from "next/font/google";
import localFont from "next/font/local";
import "./portal.css";

// Barlow Condensed — kickers, datos, fechas, unidades (voz atlética de la marca).
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-barlow-cond",
});

// Barlow Semi Condensed — cuerpo de texto del portal.
const barlowSemiCondensed = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-barlow-semi",
});

// IMPACTED 2.0 — titulares brutalistas de marca (mismo archivo que la web).
// Va SÓLIDO; su textura desgarrada ya es el efecto (nunca -webkit-text-stroke).
const impacted = localFont({
  src: "../(marketing)/fonts/Impacted.ttf",
  display: "swap",
  variable: "--font-impacted",
});

export const metadata: Metadata = {
  title: "La Cueva · Socio",
  description: "Portal del socio de La Cueva Fitness.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  const fontVars = [
    barlowCondensed.variable,
    barlowSemiCondensed.variable,
    impacted.variable,
  ].join(" ");
  return <div className={`portal-root ${fontVars}`}>{children}</div>;
}
