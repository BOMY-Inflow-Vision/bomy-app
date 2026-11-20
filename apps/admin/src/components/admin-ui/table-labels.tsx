"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

// Below 900px every table in a Tile is drawn as a list of cards (see globals.css), and a card needs
// each value to say what it is. The table markup already names its columns in <thead>, so copy the
// heading text onto the cells as data-label; the CSS prints it. Runs after every page change and
// whenever the page content changes (filters, paging) and does nothing visible on wide screens.
export function labelTables(root: ParentNode) {
  for (const table of root.querySelectorAll<HTMLTableElement>(".admin-tile table")) {
    const heads = [...table.querySelectorAll<HTMLTableCellElement>("thead th")].map(
      (th) => th.textContent?.trim() ?? "",
    )
    if (heads.length === 0) continue
    for (const row of table.querySelectorAll<HTMLTableRowElement>("tbody tr")) {
      row.querySelectorAll<HTMLTableCellElement>(":scope > td").forEach((td, i) => {
        const label = td.colSpan > 1 ? "" : (heads[i] ?? "")
        if (label && td.getAttribute("data-label") !== label) td.setAttribute("data-label", label)
      })
    }
  }
}

export function TableLabels() {
  const pathname = usePathname()
  useEffect(() => {
    labelTables(document)
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => labelTables(document))
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname])
  return null
}
