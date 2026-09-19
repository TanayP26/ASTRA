const backend = process.env.ASTRA_BACKEND_URL || "http://127.0.0.1:8050";
const staticExport = process.env.ASTRA_STATIC_EXPORT === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: staticExport ? "export" : "standalone",
  poweredByHeader: false,
  ...(staticExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: `${backend}/api/:path*`,
            },
          ];
        },
        async headers() {
          return [
            {
              source: "/:path*",
              headers: [
                { key: "X-Content-Type-Options", value: "nosniff" },
                { key: "Referrer-Policy", value: "same-origin" },
                { key: "X-Frame-Options", value: "DENY" },
              ],
            },
          ];
        },
      }),
};

export default nextConfig;
