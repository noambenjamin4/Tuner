import { TunebadApp } from "@/components/TunebadApp";
import { LandingSeo } from "@/components/layout/LandingSeo";

export default function Home() {
  // LandingSeo is passed as a server-rendered slot so its content + FAQPage
  // JSON-LD land in the initial HTML (client components can't SSR their own body
  // text here because the app's i18n renders on the client).
  return <TunebadApp landingSlot={<LandingSeo />} />;
}
