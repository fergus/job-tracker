import { marked } from "marked"
import DOMPurify from "dompurify"

marked.setOptions({ breaks: true })

const MAX_MARKDOWN_CACHE = 100
const markdownCache = new Map()

export function renderMarkdown(content) {
    const key = content || ""
    if (!markdownCache.has(key)) {
        markdownCache.set(key, DOMPurify.sanitize(marked.parse(key)))
        if (markdownCache.size > MAX_MARKDOWN_CACHE) {
            const firstKey = markdownCache.keys().next().value
            markdownCache.delete(firstKey)
        }
    }
    return markdownCache.get(key)
}
