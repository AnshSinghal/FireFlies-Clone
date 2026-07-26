import path from 'node:path'

import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The repo root also has a package-lock.json (the tooling-only package that
  // owns the git hooks), so Turbopack infers the workspace root one level too
  // high and warns on every start. Pin it to this app.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
}

export default nextConfig
