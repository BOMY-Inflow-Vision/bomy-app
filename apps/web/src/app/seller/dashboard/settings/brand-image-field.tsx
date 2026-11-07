"use client"

import { useId, useState } from "react"
import { Crop, Trash2, Upload } from "lucide-react"

import { FocusEditor } from "@/components/focus-editor"
import { useToast } from "@/components/toaster"
import { focalStyle } from "@/lib/focal"
import { Button } from "@bomy/ui/button"
import { FileDropzone } from "@bomy/ui/file-dropzone"
import { cn } from "@/lib/utils"

import {
  type BrandImageResult,
  getBrandImageUploadUrl,
  removeBrandImage,
  saveBrandImage,
  setBrandImageFocus,
} from "./brand-image-actions"

const MAX_BYTES = 2 * 1024 * 1024

// The brand picture on the Brands listing and the home page: upload one, then drag it to choose
// what stays in view in the square tile. Same crop control as product pictures. Without a picture
// the tile shows the brand's first letter.
export function BrandImageField({
  initialImageUrl,
  initialFocalX,
  initialFocalY,
  brandName,
}: {
  initialImageUrl: string | null
  initialFocalX: number
  initialFocalY: number
  brandName: string
}) {
  const [imageUrl, setImageUrl] = useState(initialImageUrl)
  const [focal, setFocal] = useState({ x: initialFocalX, y: initialFocalY })
  const [adjusting, setAdjusting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const hintId = useId()

  function fail(message: string) {
    setError(message)
    toast.error(message)
  }

  function apply(result: BrandImageResult) {
    if (!result.ok) throw new Error(result.error)
    setImageUrl(result.imageUrl)
    setFocal({ x: result.focalX, y: result.focalY })
  }

  async function processFile(file: File) {
    if (!file.type.startsWith("image/")) return fail("Only image files are allowed")
    if (file.size > MAX_BYTES) return fail("Image must be smaller than 2 MB")

    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const presigned = await getBrandImageUploadUrl(file.type, file.size)
      if ("error" in presigned) throw new Error(presigned.error)

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed: ${xhr.status}`))
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.open("PUT", presigned.url)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.send(file)
      })

      apply(await saveBrandImage(presigned.key, presigned.claim))
      setAdjusting(false)
      toast.success("Brand picture saved")
    } catch (err) {
      fail(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      apply(await removeBrandImage())
      setAdjusting(false)
      setError(null)
      toast.success("Brand picture removed")
    } catch (err) {
      fail(err instanceof Error ? err.message : "Could not remove the picture")
    } finally {
      setRemoving(false)
    }
  }

  async function handleFocusSave(x: number, y: number) {
    setSaving(true)
    try {
      apply(await setBrandImageFocus(x, y))
      setAdjusting(false)
      setError(null)
      toast.success("Focus saved")
    } catch (err) {
      fail(err instanceof Error ? err.message : "Failed to save focus")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`${brandName} brand picture`}
            width={160}
            height={160}
            className="size-40 rounded-bento object-cover ring-1 ring-border"
            style={focalStyle(focal.x, focal.y)}
          />
        ) : null}
        <div className="flex flex-col gap-3">
          <FileDropzone
            onFile={(file) => {
              void processFile(file)
            }}
            accept="image/*"
            disabled={uploading || removing}
            aria-label={imageUrl ? "Replace brand picture" : "Add brand picture"}
            aria-describedby={hintId}
            className={imageUrl ? "h-16 w-40" : "h-40 w-40"}
          >
            {({ isDragOver }) =>
              uploading ? (
                <>
                  <span className="z-10 text-xs font-medium text-primary">{progress}%</span>
                  <div
                    className="absolute bottom-0 left-0 h-1.5 bg-primary transition-all duration-150"
                    style={{ width: `${progress}%` }}
                  />
                </>
              ) : (
                <>
                  <Upload
                    className={cn(
                      "size-6 transition-transform duration-150",
                      isDragOver && "-translate-y-1 scale-110",
                    )}
                    aria-hidden="true"
                  />
                  <span className="mt-1 text-xs">
                    {isDragOver ? "Drop to upload" : imageUrl ? "Replace picture" : "Add picture"}
                  </span>
                </>
              )
            }
          </FileDropzone>
          {imageUrl && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Crop />}
                aria-pressed={adjusting}
                disabled={uploading || removing}
                onClick={() => setAdjusting((v) => !v)}
              >
                Adjust crop
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                disabled={uploading || removing}
                onClick={() => {
                  void handleRemove()
                }}
              >
                {removing ? "Removing…" : "Remove"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {imageUrl && adjusting && (
        <div className="mt-4">
          <FocusEditor
            key={imageUrl}
            src={imageUrl}
            alt=""
            initialX={focal.x}
            initialY={focal.y}
            saving={saving}
            onSave={(x, y) => {
              void handleFocusSave(x, y)
            }}
            onCancel={() => setAdjusting(false)}
          />
        </div>
      )}

      <p id={hintId} className="mt-3 text-xs text-muted-foreground">
        Square picture shown on the Brands page and the home page. JPEG, PNG, WebP. Max 2 MB.
        Without one, your brand&apos;s first letter is shown.
      </p>
    </div>
  )
}
