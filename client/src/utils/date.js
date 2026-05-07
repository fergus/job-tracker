export const MS_PER_DAY = 86_400_000
export const RECENT_CLOSED_DAYS = 14

export function formatDate(iso) {
    if (!iso) return "-"
    return new Date(iso).toLocaleDateString()
}

export function formatShortDate(iso) {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function formatDateTime(iso) {
    if (!iso) return ""
    const d = new Date(iso)
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function formatRelativeDate(iso) {
    if (!iso) return ""
    const date = new Date(iso)
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / MS_PER_DAY)

    if (diffDays < 1) return "today"
    if (diffDays < 7) {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
        return rtf.format(-diffDays, "day")
    }
    if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7)
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
        return rtf.format(-weeks, "week")
    }
    const months = Math.floor(diffDays / 30)
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
    return rtf.format(-months, "month")
}

export function formatTimeAgo(isoString) {
    if (!isoString) return ""
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    return `${Math.floor(months / 12)}y ago`
}

export function daysSince(dateStr) {
    if (!dateStr) return Infinity
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / MS_PER_DAY)
}

export function isoFromDateInput(val) {
    if (!val) return null
    return new Date(val + "T12:00:00").toISOString()
}
