import * as React from "react"

import { cn } from "../lib/utils.js"

// A one-file drop zone: click it, press Enter or Space on the focused input, or drop a file on it.
// The input is visually hidden (sr-only), not display:none, so it stays in the Tab order and
// the picker works from the keyboard. The dashed box shows the focus ring when the input has
// keyboard focus. What the box shows (text, icon, progress) is the caller's `children`; file
// checks and the upload stay with the caller. Only the first chosen or dropped file is used.
export type FileDropzoneProps = {
  onFile: (file: File) => void
  accept?: string
  // Disables the input and ignores drag and drop, for example while an upload runs.
  disabled?: boolean
  "aria-label": string
  "aria-describedby"?: string
  className?: string
  children: React.ReactNode | ((state: { isDragOver: boolean }) => React.ReactNode)
}

export function FileDropzone({
  onFile,
  accept,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  className,
  children,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = React.useState(false)
  const dragCounter = React.useRef(0)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Clear after handing off the file so choosing it again fires change again.
    e.target.value = ""
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    if (disabled) return
    dragCounter.current += 1
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current === 0) setIsDragOver(false)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  return (
    <label
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative flex h-24 w-24 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed text-muted-foreground transition-[transform,border-color,background-color] duration-150",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        isDragOver
          ? "scale-[1.02] border-primary bg-primary/5 text-primary"
          : "border-input hover:border-primary hover:text-primary",
        disabled && "pointer-events-none",
        className,
      )}
    >
      {typeof children === "function" ? children({ isDragOver }) : children}
      <input
        type="file"
        className="sr-only"
        accept={accept}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onChange={handleChange}
      />
    </label>
  )
}
