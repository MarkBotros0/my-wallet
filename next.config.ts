import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The route handlers use postgres.js and bcryptjs, both plain Node — no
  // special runtime config needed. Turbopack is the default bundler in 16.
};

export default nextConfig;
