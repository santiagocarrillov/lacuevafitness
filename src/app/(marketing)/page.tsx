import { MarketingNav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { Method } from "@/components/marketing/method";
import { Sedes } from "@/components/marketing/sedes";
import { Closing } from "@/components/marketing/closing";
import { MarketingFooter } from "@/components/marketing/footer";
import { ConversionWidget } from "@/components/marketing/conversion-widget";

export default function HomePage() {
  return (
    <>
      <MarketingNav />
      <Hero />
      <Method />
      <Sedes />
      <Closing />
      <MarketingFooter />
      <ConversionWidget />
    </>
  );
}
