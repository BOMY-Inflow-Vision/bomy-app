"use client"

import { useEffect, useRef, useState } from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createSerializedRunner } from "@/lib/serialized-runner"

import {
  addProductImage,
  getPresignedUploadUrl,
  removeProductImage,
  reorderImages,
} from "../../actions"

type ProductImage = {
  id: string
  url: string
  altText: string | null
  sortOrder: number
}

// Wraps one image thumbnail as a dnd-kit sortable grid item, with its own
// small grip handle overlay so dragging never fights the delete button that
// already lives on the same thumbnail.
function SortableImageThumb({
  image,
  onRemove,
}: {
  image: ProductImage
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <img
        src={image.url}
        alt={image.altText ?? ""}
        width={96}
        height={96}
        className="h-24 w-24 rounded-lg object-cover ring-1 ring-border"
      />
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Reorder image${image.altText ? `: ${image.altText}` : ""}`}
        className="absolute left-1 top-1 flex h-5 w-5 cursor-grab touch-none items-center justify-center rounded-full bg-black/50 text-white transition-opacity active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
      >
        <GripVertical className="h-3 w-3" aria-hidden="true" />
      </button>
      <Button
        type="button"
        onClick={() => onRemove(image.id)}
        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 p-0.5 text-white transition-opacity hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
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
  )
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

  const latestImages = useRef(initialImages)
  latestImages.current = initialImages

  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const [runReorderImages] = useState(() =>
    createSerializedRunner<string[]>(async (orderedIds) => {
      try {
        await reorderImages(productId, orderedIds)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save new order")
        setImages(latestImages.current)
      }
    }),
  )

  function handleImageDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setImages((current) => {
      const oldIndex = current.findIndex((img) => img.id === active.id)
      const newIndex = current.findIndex((img) => img.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return current
      const next = arrayMove(current, oldIndex, newIndex)
      void runReorderImages(next.map((img) => img.id))
      return next
    })
  }

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
          <DndContext
            id="image-reorder"
            sensors={dragSensors}
            collisionDetection={closestCenter}
            onDragEnd={handleImageDragEnd}
          >
            <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
              {images.map((img) => (
                <SortableImageThumb
                  key={img.id}
                  image={img}
                  onRemove={(id) => {
                    void handleRemove(id)
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>

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
