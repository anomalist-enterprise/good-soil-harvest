import { auth } from "@/auth";
import { isTrialEligible } from "@/lib/trial";
import { PricingClient } from "./PricingClient";

export default async function PricingPage() {
  const session = await auth();
  const trialEligible = await isTrialEligible(session?.user?.email);
  return <PricingClient trialEligible={trialEligible} />;
}
