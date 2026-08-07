import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"

import { auth } from "@/auth"
import { Sidebar } from "@/components/sidebar"

export const dynamic = "force-dynamic"

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

export const metadata: Metadata = { title: "BOMY Admin" }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable}`}>
      <body className={`flex min-h-screen ${plusJakartaSans.className}`}>
        {session?.user && <Sidebar email={session.user.email ?? ""} />}
        <main className="flex-1 bg-muted">{children}</main>
      </body>
    </html>
  )
}
