import { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./portal.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
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
  return <div className={`portal-root ${fraunces.variable}`}>{children}</div>;
}
