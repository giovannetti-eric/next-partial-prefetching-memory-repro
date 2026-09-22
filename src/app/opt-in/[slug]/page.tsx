import { SlugPage } from "@/slug-page";

export { generateStaticParams } from "@/slug-page";

// Opts this route into Partial Prefetching on its own, regardless of the
// app-level flag. Same page otherwise.
export const prefetch = "partial";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SlugPage slug={slug} />;
}
