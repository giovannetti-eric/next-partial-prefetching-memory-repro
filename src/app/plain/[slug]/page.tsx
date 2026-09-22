import { Suspense } from "react";
import { getContent } from "@/content";

export { generateStaticParams } from "@/slug-page";

// No request-bound API anywhere: the shell is static, and `params` is only read
// under <Suspense>, so the prerendered shell is not tied to one URL.
export default function Page({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <main>
      <h1>plain</h1>
      <Suspense fallback={<p>loading content…</p>}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { paragraphs } = await getContent(slug);
  return (
    <div>
      <h2>{slug}</h2>
      {paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  );
}
