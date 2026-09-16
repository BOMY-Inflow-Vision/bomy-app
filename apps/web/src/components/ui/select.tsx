"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SelectProps {
  options: SelectOption[]
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  /** Renders a hidden input of this name so the value rides along in a FormData submit. */
  name?: string
  required?: boolean
  disabled?: boolean
  id?: string
  className?: string
  contentClassName?: string
  "aria-label"?: string
  "aria-labelledby"?: string
}

const DROPDOWN_OFFSET = 4
const CLOSE_ANIMATION_MS = 100
const ITEM_STAGGER_MS = 20

export function Select({
  options,
  value: controlledValue,
  defaultValue,
  onValueChange,
  placeholder = "Select…",
  name,
  required = false,
  disabled = false,
  id,
  className,
  contentClassName,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const [isClosing, setIsClosing] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? "")
  const [focusedIndex, setFocusedIndex] = React.useState(-1)
  const [position, setPosition] = React.useState({ left: 0, top: 0, width: 0 })
  const [portalReady, setPortalReady] = React.useState(false)

  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const wrapperRef = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => setPortalReady(true), [])

  const selectedValue = controlledValue === undefined ? internalValue : controlledValue
  const selectedOption = options.find((opt) => opt.value === selectedValue)

  const updatePosition = React.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({ left: rect.left, top: rect.bottom + DROPDOWN_OFFSET, width: rect.width })
  }, [])

  const close = React.useCallback(() => {
    setIsOpen(false)
    setIsClosing(true)
    setFocusedIndex(-1)
  }, [])

  React.useEffect(() => {
    if (!isClosing) return
    const timer = setTimeout(() => setIsClosing(false), CLOSE_ANIMATION_MS)
    return () => clearTimeout(timer)
  }, [isClosing])

  const handleSelect = React.useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return
      if (controlledValue === undefined) setInternalValue(opt.value)
      onValueChange?.(opt.value)
      close()
      triggerRef.current?.focus()
    },
    [controlledValue, onValueChange, close],
  )

  const handleToggle = React.useCallback(() => {
    if (disabled) return
    if (isOpen) {
      close()
      return
    }
    updatePosition()
    setIsOpen(true)
    setFocusedIndex(options.findIndex((opt) => opt.value === selectedValue))
  }, [disabled, isOpen, close, updatePosition, options, selectedValue])

  React.useEffect(() => {
    if (!isOpen) return
    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)
    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [isOpen, updatePosition])

  React.useEffect(() => {
    if (!isOpen) return
    function onClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (wrapperRef.current?.contains(target) || listRef.current?.contains(target)) return
      close()
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [isOpen, close])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isOpen) {
        const isActivation = event.key === "Enter" || event.key === " "
        if (isActivation && document.activeElement === triggerRef.current) {
          event.preventDefault()
          handleToggle()
        }
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        close()
        triggerRef.current?.focus()
      } else if (event.key === "ArrowDown") {
        event.preventDefault()
        setFocusedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1))
      } else if (event.key === "Enter") {
        event.preventDefault()
        const opt = options[focusedIndex]
        if (opt) handleSelect(opt)
      } else if (event.key === "Home") {
        event.preventDefault()
        setFocusedIndex(0)
      } else if (event.key === "End") {
        event.preventDefault()
        setFocusedIndex(options.length - 1)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [isOpen, options, focusedIndex, handleSelect, handleToggle, close])

  const dropdown = (isOpen || isClosing) && (
    <div
      ref={listRef}
      role="listbox"
      style={{ position: "fixed", left: position.left, top: position.top, width: position.width }}
      className={cn(
        "z-50 origin-top overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md",
        isOpen ? "animate-select-in" : "animate-select-out",
        contentClassName,
      )}
    >
      <div className="max-h-60 overflow-y-auto p-1">
        {options.map((opt, index) => {
          const isSelected = opt.value === selectedValue
          const isFocused = index === focusedIndex
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={opt.disabled}
              onClick={() => handleSelect(opt)}
              onMouseEnter={() => setFocusedIndex(index)}
              style={isOpen ? { animationDelay: `${index * ITEM_STAGGER_MS}ms` } : undefined}
              className={cn(
                "relative flex w-full animate-select-item-in items-center gap-2 rounded-sm py-1.5 pl-2 pr-8 text-left text-sm outline-none transition-colors motion-reduce:animate-none",
                opt.disabled
                  ? "pointer-events-none opacity-50"
                  : "hover:bg-accent hover:text-accent-foreground",
                isFocused && "bg-accent text-accent-foreground",
                isSelected && "font-medium",
              )}
            >
              <span className="flex-1 truncate">{opt.label}</span>
              {isSelected && (
                <span className="absolute right-2 flex size-3.5 items-center justify-center">
                  <Check className="size-4" />
                </span>
              )}
            </button>
          )
        })}
        {options.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No options</p>
        )}
      </div>
    </div>
  )

  return (
    // className governs layout/width here (on the shrink-to-fit shell), not the trigger's own
    // visual style — pass "w-full" for a stacked form field; omit it for an inline/flex-row control
    // (matches native <select>'s own default of sizing to its content, not stretching).
    <div className={cn("relative inline-block", className)} ref={wrapperRef}>
      {name && <input type="hidden" name={name} value={selectedValue} required={required} />}
      <button
        id={id}
        type="button"
        ref={triggerRef}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={handleToggle}
        data-placeholder={!selectedOption || undefined}
        className="flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-input border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-muted-foreground"
      >
        <span className="line-clamp-1 flex-1 text-left">
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 opacity-50 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {portalReady ? createPortal(dropdown, document.body) : null}
    </div>
  )
}
