import type { Metadata } from "next";
import ClientPage from "@/app/components/clients/ClientPage";

export const metadata: Metadata = {
  title: "Client — My Wallet",
};

/** One client: the server component unwraps the route param and hands it to the client page. */
export default async function ClientRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientPage id={id} />;
}
