"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"

import { getBodyImageUploadUrl, saveProductBody } from "../../actions"
import { YoutubeEmbedExtension } from "./youtube-embed-extension"
import { ImageUploadExtension } from "./image-upload-extension"

interface Props {
  productId: string
  initialHtml: string | null
  initialRevision: number
  onDirtyChange: (dirty: boolean) => void
  onUploadStateChange: (uploading: boolean) => void
}

export function ProductBodyEditor({
  productId,
  initialHtml,
  initialRevision,
  onDirtyChange,
  onUploadStateChange,
}: Props) {
  const [revision, setRevision] = useState(initialRevision)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle")
  const [uploadProgress, setUploadProgress] = useState(0)
  const bodyHtmlRef = useRef<HTMLInputElement>(null)
  const savedHtmlRef = useRef(initialHtml ?? "")

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3, 4] } }),
      TableKit,
      ImageUploadExtension.configure({
        productId,
        onUploadStart: () => {
          setUploadStatus("uploading")
          setUploadProgress(0)
          onUploadStateChange(true)
        },
        onUploadProgress: (pct: number) => setUploadProgress(pct),
        onUploadComplete: () => {
          setUploadStatus("idle")
          onUploadStateChange(false)
        },
        onUploadError: () => {
          setUploadStatus("error")
          onUploadStateChange(false)
        },
        getUploadUrl: getBodyImageUploadUrl,
      }),
      YoutubeEmbedExtension,
    ],
    content: initialHtml ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML()
      if (bodyHtmlRef.current) bodyHtmlRef.current.value = html
      const newDirty = html !== savedHtmlRef.current
      setDirty(newDirty)
      onDirtyChange(newDirty)
    },
  })

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [dirty])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editor) return
    setSaveStatus("saving")
    setSaveError(null)
    const html = editor.getHTML()
    const result = await saveProductBody(productId, html, revision)
    if (result.ok) {
      setRevision(result.revision)
      setDirty(false)
      onDirtyChange(false)
      setSaveStatus("saved")
      savedHtmlRef.current = result.html ?? ""
      editor.commands.setContent(result.html ?? "")
      setTimeout(() => setSaveStatus("idle"), 2000)
    } else if (result.error === "conflict") {
      setSaveError(
        "Another tab or device saved this product. Copy your changes, then reload to get the latest version.",
      )
      setSaveStatus("idle")
    } else {
      setSaveError(`Save failed: ${result.error}`)
      setSaveStatus("idle")
    }
  }

  return (
    <div className="space-y-2">
      {dirty && (
        <div className="flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>You have unsaved changes.</span>
          <button
            type="button"
            className="font-medium underline"
            onClick={(e) => void handleSave(e as unknown as React.FormEvent)}
          >
            Save now
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 rounded border border-gray-200 bg-gray-50 p-1">
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold") ?? false}
          label="Bold"
          title="Bold"
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic") ?? false}
          label="Italic"
          title="Italic"
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive("heading", { level: 3 }) ?? false}
          label="Heading 3"
          title="Heading 3"
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor?.isActive("heading", { level: 4 }) ?? false}
          label="Heading 4"
          title="Heading 4"
        >
          H4
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList") ?? false}
          label="Bullet list"
          title="Bullet list"
        >
          •—
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList") ?? false}
          label="Numbered list"
          title="Numbered list"
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote") ?? false}
          label="Blockquote"
          title="Blockquote"
        >
          &quot;
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().insertTable({ rows: 2, cols: 2 }).run()}
          active={false}
          label="Insert table"
          title="Insert table"
        >
          ⊞
        </ToolbarButton>
        <InsertImageUrlButton editor={editor} />
        <UploadImageButton editor={editor} productId={productId} />
        <EmbedYouTubeButton editor={editor} />
      </div>

      {/* Upload progress */}
      <div role="status" aria-live="polite" className="text-sm">
        {uploadStatus === "uploading" && (
          <span className="text-blue-600">Uploading… {uploadProgress}%</span>
        )}
        {uploadStatus === "error" && (
          <span className="text-red-600">Upload failed. Please try again.</span>
        )}
        {saveStatus === "saved" && <span className="text-green-600">Saved.</span>}
      </div>

      <EditorContent
        editor={editor}
        className="min-h-[200px] rounded border border-gray-200 p-3 focus-within:ring-2 focus-within:ring-indigo-500"
      />

      {saveError && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {saveError}
          {saveError.includes("Another tab") && (
            <button
              type="button"
              className="ml-2 font-medium underline"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          )}
        </div>
      )}

      <form onSubmit={(e) => void handleSave(e)}>
        <input type="hidden" name="bodyHtml" ref={bodyHtmlRef} defaultValue={initialHtml ?? ""} />
        <input type="hidden" name="bodyRevision" value={revision} readOnly />
        <button
          type="submit"
          disabled={saveStatus === "saving" || uploadStatus === "uploading" || !dirty}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saveStatus === "saving" ? "Saving…" : "Save Product Details"}
        </button>
      </form>
    </div>
  )
}

function ToolbarButton({
  action,
  active,
  label,
  title,
  children,
}: {
  action: () => void
  active: boolean
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        action()
      }}
      aria-label={label}
      aria-pressed={active}
      title={title}
      className={`min-h-[44px] min-w-[44px] rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
        active ? "bg-indigo-100 text-indigo-700" : "bg-white text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  )
}

function InsertImageUrlButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        const url = prompt("Image URL (must be https://):")
        if (!url || !url.startsWith("https://")) return
        const alt = prompt("Alt text (describe the image):") ?? ""
        editor
          ?.chain()
          .focus()
          .insertContent({ type: "imageUpload", attrs: { src: url, alt } })
          .run()
      }}
      aria-label="Insert image by URL"
      title="Insert image by URL"
      className="min-h-[44px] min-w-[44px] rounded bg-white px-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      🔗🖼
    </button>
  )
}

function UploadImageButton({
  editor,
  productId: _productId,
}: {
  editor: Editor | null
  productId: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          inputRef.current?.click()
        }}
        aria-label="Upload image"
        title="Upload image"
        className="min-h-[44px] min-w-[44px] rounded bg-white px-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        ⬆🖼
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (!file) return
          // The actual upload is handled by ImageUploadExtension via the uploadBodyImage command.
          // productId is baked into the extension options at editor init time.
          editor?.commands.uploadBodyImage(file)
          e.target.value = ""
        }}
      />
    </>
  )
}

function EmbedYouTubeButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        const input = prompt("YouTube video URL or ID:")
        if (!input) return
        const idMatch =
          input.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{1,11})/) ??
          input.match(/^([a-zA-Z0-9_-]{1,11})$/)
        const videoId = idMatch?.[1]
        if (!videoId) {
          alert("Could not extract a valid YouTube video ID.")
          return
        }
        const title = prompt("Video title (for accessibility):") ?? ""
        editor?.commands.insertYoutubeEmbed({ videoId, title })
      }}
      aria-label="Embed YouTube video"
      title="Embed YouTube video"
      className="min-h-[44px] min-w-[44px] rounded bg-white px-2 text-sm text-gray-700 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      ▶
    </button>
  )
}
