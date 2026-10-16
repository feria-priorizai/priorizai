import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

const CABECERAS_DE_SEGURIDAD = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS_DE_SEGURIDAD }];
  },
  // Proxy de la API: el navegador solo habla con el frontend, así la cookie de
  // sesión es del mismo origen que la página (ver services/api.ts).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/upload-csv", destination: `${API_URL}/upload-csv` },
    ];
  },
  experimental: {
    proxyTimeout: 10 * 60 * 1000,
  },
};

export default nextConfig;
