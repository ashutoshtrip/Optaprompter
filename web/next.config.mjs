/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@optaprompter/shared'],
  // Yjs ships CJS + ESM; keep server bundling happy.
  serverExternalPackages: ['yjs'],
};

export default nextConfig;
