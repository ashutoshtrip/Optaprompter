/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@optaprompter/shared'],
  experimental: {
    // Yjs ships CJS + ESM; keep server bundling happy.
    serverComponentsExternalPackages: ['yjs'],
  },
};

export default nextConfig;
