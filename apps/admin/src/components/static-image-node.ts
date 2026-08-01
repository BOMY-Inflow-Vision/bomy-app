import { Node, mergeAttributes } from "@tiptap/core"

// Same node schema (name/attrs/parseHTML/renderHTML) as apps/web's ImageUploadExtension,
// but with no addCommands — admin never uploads a file (no store ID exists to key an R2
// object to until the store row is actually created). "Insert image by URL" still needs
// this node TYPE registered (it calls editor.chain().insertContent({ type: "imageUpload",
// ... }) directly, bypassing any command), so the node stays even with upload removed.
export const StaticImageNode = Node.create({
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
})
