import type { NextConfig } from "next"

// Minimal local type for the webpack config surface we touch — avoids pulling
// in @types/webpack just for this one file. NextConfig["webpack"] is loosely
// typed upstream, so we cast in/out at the function boundary.
interface WebpackResolveLike {
  extensionAlias?: Record<string, string[]>
}
interface WebpackConfigLike {
  resolve?: WebpackResolveLike
}

const config: NextConfig = {
  output: "standalone",
  // BOMY workspace packages export TS source with NodeNext-style `.js`
  // specifiers inside (e.g. `export * from "./client.js"` resolving to
  // `./client.ts`). Next.js needs both:
  //   1. transpilePackages so it actually compiles the TS sources;
  //   2. webpack.resolve.extensionAlias so the `.js` specifiers resolve to
  //      the `.ts` files on disk.
  // Note: Turbopack (next dev --turbopack) does NOT yet support the
  // `.js → .ts` extensionAlias mapping. The dev script in package.json
  // uses plain `next dev` (webpack) for that reason. Revisit once
  // Turbopack ships an equivalent.
  transpilePackages: ["@bomy/db", "@bomy/mailer", "@bomy/hitpay"],
  webpack: (webpackConfig: unknown): unknown => {
    const cfg = webpackConfig as WebpackConfigLike
    const resolve: WebpackResolveLike = cfg.resolve ?? {}
    resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    }
    cfg.resolve = resolve
    return cfg
  },
}

export default config
