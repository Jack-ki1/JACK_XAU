import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 2 monorepo: compile workspace TS sources in the web bundle.
  transpilePackages: ["@jack-trade/engine", "@jack-trade/shared"],
};

export default nextConfig;
