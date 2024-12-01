/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    appDir: true
  },
  distDir: '.next',
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
}

module.exports = nextConfig
