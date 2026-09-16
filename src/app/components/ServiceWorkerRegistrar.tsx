"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration fails on insecure origins and in some private windows.
        // The app is fully usable without the worker; it just isn't installable
        // or offline-capable there.
      });
    }
  }, []);

  return null;
}
