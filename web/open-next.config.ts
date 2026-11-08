import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// No incremental cache: every page is rendered per request from D1.
export default defineCloudflareConfig({});
