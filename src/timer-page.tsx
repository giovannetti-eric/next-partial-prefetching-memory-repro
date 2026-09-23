import { type ReactNode, Suspense } from "react";
import { getContent } from "@/content";

// The /plain page with one extra child inside the content: the timer. `timer`
// renders under the same Suspense boundary, after the cached content resolved.
export function TimerPage({ params, title, timer }: { params: Promise<{ slug: string }>; title: string; timer: ReactNode }) {
  return (
    <main>
      <h1>{title}</h1>
      <Suspense fallback={<p>loading content…</p>}>
        <Content params={params} timer={timer} />
      </Suspense>
    </main>
  );
}

async function Content({ params, timer }: { params: Promise<{ slug: string }>; timer: ReactNode }) {
  const { slug } = await params;
  const { paragraphs } = await getContent(slug);
  return (
    <div>
      {timer}
      <h2>{slug}</h2>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
