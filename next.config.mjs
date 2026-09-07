/** @type {import('next').NextConfig} */
const nextConfig = {
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
}

export default nextConfig
