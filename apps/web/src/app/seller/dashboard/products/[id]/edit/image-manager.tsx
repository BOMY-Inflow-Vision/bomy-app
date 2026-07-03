"use client"

import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { addProductImage, getPresignedUploadUrl, removeProductImage } from "../../actions"

type ProductImage = {
  id: string
  url: string
  altText: string | null
  sortOrder: number
}

export function ImageManager({
  productId,
  images: initialImages,
}: {
  productId: string
  images: ProductImage[]
}) {
  const [images, setImages] = useState(initialImages)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setImages(initialImages)
  }, [initialImages])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed")
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      setError("Image must be smaller than 2 MB")
      return
    }

    setError(null)
    setUploading(true)
    setProgress(0)

    try {
      const result = await getPresignedUploadUrl(file.type, file.size)
      if ("error" in result) throw new Error(result.error)
      const { url, key, claim } = result

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.open("PUT", url)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.send(file)
      })

      const newImage = await addProductImage(productId, key, claim)
      setImages((prev) => [...prev, newImage])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      setProgress(0)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleRemove(imageId: string) {
    try {
      await removeProductImage(imageId)
      setImages((prev) => prev.filter((img) => img.id !== imageId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove image")
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Images</h2>

        {error && (
          <p className="mb-3 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="group relative">
              <img
                src={img.url}
                alt={img.altText ?? ""}
                className="h-24 w-24 rounded-lg object-cover ring-1 ring-border"
              />
              <Button
                type="button"
                onClick={() => {
                  void handleRemove(img.id)
                }}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 p-0.5 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Remove image"
              >
                <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path
                    d="M1 1l10 10M11 1L1 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </Button>
            </div>
          ))}

          <label
            className={`relative flex h-24 w-24 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-input text-muted-foreground hover:border-primary hover:text-primary ${uploading ? "pointer-events-none" : ""}`}
          >
            {uploading ? (
              <>
                <span className="z-10 text-xs font-medium text-primary">{progress}%</span>
                <div
                  className="absolute bottom-0 left-0 h-1.5 bg-primary transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </>
            ) : (
              <>
                <span className="text-2xl">+</span>
                <span className="text-xs">Add image</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleFileChange(e)
              }}
              disabled={uploading}
            />
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP. Max 2 MB per image. Images are uploaded directly to cloud storage.
        </p>
      </CardContent>
    </Card>
  )
}
