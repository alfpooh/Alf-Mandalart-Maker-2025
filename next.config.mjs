import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15 infers the workspace root from the nearest lockfiles, and there is
  // a stray package-lock.json in the home directory above this project. Left
  // to infer, file tracing would walk from there — a slow build that can pull
  // unrelated files into a standalone bundle. Pin it to this directory.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  typescript: {
    // Re-enabled once the tree typechecked clean. Leave it on: the old setting
    // let the removed-API breakage reach a deploy instead of the build.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs keeps a Node-only branch that does `await import("node:fs")`
      // to write a file to disk. The browser never reaches it — we take the
      // blob path — but webpack still tries to resolve the specifier and fails
      // on the `node:` scheme. Its own `browser` field would have stubbed
      // this, except `exports` takes precedence in modern resolution.
      config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^node:/ }))
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        https: false,
        http: false,
        "image-size": false,
      }
    }
    return config
  },
}

export default nextConfig
