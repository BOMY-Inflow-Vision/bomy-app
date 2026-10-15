// man-5a3: text-primary reads --primary-text in both apps (fills, borders and rings keep --primary),
// and no text-primary/NN opacity step is left (an opacity step makes any token fail again).
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = resolve(__dirname, "../../../..")

describe.each(["apps/web/tailwind.config.ts", "apps/admin/tailwind.config.ts"])("%s", (file) => {
  const cfg = readFileSync(resolve(ROOT, file), "utf8")

  it("maps textColor.primary to --primary-text and keeps foreground on --primary-foreground", () => {
    const m = cfg.match(/textColor:\s*\{\s*primary:\s*\{([^}]*)\}/)
    expect(m, "textColor.primary block").not.toBeNull()
    expect(m![1]).toContain('DEFAULT: "hsl(var(--primary-text))"')
    expect(m![1]).toContain('foreground: "hsl(var(--primary-foreground))"')
  })

  it("keeps the colour primary (fills, borders, rings) on --primary", () => {
    const m = cfg.match(/colors:\s*\{[\s\S]*?primary:\s*\{([^}]*)\}/)
    expect(m, "colors.primary block").not.toBeNull()
    expect(m![1]).toContain('DEFAULT: "hsl(var(--primary))"')
    expect(m![1]).toContain('foreground: "hsl(var(--primary-foreground))"')
  })
})

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(tsx|ts|css)$/.test(name)) out.push(p)
  }
  return out
}

it("no source uses an opacity step on text-primary", () => {
  const hits: string[] = []
  for (const d of ["apps/web/src", "apps/admin/src", "packages/ui/src"]) {
    for (const f of sources(resolve(ROOT, d))) {
      if (/text-primary\/\d/.test(readFileSync(f, "utf8"))) hits.push(f.replace(ROOT, ""))
    }
  }
  expect(hits).toEqual([])
})
