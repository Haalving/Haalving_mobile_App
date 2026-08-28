import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,

  /* @haalving/shared is consumed as TypeScript SOURCE — there is no published
     build to import, and compiling it here keeps exactly one copy of the RBAC
     matrix in the repository. */
  transpilePackages: ['@haalving/shared'],

  webpack: (cfg) => {
    /**
     * The shared package writes ESM-correct specifiers (`./rbac.js`) so it also
     * runs under plain Node without a bundler. TypeScript rewrites those to
     * `.ts` on its own; webpack does not, and reports "Can't resolve
     * './rbac.js'" for a file that is right there as `rbac.ts`.
     *
     * This teaches the resolver the same rewrite. Without it the only
     * alternatives are extensionless imports (which break Node ESM) or a build
     * step for shared (which puts a stale artifact between the matrix and the
     * app).
     */
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.extensionAlias = {
      ...(cfg.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },

  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default config;
