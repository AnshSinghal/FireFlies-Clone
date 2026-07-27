import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /* `X-Powered-By: Next.js` on every response is free reconnaissance and buys
     nothing. The rest of the security headers are set by nginx and have been
     since T-44; this is the one the framework adds. */
  poweredByHeader: false,

  // The repo root also has a package-lock.json (the tooling-only package that
  // owns the git hooks), so Turbopack infers the workspace root one level too
  // high and warns on every start. Pin it to this app.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
