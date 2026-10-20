/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: false
  },
  async rewrites() {
    const iamApiUrl = process.env.IAM_API_URL || "http://localhost:8080";
    return [
      {
        source: "/api/iam/:path*",
        destination: `${iamApiUrl}/:path*`
      }
    ];
  }
};

export default nextConfig;
