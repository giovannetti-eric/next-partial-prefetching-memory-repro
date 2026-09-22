import { Suspense } from "react";
import { headers } from "next/headers";
import { getContent } from "@/content";

// One entry is enough; every other slug is rendered on demand, which is the
// high-cardinality traffic shape that makes the retention visible.
export function generateStaticParams() {
  return [{ slug: "seed" }];
}

async function Content({ slug }: { slug: string }) {
  const { paragraphs } = await getContent(slug);
  return (
    <div>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}

// Reading a request-bound API keeps the route dynamic: the shell is emitted,
// then the render continues on the request path.
async function RequestBound() {
  const h = await headers();
  return <span data-ua={h.get("user-agent")?.slice(0, 24) ?? "none"} />;
}

export function SlugPage({ slug }: { slug: string }) {
  return (
    <main>
      <h1>{slug}</h1>
      <Suspense fallback={<p>loading request data…</p>}>
        <RequestBound />
      </Suspense>
      <Suspense fallback={<p>loading content…</p>}>
        <Content slug={slug} />
      </Suspense>
    </main>
  );
}
