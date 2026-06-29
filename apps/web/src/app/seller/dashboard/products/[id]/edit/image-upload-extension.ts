import { Node, mergeAttributes } from "@tiptap/core"

import type { getBodyImageUploadUrl } from "../../actions"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageUpload: {
      uploadBodyImage: (file: File) => ReturnType
    }
  }
}

interface ImageUploadOptions {
  productId: string
  getUploadUrl: typeof getBodyImageUploadUrl
  onUploadStart: () => void
  onUploadProgress: (pct: number) => void
  onUploadComplete: () => void
  onUploadError: () => void
}

export const ImageUploadExtension = Node.create<ImageUploadOptions>({
  name: "imageUpload",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: "img[src]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)]
  },
  addCommands() {
    return {
      uploadBodyImage:
        (file: File) =>
        ({ editor }) => {
          const MAX_IMAGES = 10
          let imageCount = 0
          editor.state.doc.descendants((node) => {
            if (node.type.name === "imageUpload" || node.type.name === "image") imageCount++
          })
          if (imageCount >= MAX_IMAGES) {
            alert("Maximum 10 images per product body.")
            return false
          }

          const altResult = prompt("Alt text (describe the image — or leave empty for decorative):")
          if (altResult === null) {
            // User cancelled — abort upload
            return false
          }
          const alt = altResult

          const options = this.options
          options.onUploadStart()

          options
            .getUploadUrl(options.productId, file.type, file.size)
            .then((result) => {
              if (!result.ok) {
                options.onUploadError()
                alert(`Cannot upload: ${result.error}`)
                return
              }
              const { uploadUrl, publicUrl } = result
              const xhr = new XMLHttpRequest()
              xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                  options.onUploadProgress(Math.round((ev.loaded / ev.total) * 100))
                }
              }
              xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                  // Load image to capture dimensions for layout-shift prevention
                  const img = new window.Image()
                  img.onload = () => {
                    editor
                      .chain()
                      .focus()
                      .insertContent({
                        type: "imageUpload",
                        attrs: {
                          src: publicUrl,
                          alt,
                          width: img.naturalWidth || null,
                          height: img.naturalHeight || null,
                        },
                      })
                      .run()
                    options.onUploadComplete()
                  }
                  img.onerror = () => {
                    // Dimensions unavailable — insert without them
                    editor
                      .chain()
                      .focus()
                      .insertContent({ type: "imageUpload", attrs: { src: publicUrl, alt } })
                      .run()
                    options.onUploadComplete()
                  }
                  img.src = publicUrl
                } else {
                  options.onUploadError()
                }
              }
              xhr.onerror = () => options.onUploadError()
              xhr.open("PUT", uploadUrl)
              xhr.setRequestHeader("Content-Type", file.type)
              xhr.send(file)
            })
            .catch(() => options.onUploadError())

          return true
        },
    }
  },
})
