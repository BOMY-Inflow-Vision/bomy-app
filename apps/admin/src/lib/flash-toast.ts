export const TOAST_TYPES = ["success", "info", "warning", "error"] as const
export type ToastType = (typeof TOAST_TYPES)[number]

export interface FlashToast {
  type: ToastType
  message: string
}

export const FLASH_TOAST_COOKIE = "bomy_admin_flash"
export const MAX_FLASH_MESSAGE_LENGTH = 300

function isToastType(value: unknown): value is ToastType {
  return typeof value === "string" && (TOAST_TYPES as readonly string[]).includes(value)
}

export function serializeFlashToast({ type, message }: FlashToast): string {
  return JSON.stringify({ type, message: message.slice(0, MAX_FLASH_MESSAGE_LENGTH) })
}

export function parseFlashToast(raw: string | null | undefined): FlashToast | null {
  if (!raw) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof value !== "object" || value === null) return null
  const { type, message } = value as Record<string, unknown>
  if (!isToastType(type) || typeof message !== "string" || message.trim() === "") return null
  return { type, message: message.slice(0, MAX_FLASH_MESSAGE_LENGTH) }
}

export function readCookieValue(cookieHeader: string, name: string): string | null {
  for (const pair of cookieHeader.split(/; */)) {
    const splitAt = pair.indexOf("=")
    if (splitAt === -1 || pair.slice(0, splitAt) !== name) continue
    try {
      return decodeURIComponent(pair.slice(splitAt + 1))
    } catch {
      return null
    }
  }
  return null
}
