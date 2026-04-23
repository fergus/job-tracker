<template>
  <Teleport to="body">
    <div
      class="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 sm:w-80 z-[100] flex flex-col-reverse gap-2 pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="flex items-start gap-3 bg-panel border border-line rounded-lg px-4 py-3 shadow-lg pointer-events-auto"
        >
          <div class="shrink-0 mt-0.5">
            <svg v-if="t.type === 'success'" class="w-4 h-4" :style="{ color: 'var(--accent)' }" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <svg v-else-if="t.type === 'error'" class="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <circle cx="12" cy="12" r="10" stroke-width="2" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4M12 16h.01" />
            </svg>
            <svg v-else class="w-4 h-4 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" stroke-width="2" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 16v-4M12 8h.01" />
            </svg>
          </div>

          <p class="flex-1 text-sm text-ink leading-snug">{{ t.message }}</p>

          <button
            v-if="t.actionLabel"
            @click="handleAction(t)"
            class="shrink-0 text-xs font-semibold text-accent hover:text-accent-hover transition-colors"
          >{{ t.actionLabel }}</button>

          <button
            @click="dismiss(t.id)"
            class="shrink-0 text-ink-3 hover:text-ink transition-colors"
            aria-label="Dismiss notification"
          >
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast'

const { toasts, dismiss } = useToast()

function handleAction(t) {
  if (t.action) t.action()
  dismiss(t.id)
}
</script>
