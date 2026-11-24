import { productionOriginSchema } from '@draw-and-guess/shared';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  generateBuildId() {
    // Check the build-time value here so route type generation needs no environment.
    if (
      !productionOriginSchema.safeParse(process.env.NEXT_PUBLIC_SOCKET_URL)
        .success
    ) {
      throw new Error(
        'Set NEXT_PUBLIC_SOCKET_URL to an HTTPS API origin or an explicit HTTP loopback origin for local checks.',
      );
    }
    return null;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
