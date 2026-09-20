import type { Metadata } from "next";
import ClientsPage from "@/app/components/clients/ClientsPage";

export const metadata: Metadata = {
  title: "Clients — My Wallet",
};

/** Clients: a thin server component so the page owns its <title> and nothing else. */
export default function ClientsRoute() {
  return <ClientsPage />;
}
