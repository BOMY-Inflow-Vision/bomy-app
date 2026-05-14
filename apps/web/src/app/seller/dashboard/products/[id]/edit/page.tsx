import { notFound, redirect } from "next/navigation"

import { auth } from "@/auth"
import { getProductForEdit } from "../../actions"
import { ImageManager } from "./image-manager"
import { ProductEditForm } from "./product-edit-form"

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect("/auth/sign-in")
  if (session.user.role !== "seller_owner") redirect("/account")

  const { id } = await params
  const data = await getProductForEdit(id)

  if (!data) notFound()

  const { product, variants, images, categories } = data

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Edit Product</h1>
        <a href="/seller/dashboard/products" className="text-sm text-gray-500 hover:underline">
          ← Back to Products
        </a>
      </div>

      <div className="space-y-6">
        <ProductEditForm product={product} variants={variants} categories={categories} />
        <ImageManager productId={product.id} images={images} />
      </div>
    </div>
  )
}
