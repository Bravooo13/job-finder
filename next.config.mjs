/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  serverExternalPackages: ["@libsql/client", "libsql"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
