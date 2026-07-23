import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { LeadForm } from "@/components/marketing/lead-form";

export const metadata: Metadata = {
  title: "Agenda tu evaluación — La Cueva SRXFIT",
  description:
    "Déjanos tus datos y te contactamos para agendar tu evaluación en La Cueva SRXFIT, Sangolquí.",
};

export default function EmpezarPage() {
  return (
    <>
      <MarketingNav />
      <main className="lead-page">
        <LeadForm />
      </main>
      <MarketingFooter />
    </>
  );
}
