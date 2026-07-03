import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { getCategories } from "../actions"
import { ProductForm } from "./product-form"

export default async function NewProductPage() {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const categories = await getCategories()

  return (
    <div className="p-8">
      <h1 className="mb-6 text-xl font-semibold text-foreground">New Product</h1>
      <ProductForm categories={categories} />
    </div>
  )
}
