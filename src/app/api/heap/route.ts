import { writeHeapSnapshot } from "node:v8";
import { connection } from "next/server";

// Writes a V8 heap snapshot after a full GC and returns its path, for retainer
// analysis in Chrome DevTools. `connection()` keeps the route dynamic.
export async function GET() {
  await connection();
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  gc?.();
  const file = writeHeapSnapshot();
  return Response.json({ file });
}
