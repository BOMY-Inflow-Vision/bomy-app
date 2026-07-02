import React from "react"
import type { ReactNode } from "react"
import { parse, NodeType, type Node, type HTMLElement } from "node-html-parser"

import { VideoEmbed } from "./video-embed"

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/
const HTTPS_RE = /^https:\/\//

const BLOCK_TAGS = new Set([
  "p",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "figure",
])
const INLINE_TAGS = new Set(["strong", "em", "u", "s", "code", "a", "img"])
const ALL_ALLOWED = new Set([...BLOCK_TAGS, ...INLINE_TAGS])

function renderNode(node: Node, key: string): ReactNode {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = (node as { text?: string }).text ?? ""
    return text || null
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return null

  const el = node as HTMLElement
  const tag = el.tagName?.toLowerCase() ?? ""
  const children = el.childNodes.map((child, i) => renderNode(child, `${key}-${i}`)).filter(Boolean)

  if (!ALL_ALLOWED.has(tag)) {
    // Unknown tag: discard element, preserve children
    return children.length > 0 ? <React.Fragment key={key}>{children}</React.Fragment> : null
  }

  switch (tag) {
    case "a": {
      const href = el.getAttribute("href") ?? ""
      if (!HTTPS_RE.test(href)) return <React.Fragment key={key}>{children}</React.Fragment>
      return (
        <a key={key} href={href} rel="noopener noreferrer nofollow ugc" target="_blank">
          {children}
        </a>
      )
    }

    case "img": {
      const src = el.getAttribute("src") ?? ""
      if (!HTTPS_RE.test(src)) return null
      return (
        <img
          key={key}
          src={src}
          alt={el.getAttribute("alt") ?? ""}
          width={el.getAttribute("width") ?? undefined}
          height={el.getAttribute("height") ?? undefined}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      )
    }

    case "table": {
      const bordered = el.getAttribute("data-bordered") === "true"
      return (
        <div key={key} className="overflow-x-auto">
          <table
            className={
              bordered
                ? "w-full border-collapse [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold"
                : undefined
            }
          >
            {children}
          </table>
        </div>
      )
    }

    case "figure": {
      const provider = el.getAttribute("data-video-provider")
      const videoId = el.getAttribute("data-video-id") ?? ""
      const title = el.getAttribute("data-video-title") ?? null
      if (provider !== "youtube" || !VIDEO_ID_RE.test(videoId)) return null
      return <VideoEmbed key={key} videoId={videoId} title={title} />
    }

    case "hr":
      return <hr key={key} />

    case "p":
      return <p key={key}>{children}</p>
    case "h3":
      return <h3 key={key}>{children}</h3>
    case "h4":
      return <h4 key={key}>{children}</h4>
    case "strong":
      return <strong key={key}>{children}</strong>
    case "em":
      return <em key={key}>{children}</em>
    case "u":
      return <u key={key}>{children}</u>
    case "s":
      return <s key={key}>{children}</s>
    case "code":
      return <code key={key}>{children}</code>
    case "pre":
      return (
        <pre key={key} className="overflow-x-auto">
          {children}
        </pre>
      )
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>
    case "ul":
      return <ul key={key}>{children}</ul>
    case "ol":
      return <ol key={key}>{children}</ol>
    case "li":
      return <li key={key}>{children}</li>
    case "thead":
      return <thead key={key}>{children}</thead>
    case "tbody":
      return <tbody key={key}>{children}</tbody>
    case "tr":
      return <tr key={key}>{children}</tr>
    case "th": {
      const colspan = el.getAttribute("colspan")
      const rowspan = el.getAttribute("rowspan")
      const scope = el.getAttribute("scope")
      return (
        <th
          key={key}
          colSpan={colspan ? Number(colspan) : undefined}
          rowSpan={rowspan ? Number(rowspan) : undefined}
          scope={scope ?? undefined}
        >
          {children}
        </th>
      )
    }
    case "td": {
      const colspan = el.getAttribute("colspan")
      const rowspan = el.getAttribute("rowspan")
      return (
        <td
          key={key}
          colSpan={colspan ? Number(colspan) : undefined}
          rowSpan={rowspan ? Number(rowspan) : undefined}
        >
          {children}
        </td>
      )
    }
    default:
      return <>{children}</>
  }
}

export function renderBodyHtml(html: string): ReactNode {
  const root = parse(html)
  const nodes = root.childNodes.map((node, i) => renderNode(node, String(i))).filter(Boolean)
  return <>{nodes}</>
}

export function BodyRenderer({ html }: { html: string }) {
  return <>{renderBodyHtml(html)}</>
}
