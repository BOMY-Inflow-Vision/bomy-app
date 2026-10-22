// Test helper. Replaces every R3-owned string with «path» (and builders with «path(n)») so a section
// test can prove that the words on the page come from home-copy.ts and nowhere else.
import { HOME_COPY } from "@/app/_home/home-copy"

function walk(node: unknown, path: string): unknown {
  if (typeof node === "string") return `«${path}»`
  if (typeof node === "function") return (n: number) => `«${path}(${n})»`
  if (Array.isArray(node)) return node.map((item, i) => walk(item, `${path}.${i}`))
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([k, v]) => [k, walk(v, path ? `${path}.${k}` : k)]),
    )
  }
  return node
}

export function sentinelCopy(): typeof HOME_COPY {
  return walk(HOME_COPY, "") as typeof HOME_COPY
}

// The visible text nodes in `root` that are neither a sentinel, nor a number, nor one of the allowed
// real-data or reused-component strings. An empty result means no R3-owned word is hard-coded.
export function visibleTextOutside(root: Element, allowed: string[]): string[] {
  const out: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const text = (node.textContent ?? "").trim()
    if (!text) continue
    const el = node.parentElement
    if (el?.closest("[aria-hidden='true']") || el?.closest("script,style")) continue
    if (/^«[^»]+»$/.test(text)) continue
    if (/^[\d.,]+$/.test(text)) continue
    if (/^(from )?RM[\d.,]+$/.test(text)) continue
    if (allowed.some((a) => text === a || text.includes(a))) continue
    out.push(text)
  }
  return out
}
