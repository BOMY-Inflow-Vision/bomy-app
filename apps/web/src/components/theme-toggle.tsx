"use client"

import * as React from "react"
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  // next-themes can't know the real theme until after hydration (it depends on
  // localStorage/system preference) — render a neutral placeholder until then so
  // the sun/moon icons never flash the wrong state or mismatch the server markup.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <Sun
        aria-hidden="true"
        className={cn(
          "absolute size-5 transition-[transform,opacity] duration-500 ease-spring motion-reduce:transition-none",
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
        )}
      />
      <Moon
        aria-hidden="true"
        className={cn(
          "absolute size-5 transition-[transform,opacity] duration-500 ease-spring motion-reduce:transition-none",
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
        )}
      />
    </button>
  )
}
