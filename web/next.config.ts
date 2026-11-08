import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
import type { NextConfig } from 'next';

// `next dev` gets the same D1 / R2 bindings as the Worker (local Miniflare state in .wrangler/).
initOpenNextCloudflareForDev();

// Pages read D1 per request (fast, at the edge). Cache Components is off: it needs the Node.js
// runtime and is not guaranteed on Cloudflare Workers.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  images: { unoptimized: true },
};

export default nextConfig;
