import { build } from "esbuild"
import { dirname, resolve } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

await build({
  entryPoints: [`${root}/src/index.ts`],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: `${root}/dist/index.js`,
  // Some bundled CJS packages (e.g. @opentelemetry/core) call require() for
  // Node built-ins at runtime. ESM bundles don't have require() natively, so
  // we inject createRequire + __dirname/__filename at the top of the bundle.
  banner: {
    js: [
      `import { createRequire } from "module";`,
      `import { fileURLToPath } from "url";`,
      `import { dirname } from "path";`,
      `const require = createRequire(import.meta.url);`,
      `const __filename = fileURLToPath(import.meta.url);`,
      `const __dirname = dirname(__filename);`,
    ].join("\n"),
  },
  // pino dynamically requires pino-pretty only when transport.target is set,
  // which only happens in isDev mode (NODE_ENV !== 'production').
  external: ["pino-pretty"],
})

console.log("build complete → dist/index.js")
