import type { Metadata } from "next";
import GodsSharePage from "@/app/components/godsShare/GodsSharePage";

export const metadata: Metadata = {
  title: "God's share — My Wallet",
};

/** God's share: a thin server component so the page owns its <title> and nothing else. */
export default function GodsShareRoute() {
  return <GodsSharePage />;
}
