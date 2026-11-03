import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Lint is run separately (`pnpm lint` / CI), not during the production build.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // `next build`'s "Checking validity of types ..." phase needs a lot of memory on small
  // build containers. Type-check runs separately via `pnpm typecheck` (and in CI), so
  // skipping it here keeps the production build within a small memory budget.
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [{ source: '/', destination: '/admin', permanent: false }]
  },
  images: {
    localPatterns: [
      {
        pathname: '/api/media/file/**',
      },
    ],
    // Add remotePatterns here if you serve media from an external CDN hostname:
    // remotePatterns: [{ protocol: 'https', hostname: 'cdn.example.com' }],
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
