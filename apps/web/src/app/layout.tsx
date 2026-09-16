export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"
import { cookies } from "next/headers"

import { Footer } from "@/components/footer"
import { SessionProvider } from "@/components/session-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { CartProvider } from "@/lib/cart"
import { FLASH_TOAST_COOKIE } from "@/lib/flash-toast"
import { NavBar } from "@/components/nav-bar"
import { ToastProvider } from "@/components/toaster"

import "./globals.css"

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-sans",
})
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "BOMY",
  description:
    "A curated brand collective, content media platform, and resource hub for brands and buyers.",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const flash = (await cookies()).get(FLASH_TOAST_COOKIE)?.value ?? null

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className={plusJakartaSans.className}>
        <ThemeProvider>
          <SessionProvider>
            <ToastProvider flash={flash}>
              <CartProvider>
                <NavBar />
                {children}
                <Footer />
              </CartProvider>
            </ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
