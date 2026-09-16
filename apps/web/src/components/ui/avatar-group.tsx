import * as React from "react"

import { cn } from "@/lib/utils"

export interface AvatarGroupItem {
  id: string
  image: string | null
  initial: string
}

export function AvatarGroup({
  avatars,
  total,
  className,
}: {
  avatars: AvatarGroupItem[]
  /** Total count behind the visible avatars; anything beyond avatars.length renders as "+N". */
  total: number
  className?: string
}) {
  if (avatars.length === 0) return null

  const hiddenCount = total - avatars.length

  return (
    <div
      role="group"
      aria-label={`${total} ${total === 1 ? "subscriber" : "subscribers"}`}
      className={cn(
        // -space-x-3 overlaps the avatars; on hover-capable pointers they fan out to space-x-1.
        "flex -space-x-3 [@media(hover:hover)]:hover:space-x-1",
        className,
      )}
    >
      {avatars.map((avatar, index) => (
        <span
          key={avatar.id}
          aria-hidden="true"
          style={{ zIndex: avatars.length - index, animationDelay: `${index * 40}ms` }}
          className="relative aspect-square size-10 shrink-0 animate-avatar-pop-in overflow-hidden rounded-full border-2 border-background bg-muted transition-[margin] duration-200 ease-spring motion-reduce:animate-none [@media(hover:hover)]:hover:scale-105"
        >
          {avatar.image ? (
            <img src={avatar.image} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground">
              {avatar.initial}
            </span>
          )}
        </span>
      ))}

      {hiddenCount > 0 && (
        <span
          aria-hidden="true"
          style={{ zIndex: 0, animationDelay: `${avatars.length * 40}ms` }}
          className="relative flex aspect-square size-10 shrink-0 animate-avatar-pop-in items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted text-xs font-medium text-muted-foreground transition-[margin] duration-200 ease-spring motion-reduce:animate-none"
        >
          {`+${hiddenCount}`}
        </span>
      )}
    </div>
  )
}
