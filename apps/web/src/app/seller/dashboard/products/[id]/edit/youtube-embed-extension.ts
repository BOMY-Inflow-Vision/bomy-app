import { Node, mergeAttributes } from "@tiptap/core"

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{1,11}$/

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      insertYoutubeEmbed: (attrs: { videoId: string; title: string }) => ReturnType
    }
  }
}

export const YoutubeEmbedExtension = Node.create({
  name: "youtubeEmbed",
  group: "block",
  inline: false,
  draggable: true,
  addAttributes() {
    return {
      "data-video-provider": { default: "youtube" },
      "data-video-id": { default: null },
      "data-video-title": { default: null },
    }
  },
  parseHTML() {
    return [{ tag: "figure[data-video-provider]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes)]
  },
  addNodeView() {
    return ({ node }) => {
      const title = node.attrs["data-video-title"] as string | null
      const videoId = node.attrs["data-video-id"] as string | null

      const dom = document.createElement("div")
      dom.className =
        "relative flex aspect-video w-full cursor-default items-center justify-center rounded bg-gray-900 text-white"

      const inner = document.createElement("div")
      inner.className = "text-center"

      const icon = document.createElement("div")
      icon.className = "text-2xl"
      icon.textContent = "▶"

      const label = document.createElement("div")
      label.className = "mt-1 text-sm"
      label.textContent = title ?? "YouTube video"

      inner.appendChild(icon)
      inner.appendChild(label)

      if (videoId) {
        const idEl = document.createElement("div")
        idEl.className = "mt-1 text-xs opacity-60"
        idEl.textContent = videoId
        inner.appendChild(idEl)
      }

      dom.appendChild(inner)
      return { dom }
    }
  },
  addCommands() {
    return {
      insertYoutubeEmbed:
        ({ videoId, title }) =>
        ({ commands }) => {
          if (!VIDEO_ID_RE.test(videoId)) return false
          return commands.insertContent({
            type: "youtubeEmbed",
            attrs: {
              "data-video-provider": "youtube",
              "data-video-id": videoId,
              "data-video-title": title || null,
            },
          })
        },
    }
  },
})
