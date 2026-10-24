"use client"

import { Pause, Play } from "lucide-react"
import { useState } from "react"

import { Button } from "@bomy/ui/button"

import type { HOME_COPY } from "./home-copy"
import type { HomeCategory } from "./home-types"

// A band of words and real category names between the hero and the shop. The words are decoration
// (screen readers skip them) and anything wider than the screen is cut. Two identical copies sit
// side by side and the track slides by exactly one copy, so the loop is seamless. Each copy is at
// least a screen wide, so no gap shows at the right edge however few words there are. With reduced
// motion the second copy and the pause button are hidden and the band stays still.
// The pause button is outside the hidden band so keyboard and screen-reader users can stop it.
export function Marquee({
  categories,
  copy,
}: {
  categories: HomeCategory[]
  copy: (typeof HOME_COPY)["marquee"]
}) {
  const [paused, setPaused] = useState(false)
  const words = [...copy, ...categories.map((c) => c.name)]
  const list = (hideForReducedMotion: boolean) => (
    <ul
      className={`flex min-w-[100vw] shrink-0 items-center justify-around whitespace-nowrap font-display text-lg text-foreground ${
        hideForReducedMotion ? "motion-reduce:hidden" : ""
      }`}
    >
      {words.map((w, i) => (
        <li key={`${i}-${w}`} className="flex items-center gap-6">
          <span>{w}</span>
          <span className="size-1.5 rounded-full bg-primary" />
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex items-center gap-2">
      <div
        data-home="marquee"
        aria-hidden="true"
        className="min-w-0 flex-1 overflow-hidden rounded-full border border-border bg-card py-3"
      >
        <div
          data-marquee-track
          style={{ animationPlayState: paused ? "paused" : "running" }}
          className="flex w-max motion-safe:animate-marquee"
        >
          {list(false)}
          {list(true)}
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0 rounded-full motion-reduce:hidden"
        aria-label={paused ? "Play moving words" : "Pause moving words"}
        onClick={() => setPaused((p) => !p)}
      >
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </Button>
    </div>
  )
}
