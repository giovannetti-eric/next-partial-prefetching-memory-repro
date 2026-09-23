"use client";

import { recordTimerCall } from "@/timer-calls";

const TIMER_MS = Number(process.env.NEXT_PUBLIC_TIMER_MS ?? 600_000);

// The same timer, scheduled by a client component while it is server-rendered to
// HTML. That is where a query cache created in a client provider schedules its
// garbage-collection timer during SSR. Nothing runs in the browser.
export function ClientTimer() {
  if (typeof window === "undefined") {
    recordTimerCall("client-ssr");
    setTimeout(() => {}, TIMER_MS).unref();
  }
  return null;
}
