import "server-only"

import { cookies } from "next/headers"

import { FLASH_TOAST_COOKIE, serializeFlashToast, type ToastType } from "@/lib/flash-toast"

// Only callable where Next allows cookie writes: Server Actions and Route Handlers (incl. Auth.js events).
// Not httpOnly on purpose: the client toaster clears it after showing; it carries UI copy only.
export async function flashToast(type: ToastType, message: string): Promise<void> {
  const store = await cookies()
  store.set(FLASH_TOAST_COOKIE, serializeFlashToast({ type, message }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}
