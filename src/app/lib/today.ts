import { useSyncExternalStore } from "react";
import { toIsoDate } from "@/lib/ledger";

// Today's date in the BROWSER's calendar, read the hydration-safe way: null
// on the server and during the hydration render, the real day right after.
// The server's clock is in another timezone and may be on another day.
const noSubscribe = () => () => {};

/** 'YYYY-MM-DD' for the phone's today, or null until the client has rendered. */
export function useToday(): string | null {
  return useSyncExternalStore(noSubscribe, () => toIsoDate(new Date()), () => null);
}
