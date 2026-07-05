import { TunebadApp } from "@/components/TunebadApp";
import { LandingSeo } from "@/components/layout/LandingSeo";

export default function Home() {
  // Homepage-only slot. LandingSeo is a client component that localizes after
  // hydration, but its SSR output is English (the i18n provider's default), so
  // the content + FAQPage JSON-LD still land in the crawlable initial HTML.
  return <TunebadApp landingSlot={<LandingSeo />} />;
}
