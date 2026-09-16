"use client"

import { useRef, useState } from "react"
import { Camera } from "lucide-react"

import { useToast } from "@/components/toaster"
import { cn } from "@/lib/utils"

import { getAvatarUploadUrl, updateAvatarImage } from "./avatar-actions"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]

export function AvatarUploader({
  image: initialImage,
  name,
  email,
}: {
  image: string | null
  name: string | null
  email: string
}) {
  const toast = useToast()
  const [image, setImage] = useState(initialImage)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const initial = (name ?? email)[0]?.toUpperCase() ?? "?"

  async function upload(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("Only JPEG, PNG, WebP, GIF, or AVIF images are allowed")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be smaller than 2 MB")
      return
    }

    setUploading(true)
    try {
      const presign = await getAvatarUploadUrl(file.type, file.size)
      if (!presign.ok) {
        toast.error(presign.error)
        return
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`Upload failed: ${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.open("PUT", presign.uploadUrl)
        xhr.setRequestHeader("Content-Type", file.type)
        xhr.send(file)
      })

      const result = await updateAvatarImage(presign.key, presign.claim)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setImage(result.image)
      toast.success("Profile photo updated")
    } catch {
      toast.error("Upload failed. Please try again.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="relative inline-flex shrink-0">
      <label
        aria-label="Change profile photo"
        className={cn(
          "relative flex aspect-square h-16 w-16 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-muted text-2xl font-semibold text-muted-foreground transition-opacity",
          uploading && "pointer-events-none opacity-60",
        )}
      >
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initial}</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void upload(file)
          }}
        />
      </label>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"
      >
        <Camera className="size-3" />
      </span>
    </div>
  )
}
