import { ServerTimer } from "@/server-timer";
import { TimerPage } from "@/timer-page";

export { generateStaticParams } from "@/slug-page";

// The /plain page plus one pending timer scheduled by a server component during
// the render. Follows the app-level `partialPrefetching` setting.
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TimerPage params={params} title="timer" timer={<ServerTimer />} />;
}
