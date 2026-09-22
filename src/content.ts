// A cached scope per slug, sized like a real content page. The response is
// ~565 KB: the markup plus the RSC payload that carries the same text again.
export async function getContent(slug: string) {
  "use cache";
  const paragraphs = Array.from({ length: 900 }, (_, i) => `${slug} paragraph ${i} ${"lorem ipsum dolor sit amet ".repeat(6)}`);
  return { paragraphs, slug };
}
