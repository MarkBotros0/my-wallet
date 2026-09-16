import type { Metadata } from "next";
import LedgerPage from "@/app/components/ledger/LedgerPage";

export const metadata: Metadata = {
  title: "Transactions — My Wallet",
};

/** The ledger: a thin server component so the page owns its <title> and nothing else. */
export default function TransactionsPage() {
  return <LedgerPage />;
}
