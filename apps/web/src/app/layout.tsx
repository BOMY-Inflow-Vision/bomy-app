export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { Inter } from "next/font/google"

import { Footer } from "@/components/footer"
import { SessionProvider } from "@/components/session-provider"
import { CartProvider } from "@/lib/cart"
import { NavBar } from "@/components/nav-bar"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "BOMY",
  description:
    "A curated brand collective, content media platform, and resource hub for brands and buyers.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
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
