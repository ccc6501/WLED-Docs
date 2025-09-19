/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000']
    },
    reactCompiler: true
  }
};

export default nextConfig;
