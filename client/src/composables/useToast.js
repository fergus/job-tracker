import { ref } from 'vue'

const MAX_TOASTS = 5
let _nextId = 0
const toasts = ref([])
const timers = {}

function dismiss(id) {
  clearTimeout(timers[id])
  delete timers[id]
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx !== -1) toasts.value.splice(idx, 1)
}

function add(type, message, options = {}) {
  const id = ++_nextId
  if (toasts.value.length >= MAX_TOASTS) {
    dismiss(toasts.value[0].id)
  }
  toasts.value.push({ id, type, message, actionLabel: options.actionLabel, action: options.action })
  const duration = options.duration ?? (type === 'error' ? 6000 : 4000)
  if (duration > 0) {
    timers[id] = setTimeout(() => dismiss(id), duration)
  }
  return id
}

export function useToast() {
  return {
    toasts,
    success: (msg, opts) => add('success', msg, opts),
    error:   (msg, opts) => add('error',   msg, opts),
    info:    (msg, opts) => add('info',    msg, opts),
    dismiss,
  }
}
