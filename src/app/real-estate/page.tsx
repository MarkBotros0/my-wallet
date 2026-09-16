import type { Metadata } from "next";
import CapacityCalculator from "@/app/components/capacity/CapacityCalculator";

export const metadata: Metadata = {
  title: "Real Estate — My Wallet",
};

/**
 * The Real Estate tab. Today it holds one tool — the installment buying
 * capacity calculator; more property tools belong here when they arrive.
 * A thin server component so the page owns its <title> and nothing else.
 */
export default function RealEstatePage() {
  return <CapacityCalculator />;
}
