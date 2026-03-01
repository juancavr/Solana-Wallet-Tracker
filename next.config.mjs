/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable instrumentation hook
  experimental: {
    instrumentationHook: true,
    // Keep better-sqlite3 as a server-side external (native module)
    serverComponentsExternalPackages: ['better-sqlite3'],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle server-only modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
