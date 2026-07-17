import type { Metadata } from "next";
import { Geist, Geist_Mono, Barlow_Condensed, Barlow_Semi_Condensed } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Barlow Condensed — voz de datos de la marca: títulos (font-heading) y labels.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-cond",
  weight: ["500", "600", "700"],
  subsets: ["latin"],
});

// Barlow Semi Condensed — cuerpo de toda la app (mismo que el portal del socio).
const barlowSemiCondensed = Barlow_Semi_Condensed({
  variable: "--font-barlow-semi",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "La Cueva — Dashboard SRXFit",
  description: "Dashboard operativo de La Cueva Fitness Center y La Cueva Xtreme.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} ${barlowSemiCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
