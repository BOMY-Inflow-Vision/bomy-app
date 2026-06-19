import type { Metadata } from "next"
import "./globals.css"

import { auth } from "@/auth"
import { Sidebar } from "@/components/sidebar"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "BOMY Admin" }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()

  return (
    <html lang="en">
      <body className="flex min-h-screen">
        {session?.user && <Sidebar email={session.user.email ?? ""} />}
        <main className="flex-1 bg-slate-50">{children}</main>
      </body>
    </html>
  )
}
