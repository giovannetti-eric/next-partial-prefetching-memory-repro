import type { NextConfig } from "next";

// PARTIAL_PREFETCHING=true|false sets the flag; leave it unset for a Next version
// that predates the option (16.2.x rejects unknown keys at config validation).
// The same value must be present for `next build` and `next start`: the server
// reads the flag again at startup.
const partial = process.env.PARTIAL_PREFETCHING;

const nextConfig: NextConfig = {
  cacheComponents: true,
  ...(partial === undefined ? {} : { partialPrefetching: partial === "true" }),
};

export default nextConfig;
