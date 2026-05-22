"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}
