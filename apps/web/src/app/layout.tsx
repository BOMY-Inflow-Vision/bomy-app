export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google"
import { cookies } from "next/headers"

import { Footer } from "@/components/footer"
import { SessionProvider } from "@/components/session-provider"
import { SmoothScroll } from "@/components/smooth-scroll"
import { ThemeProvider } from "@/components/theme-provider"
import { CartProvider } from "@/lib/cart"
import { FLASH_TOAST_COOKIE } from "@/lib/flash-toast"
import { NavBar } from "@/components/nav-bar"
import { ToastProvider } from "@/components/toaster"

import "lenis/dist/lenis.css"
import "./globals.css"

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
})
const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${bricolage.variable} ${geist.variable} ${geistMono.variable}`}
    >
      <body className={geist.className}>
        <ThemeProvider>
          <SessionProvider>
            <ToastProvider flash={flash}>
              <CartProvider>
                <SmoothScroll />
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
