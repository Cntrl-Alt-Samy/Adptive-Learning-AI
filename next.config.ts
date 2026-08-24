import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Engine modules (src/**) use NodeNext-style explicit `.js` extensions;
  // webpack must substitute them back to `.ts` sources (Sprint 8a §8 risk).
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs']
    };
    return config;
  },
  experimental: {
    // /design gallery + dev-only routes stay out of production bundles.
    optimizePackageImports: ['katex']
  }
};

export default nextConfig;
