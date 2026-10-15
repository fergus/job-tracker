<template>
  <div
    ref="root"
    class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/40"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    data-testid="close-reason-picker"
    @keydown="onKeydown"
    @click.self="$emit('cancel')"
  >
    <div class="w-full max-w-xs bg-panel rounded-lg border border-line shadow-xl p-4">
      <h3 class="text-sm font-semibold font-condensed text-ink mb-1">{{ title }}</h3>
      <p v-if="subtitle" class="text-xs text-ink-3 mb-3 truncate">{{ subtitle }}</p>
      <ul class="space-y-1" role="list">
        <li v-for="reason in CLOSE_REASONS" :key="reason">
          <button
            type="button"
            :data-testid="`close-reason-${reason}`"
            :aria-pressed="current === reason"
            :class="[
              'w-full text-left text-sm rounded px-2.5 py-2 border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors',
              current === reason
                ? 'border-accent bg-accent-muted text-ink'
                : 'border-line bg-raised text-ink-2 hover:text-ink hover:border-line-2',
            ]"
            @click="$emit('select', reason)"
          >
            {{ CLOSE_REASON_LABELS[reason] }}
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="mt-3 w-full text-xs text-ink-3 hover:text-ink py-1 transition-colors"
        data-testid="close-reason-cancel"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { CLOSE_REASONS, CLOSE_REASON_LABELS } from '../utils/timeline.js'

defineProps({
  title: { type: String, default: 'Close this record as' },
  subtitle: { type: String, default: '' },
  // The reason already on the record, preselected when correcting it.
  current: { type: String, default: null },
})
const emit = defineEmits(['select', 'cancel'])

const root = ref(null)

const FOCUSABLE = 'button:not([disabled])'

onMounted(() => {
  const target = root.value?.querySelector('[aria-pressed="true"]') ?? root.value?.querySelector(FOCUSABLE)
  target?.focus()
})

// Escape cancels only the picker: it stops here so an enclosing panel's own
// Escape handler does not also close. Tab stays inside the dialog.
function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    event.preventDefault()
    emit('cancel')
    return
  }
  if (event.key === 'Tab') {
    // Keep the enclosing panel's own focus trap out of it.
    event.stopPropagation()
    const focusable = Array.from(root.value?.querySelectorAll(FOCUSABLE) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

</script>
