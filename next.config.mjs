/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: '/@react-refresh',
        destination: '/api/stale-vite?asset=react-refresh',
      },
      {
        source: '/@vite/client',
        destination: '/api/stale-vite?asset=vite-client',
      },
      {
        source: '/src/main.jsx',
        destination: '/api/stale-vite?asset=main-jsx',
      },
      {
        source: '/src/main.tsx',
        destination: '/api/stale-vite?asset=main-tsx',
      },
    ];
  },
};

export default nextConfig;
