import type { NextConfig } from "next"

interface WebpackResolveLike {
  extensionAlias?: Record<string, string[]>
}
interface WebpackConfigLike {
  resolve?: WebpackResolveLike
}

const config: NextConfig = {
  output: "standalone",
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
