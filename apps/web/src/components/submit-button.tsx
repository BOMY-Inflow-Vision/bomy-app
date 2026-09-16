"use client"

import * as React from "react"
import { useFormStatus } from "react-dom"

import { Button, type ButtonProps } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export function SubmitButton({
  children,
  className,
  icon,
  arrowOnHover = true,
  variant,
  size,
}: {
  children: React.ReactNode
  className?: string
  icon?: React.ReactNode
  arrowOnHover?: boolean
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      variant={variant}
      size={size}
      // While pending the spinner takes the icon slot and the hover arrow is suppressed.
      icon={icon === undefined ? undefined : pending ? <Spinner /> : icon}
      arrowOnHover={arrowOnHover && !pending}
      className={cn("gap-2 disabled:cursor-not-allowed disabled:opacity-60", className)}
    >
      {icon === undefined && pending && <Spinner />}
      {children}
    </Button>
  )
}
