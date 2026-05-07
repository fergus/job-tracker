export function getErrorMessage(err, fallback = "An error occurred") {
    return err?.response?.data?.error || err?.message || fallback
}

export function getErrorType(err) {
    return err?.response?.data?.type
}

export function isNotFound(err) {
    return err?.response?.status === 404
}
