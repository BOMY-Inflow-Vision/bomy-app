// Soft-red redesign R1: Bricolage Grotesque (headings), Geist (body), Geist Mono (labels), all
// open-source (OFL) via next/font/google. Headings read the display font through the base layer.
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const WEB = resolve(__dirname, "../..")
const layout = readFileSync(resolve(WEB, "src/app/layout.tsx"), "utf8")
const tailwind = readFileSync(resolve(WEB, "tailwind.config.ts"), "utf8")
const css = readFileSync(resolve(WEB, "src/app/globals.css"), "utf8")

describe("fonts", () => {
  it("loads Bricolage Grotesque, Geist and Geist Mono, and no longer the old families", () => {
    expect(layout).toMatch(/Bricolage_Grotesque/)
    expect(layout).toMatch(/\bGeist\b/)
    expect(layout).toMatch(/Geist_Mono/)
    expect(layout).not.toMatch(/Plus_Jakarta_Sans|IBM_Plex_Mono/)
  })

  it("exposes the three CSS variables on <html>", () => {
    expect(layout).toMatch(/variable:\s*"--font-display"/)
    expect(layout).toMatch(/variable:\s*"--font-sans"/)
    expect(layout).toMatch(/variable:\s*"--font-mono"/)
  })

  it("maps font-display in Tailwind to --font-display", () => {
    expect(tailwind).toMatch(/display:\s*\["var\(--font-display\)"/)
  })

  it("headings use the display font in the base layer", () => {
    const heading = css.slice(css.indexOf("h1,"), css.indexOf("}", css.indexOf("h1,")))
    expect(heading).toMatch(/font-display/)
  })
})
