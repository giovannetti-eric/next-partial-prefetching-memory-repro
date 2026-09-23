import { scheduleTimer } from "@/timer";

// A server component whose only effect is the pending timer.
export function ServerTimer() {
  scheduleTimer();
  return null;
}
