import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ['@accelint/design-toolkit', '@accelint/icons', '@accelint/hotkey-manager'],
  },
}

export default nextConfig
