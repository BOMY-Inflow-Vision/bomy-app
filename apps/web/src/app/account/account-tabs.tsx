import Link from "next/link"

interface Props {
  active: "profile" | "subscriptions"
}

export function AccountTabs({ active }: Props) {
  const base = "px-4 py-2 text-sm font-medium border-b-2 transition-colors"
  const activeClass = `${base} border-indigo-600 text-indigo-600`
  const inactiveClass = `${base} border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`

  return (
    <nav className="flex border-b border-gray-200 mb-6 -mx-8 px-8">
      <Link href="/account" className={active === "profile" ? activeClass : inactiveClass}>
        Profile
      </Link>
      <Link
        href="/account/subscriptions"
        className={active === "subscriptions" ? activeClass : inactiveClass}
      >
        Subscriptions
      </Link>
    </nav>
  )
}
