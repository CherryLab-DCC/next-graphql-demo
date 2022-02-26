/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  trailingSlash: true,
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
