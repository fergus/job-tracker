<template>
  <div
    class="fixed inset-0 z-40 outline-none"
    @keydown="handleKeydown"
    tabindex="-1"
    ref="drawerRoot"
    role="dialog"
    aria-modal="true"
    aria-label="Menu"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="$emit('close')"
    />

    <!-- Panel -->
    <div
      class="absolute inset-y-0 right-0 w-72 bg-panel flex flex-col shadow-xl transition-transform duration-300 ease-in-out"
      :class="visible ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-line">
        <span class="font-semibold text-ink">Menu</span>
        <button
          @click="$emit('close')"
          class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
          aria-label="Close menu"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- View section -->
        <div>
          <p class="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">View</p>
          <div class="flex flex-col gap-1">
            <button
              v-for="{ id, label } in views"
              :key="id"
              @click="$emit('set-view', id); $emit('close')"
              :class="view === id ? 'bg-accent-muted text-ink font-medium' : 'text-ink-2 hover:bg-sunken'"
              class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
            >{{ label }}</button>
          </div>
        </div>

        <!-- Always use menu toggle -->
        <div>
          <p class="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">Header</p>
          <div class="flex items-start gap-3">
            <button
              role="switch"
              :aria-checked="String(compactHeader)"
              @click="$emit('toggle-compact')"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
              :class="compactHeader ? 'bg-accent' : 'bg-sunken'"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                :class="compactHeader ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
            <div>
              <p class="text-sm font-medium text-ink">Always use menu</p>
              <p class="text-xs text-ink-3 mt-0.5">Hide view switcher from the header and keep it here</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t border-line">
        <p class="text-xs text-ink-3 truncate">{{ currentUser?.email }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  currentUser: Object,
  view: String,
  compactHeader: Boolean,
})

const emit = defineEmits(['close', 'set-view', 'toggle-compact'])

const views = [
  { id: 'kanban', label: 'Board' },
  { id: 'table', label: 'Table' },
  { id: 'timeline', label: 'Timeline' },
]

const drawerRoot = ref(null)
const visible = ref(false)

// All interactive element types that participate in the tab order
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Trap focus within the drawer so Tab doesn't leak into obscured background content.
// Wraps forward (Tab) from last→first and backward (Shift+Tab) from first→last.
function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
    return
  }
  if (event.key === 'Tab') {
    const focusable = Array.from(drawerRoot.value?.querySelectorAll(FOCUSABLE) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

onMounted(() => {
  drawerRoot.value?.focus()
  requestAnimationFrame(() => {
    visible.value = true
  })
})
</script>
