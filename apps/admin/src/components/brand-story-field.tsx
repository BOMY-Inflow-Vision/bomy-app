"use client"

import { useRef, useState } from "react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { StarterKit } from "@tiptap/starter-kit"
import { TableKit } from "@tiptap/extension-table"
import { Table as TiptapTable } from "@tiptap/extension-table/table"
import {
  Bold,
  Code,
  Heading3,
  Heading4,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Strikethrough,
  Table,
  Underline as UnderlineIcon,
  Youtube,
} from "lucide-react"

import { extractYoutubeVideoId } from "@bomy/shared/youtube"

import { Button } from "@bomy/ui/button"
import { Input } from "@bomy/ui/input"
import { Label } from "@bomy/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@bomy/ui/popover"
import { StaticImageNode } from "./static-image-node"
import { YoutubeEmbedExtension } from "./youtube-embed-extension"

const BorderedTable = TiptapTable.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-bordered": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-bordered") ?? null,
        renderHTML: (attrs) =>
          attrs["data-bordered"] ? { "data-bordered": String(attrs["data-bordered"]) } : {},
      },
    }
  },
})

interface Props {
  value: string | null
  onChange: (html: string) => void
  ariaLabel: string
}

export function BrandStoryField({ value, onChange, ariaLabel }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3, 4] },
        link: { openOnClick: false, defaultProtocol: "https" },
        codeBlock: false,
      }),
      TableKit.configure({ table: false }),
      BorderedTable,
      StaticImageNode,
      YoutubeEmbedExtension,
    ],
    content: value ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  })

  return (
    <div className="space-y-2">
      <div
        role="toolbar"
        aria-label="Brand story editor toolbar"
        className="flex flex-wrap gap-1 rounded border border-border bg-muted p-1"
      >
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor?.isActive("heading", { level: 3 }) ?? false}
          label="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()}
          active={editor?.isActive("heading", { level: 4 }) ?? false}
          label="Heading 4"
        >
          <Heading4 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive("bold") ?? false}
          label="Bold"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive("italic") ?? false}
          label="Italic"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive("underline") ?? false}
          label="Underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleStrike().run()}
          active={editor?.isActive("strike") ?? false}
          label="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <LinkButton editor={editor} />
        <ToolbarButton
          action={() => editor?.chain().focus().toggleCode().run()}
          active={editor?.isActive("code") ?? false}
          label="Inline code"
        >
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive("bulletList") ?? false}
          label="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive("orderedList") ?? false}
          label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive("blockquote") ?? false}
          label="Blockquote"
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          action={() => editor?.chain().focus().setHorizontalRule().run()}
          active={false}
          label="Horizontal rule"
        >
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <InsertTableButton editor={editor} />
        <span
          role="separator"
          aria-orientation="vertical"
          className="mx-1 h-5 w-px self-center bg-gray-300"
        />
        <InsertImageUrlButton editor={editor} />
        <EmbedYouTubeButton editor={editor} />
      </div>

      {editor?.isActive("table") && (
        <div
          role="toolbar"
          aria-label="Table controls"
          className="flex flex-wrap items-center gap-1 rounded border border-blue-100 bg-blue-50 p-1"
        >
          <span className="px-1 text-xs font-medium text-blue-600">Table:</span>
          <TableControlButton
            action={() => editor.chain().focus().addRowAfter().run()}
            label="Add row"
            icon={<Plus className="h-3 w-3" />}
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteRow().run()}
            label="Delete row"
            icon={<Minus className="h-3 w-3" />}
          />
          <span
            role="separator"
            aria-orientation="vertical"
            className="mx-1 h-4 w-px bg-blue-200"
          />
          <TableControlButton
            action={() => editor.chain().focus().addColumnAfter().run()}
            label="Add column"
            icon={<Plus className="h-3 w-3" />}
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteColumn().run()}
            label="Delete column"
            icon={<Minus className="h-3 w-3" />}
          />
          <span
            role="separator"
            aria-orientation="vertical"
            className="mx-1 h-4 w-px bg-blue-200"
          />
          <TableControlButton
            action={() => editor.chain().focus().deleteTable().run()}
            label="Delete table"
            icon={<Minus className="h-3 w-3" />}
            danger
          />
        </div>
      )}

      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:prose [&_.ProseMirror]:max-w-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:rounded [&_.ProseMirror]:border [&_.ProseMirror]:border-border [&_.ProseMirror]:p-3 [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:focus:ring-2 [&_.ProseMirror]:focus:ring-ring dark:[&_.ProseMirror]:prose-invert"
      />
    </div>
  )
}

function ToolbarButton({
  action,
  active,
  label,
  children,
}: {
  action: () => void
  active: boolean
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => action()}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`min-h-11 min-w-11 rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  )
}

function LinkButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (editor?.isActive("link")) {
          editor.chain().focus().unsetLink().run()
        } else {
          const url = prompt("URL (e.g. https://example.com):")
          if (!url) return
          const href =
            url.startsWith("https://") || url.startsWith("http://") ? url : `https://${url}`
          editor?.chain().focus().setLink({ href }).run()
        }
      }}
      aria-label="Set or unset link"
      aria-pressed={editor?.isActive("link") ?? false}
      title="Link"
      className={`min-h-11 min-w-11 rounded px-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        (editor?.isActive("link") ?? false)
          ? "bg-accent text-accent-foreground"
          : "bg-background text-foreground hover:bg-muted"
      }`}
    >
      <Link2 className="h-4 w-4" />
    </button>
  )
}

function InsertImageUrlButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = prompt("Image URL (must be https://):")
        if (!url || !url.startsWith("https://")) return
        const altResult = prompt("Alt text (describe the image — or leave empty for decorative):")
        if (altResult === null) return
        const alt = altResult
        const img = new window.Image()
        img.onload = () => {
          editor
            ?.chain()
            .focus()
            .insertContent({
              type: "imageUpload",
              attrs: {
                src: url,
                alt,
                width: img.naturalWidth || null,
                height: img.naturalHeight || null,
              },
            })
            .run()
        }
        img.onerror = () => {
          editor
            ?.chain()
            .focus()
            .insertContent({ type: "imageUpload", attrs: { src: url, alt } })
            .run()
        }
        img.src = url
      }}
      aria-label="Insert image by URL"
      title="Insert image by URL"
      className="min-h-11 min-w-11 rounded bg-background px-2 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ImageIcon className="h-4 w-4" />
    </button>
  )
}

function InsertTableButton({ editor }: { editor: Editor | null }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(2)
  const [cols, setCols] = useState(3)
  // Radix returns focus to the trigger on close; after a SUCCESSFUL insert it must stay in the editor.
  const insertedRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function handleInsert() {
    const opts = { rows, cols, withHeaderRow: true }
    // Tiptap's chain().focus() moves focus into the editor BEFORE insertTable runs, so a failed
    // insert cannot be undone afterwards: check first, and on failure close without touching the
    // editor so Radix returns focus to the toolbar button.
    if (!editor || !editor.can().insertTable(opts)) {
      setOpen(false)
      return
    }
    insertedRef.current = true // set synchronously, before React processes the close
    editor.chain().focus().insertTable(opts).run()
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Reopening during the exit animation keeps the old content mounted, so
        // onCloseAutoFocus never fires; clear a stale flag whenever the popover opens.
        if (next) insertedRef.current = false
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Insert table"
          title="Insert table"
          className="min-h-11 min-w-11 rounded bg-background px-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
        >
          <Table className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Insert table"
        className="w-52 p-3"
        onCloseAutoFocus={(e) => {
          if (insertedRef.current) {
            e.preventDefault()
            insertedRef.current = false
          }
        }}
        onKeyDown={(e) => {
          // Deliberate choice: Tab off the last control (or Shift+Tab off the first) closes the
          // panel and returns focus to the toolbar button. Radix's FocusScope would otherwise
          // loop focus to the opposite edge, so move focus to the trigger first (its edge check
          // then no longer matches and does nothing).
          if (e.key !== "Tab") return
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>("input, button:not([disabled])"),
          )
          const edge = e.shiftKey ? items[0] : items[items.length - 1]
          if (document.activeElement === edge) {
            e.preventDefault()
            triggerRef.current?.focus()
            setOpen(false)
          }
        }}
      >
        <p className="mb-2 text-xs font-semibold text-foreground">Insert table</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="table-rows" className="mb-0.5 block text-xs text-muted-foreground">
              Rows
            </Label>
            <Input
              id="table-rows"
              type="number"
              min={1}
              max={20}
              value={rows}
              onChange={(e) => setRows(Math.min(20, Math.max(1, Number(e.target.value))))}
              className="w-full text-sm"
            />
          </div>
          <div>
            <Label htmlFor="table-cols" className="mb-0.5 block text-xs text-muted-foreground">
              Columns
            </Label>
            <Input
              id="table-cols"
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value))))}
              className="w-full text-sm"
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!editor}
          onClick={handleInsert}
          className="mt-2 w-full"
        >
          Insert {rows} × {cols} table
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function TableControlButton({
  action,
  label,
  icon,
  danger = false,
}: {
  action: () => void
  label: string
  icon: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => action()}
      aria-label={label}
      title={label}
      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${danger ? "text-red-600 hover:bg-red-100" : "text-blue-700 hover:bg-blue-100"}`}
    >
      {icon}
      {label}
    </button>
  )
}

function EmbedYouTubeButton({ editor }: { editor: Editor | null }) {
  return (
    <button
      type="button"
      onClick={() => {
        const input = prompt("YouTube video URL or ID:")
        if (!input) return
        const videoId = extractYoutubeVideoId(input)
        if (!videoId) {
          alert("Could not extract a valid YouTube video ID.")
          return
        }
        const title = prompt("Video title (for accessibility):") ?? ""
        editor?.commands.insertYoutubeEmbed({ videoId, title })
      }}
      aria-label="Embed YouTube video"
      title="Embed YouTube video"
      className="min-h-11 min-w-11 rounded bg-background px-2 text-sm text-foreground hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Youtube className="h-4 w-4" />
    </button>
  )
}
