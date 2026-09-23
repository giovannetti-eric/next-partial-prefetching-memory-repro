import { ServerTimer } from "@/server-timer";
import { TimerPage } from "@/timer-page";

export { generateStaticParams } from "@/slug-page";

// /timer with Partial Prefetching enabled on the segment only. With the app-level
// flag off, the request still runs the runtime prefetch, but not the background
// upgrade of the fallback shell, which only the app-level flag turns on.
export const prefetch = "partial";

export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TimerPage params={params} title="opt-in-timer" timer={<ServerTimer />} />;
}
