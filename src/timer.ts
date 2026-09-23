import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { recordTimerCall } from "@/timer-calls";

const TIMER_MS = Number(process.env.NEXT_PUBLIC_TIMER_MS ?? 600_000);

// One pending timer scheduled from the current server render, the shape of a
// library that schedules per-request cleanup work (a query cache's
// garbage-collection delay, a pool's idle timeout). The callback is empty and
// captures nothing. The call is recorded under the work unit type of the render
// that made it (`request`, `prerender`, `prerender-runtime`), which is how
// `/api/timers` tells the renders of one request apart.
export function scheduleTimer() {
  recordTimerCall(workUnitAsyncStorage.getStore()?.type ?? "none");
  setTimeout(() => {}, TIMER_MS).unref();
}
