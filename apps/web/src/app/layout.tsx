export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"

import { Footer } from "@/components/footer"
import { SessionProvider } from "@/components/session-provider"
import { CartProvider } from "@/lib/cart"
import { NavBar } from "@/components/nav-bar"

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}>
      <body className={plusJakartaSans.className}>
        <SessionProvider>
          <CartProvider>
            <NavBar />
            {children}
            <Footer />
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  )
}
