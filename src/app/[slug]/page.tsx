import { SlugPage } from "@/slug-page";

export { generateStaticParams } from "@/slug-page";

// Follows the app-level `partialPrefetching` setting.
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SlugPage slug={slug} />;
}
