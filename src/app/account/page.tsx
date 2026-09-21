import type { Metadata } from "next";
import AccountPage from "@/app/components/account/AccountPage";

export const metadata: Metadata = {
  title: "Account — My Wallet",
};

/** Account: a thin server component so the page owns its <title> and nothing else. */
export default function AccountRoute() {
  return <AccountPage />;
}
