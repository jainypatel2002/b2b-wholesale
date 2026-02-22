/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Tree-shake unused icons from lucide-react (significant bundle saving)
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },
  images: {
    // Enable modern image formats
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
