import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * repolayer lazily imports `node:sqlite` (and `pg` on the Postgres driver). Keeping it
   * external leaves those as real Node requires instead of something the bundler has to
   * resolve at build time.
   */
  serverExternalPackages: ["repolayer"],
};

export default nextConfig;
