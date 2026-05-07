export function storageGet(key) {
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

export function storageSet(key, val) {
    try {
        localStorage.setItem(key, val)
    } catch {
        // silently ignore
    }
}

export function storageGetBool(key, defaultValue) {
    const raw = storageGet(key)
    if (raw === null) return defaultValue
    return raw === "true"
}

export function storageGetString(key, defaultValue) {
    return storageGet(key) ?? defaultValue
}
