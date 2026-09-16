import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Custom animation utilities from tailwind.config.ts must be registered here too — otherwise
// tailwind-merge doesn't recognize them as belonging to the built-in "animate" group, so calling
// cn() with two animate-* classes (e.g. a default plus a call-site override) keeps both instead of
// the later one winning, and which one actually applies then depends on CSS declaration order in
// the stylesheet rather than on cn()'s call order (PR #124, recurred in PR #145 review — Bob).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      rounded: [{ rounded: ["control", "input", "card"] }],
      animate: [
        {
          animate: [
            "toast-in",
            "toast-out",
            "copy-pop",
            "select-in",
            "select-out",
            "select-item-in",
            "fade-rise-in",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
