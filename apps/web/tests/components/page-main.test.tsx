// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { PageMain } from "@/components/page-main"

function render(props: Omit<Parameters<typeof PageMain>[0], "children">) {
  const doc = new DOMParser().parseFromString(
    renderToStaticMarkup(
      <PageMain {...props}>
        <p>hello</p>
      </PageMain>,
    ),
    "text/html",
  )
  return doc.body
}
const has = (el: Element | null, tokens: string[]) => {
  expect(el).not.toBeNull()
  for (const t of tokens) expect(el!.classList.contains(t), `${t} on ${el!.className}`).toBe(true)
}

describe("PageMain", () => {
  it("is a main on the same frame as the nav bar and footer (1400 px of content, 20 px gutters)", () => {
    const main = render({}).querySelector("main")
    has(main, ["mx-auto", "min-w-0", "max-w-frame", "px-3", "sm:px-5", "py-8"])
    // the old per-page widths must be gone
    for (const old of ["max-w-6xl", "max-w-5xl", "max-w-3xl", "px-4"]) {
      expect(main!.classList.contains(old)).toBe(false)
    }
  })

  it("puts the children straight inside main by default", () => {
    expect(render({}).querySelector("main > p")!.textContent).toBe("hello")
  })

  it("narrow keeps a readable column, centred inside the frame", () => {
    const b = render({ narrow: true })
    has(b.querySelector("main"), ["max-w-frame"])
    has(b.querySelector("main > div"), ["mx-auto", "max-w-3xl"])
    expect(b.querySelector("main > div > p")!.textContent).toBe("hello")
  })

  it("passes className to main, innerClassName to the narrow column, and other props through", () => {
    const b = render({
      narrow: true,
      className: "py-12",
      innerClassName: "flex flex-col gap-8",
      role: "status",
    })
    const main = b.querySelector("main")!
    has(main, ["py-12"])
    expect(main.classList.contains("py-8")).toBe(false)
    expect(main.getAttribute("role")).toBe("status")
    has(b.querySelector("main > div"), ["flex", "flex-col", "gap-8", "max-w-3xl"])
  })
})
