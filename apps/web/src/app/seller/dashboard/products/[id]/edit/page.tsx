import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { auth } from "@/auth"
import { BodyEditor } from "@/components/body-editor"
import { Button } from "@/components/ui/button"
import { getBodyImageUploadUrl, getProductForEdit, saveProductBody } from "../../actions"
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
        <h1 className="text-xl font-semibold text-foreground">Edit Product</h1>
        <Button
          variant="link"
          size="sm"
          icon={<ArrowLeft />}
          arrowOnHover={false}
          className="text-muted-foreground"
          asChild
        >
          <a href="/seller/dashboard/products">Back to Products</a>
        </Button>
      </div>

      <div className="space-y-8">
        <ProductEditForm product={product} variants={variants} categories={categories} />
        <ImageManager productId={product.id} images={images} />

        <section aria-labelledby="body-editor-heading">
          <h2 id="body-editor-heading" className="mb-3 text-lg font-semibold text-foreground">
            Product Details
          </h2>
          <BodyEditor
            initialHtml={product.bodyHtml ?? null}
            initialRevision={product.bodyRevision}
            saveBody={saveProductBody.bind(null, product.id)}
            getUploadUrl={getBodyImageUploadUrl.bind(null, product.id)}
            successMessage="Product details saved"
          />
        </section>
      </div>
    </div>
  )
}
