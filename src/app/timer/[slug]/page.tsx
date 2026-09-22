import { Suspense } from "react";
import { getContent } from "@/content";

export { generateStaticParams } from "@/slug-page";

// Same page as /plain, plus one timer scheduled during the request render: the
// shape of a library that schedules per-request cleanup work (a query cache's
// garbage-collection delay, a pool's idle timeout). The timer does nothing and
// keeps nothing on purpose.
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main>
      <h1>timer</h1>
      <Suspense fallback={<p>loading content…</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

const TIMER_MS = Number(process.env.NEXT_PUBLIC_TIMER_MS ?? 600_000);

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { paragraphs } = await getContent(slug);
  setTimeout(() => {}, TIMER_MS).unref();
  return (
    <div>
      <h2>{slug}</h2>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
