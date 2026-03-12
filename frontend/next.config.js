const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

/** @type {import('next').NextConfig | ((phase: string) => import('next').NextConfig)} */
module.exports = (phase) => ({
  reactStrictMode: true,
  // Keep dev artifacts isolated from production build/start artifacts.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"
});
