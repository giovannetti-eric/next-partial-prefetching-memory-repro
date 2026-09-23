import { ClientTimer } from "@/client-timer";
import { TimerPage } from "@/timer-page";

export { generateStaticParams } from "@/slug-page";

// /timer with the timer scheduled by a client component during SSR instead of a
// server component.
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <TimerPage params={params} title="client-timer" timer={<ClientTimer />} />;
}
