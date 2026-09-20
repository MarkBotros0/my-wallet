import type { Metadata } from "next";
import { Suspense } from "react";
import GodsSharePage from "@/app/components/godsShare/GodsSharePage";
import Loading from "./loading";

export const metadata: Metadata = {
  title: "God's share — My Wallet",
};

/**
 * God's share: a thin server component so the page owns its <title> and
 * nothing else. The Suspense boundary is for `useSearchParams` in the page
 * (`?settle=1` opens the form) — without it the static build bails.
 */
export default function GodsShareRoute() {
  return (
    <Suspense fallback={<Loading />}>
      <GodsSharePage />
    </Suspense>
  );
}
