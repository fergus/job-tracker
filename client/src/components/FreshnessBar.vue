<template>
  <!--
    The escalation bar (R7, R8). It renders above <main> in App.vue (KTD7) so
    it survives view switches. No icon, no dot, no spinner (R18); the only
    motion is a colour transition, which the global reduced-motion rule in
    main.css collapses (R16).

    Visibility:
      degraded - mobile only (R6 keeps the desktop tier text-only; R17 makes
                 the bar the sole surface where there is no ambient slot)
      stale    - every width (R7)
      terminal - every width (R8)
  -->
  <div
    v-if="visible"
    class="border-b px-4 py-2.5"
    :class="[
      isTerminal ? 'border-danger bg-panel' : 'border-line bg-sunken',
      isDegraded ? 'sm:hidden' : ''
    ]"
  >
    <div
      class="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      <p
        class="text-xs font-condensed font-semibold uppercase tracking-[0.14em]"
        :class="isTerminal ? 'text-danger' : 'text-ink'"
      >
        {{ headline }}
      </p>
      <p class="text-xs text-ink-3 tabular-nums">{{ detail }}</p>
      <p
        v-if="retryState === 'failed'"
        role="status"
        class="text-xs text-ink-3"
      >
        That attempt did not succeed.
      </p>
      <button
        v-if="isTerminal"
        @click="reload"
        class="sm:ml-auto px-3 py-1.5 min-h-[44px] rounded-lg border border-danger text-xs font-semibold text-danger hover:bg-danger hover:text-panel transition-colors"
      >
        Reload
      </button>
      <button
        v-else-if="isStale"
        :disabled="retryState === 'pending'"
        @click="retry"
        class="sm:ml-auto px-3 py-1.5 min-h-[44px] rounded-lg border border-line-2 bg-panel text-xs font-semibold text-ink hover:border-ink-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {{ retryState === 'pending' ? 'Retrying' : 'Retry now' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import {
  NEVER_SYNCED,
  TIER_DEGRADED,
  TIER_STALE,
  TIER_TERMINAL
} from '../utils/freshness.js'

// A retry that has not confirmed itself within this long is treated as
// failed. A failed retry leaves the tier untouched (R7a), so the tier alone
// can never report the failure -- only elapsed time can.
const RETRY_WINDOW_MS = 8000

const props = defineProps({
  tier: { type: String, default: '' },
  display: { type: String, default: '' },
  absolute: { type: String, default: '' }
})

const emit = defineEmits(['retry'])

const retryState = ref('idle')
let retryTimer = null

const isDegraded = computed(() => props.tier === TIER_DEGRADED)
const isStale = computed(() => props.tier === TIER_STALE)
const isTerminal = computed(() => props.tier === TIER_TERMINAL)
const visible = computed(
  () => isDegraded.value || isStale.value || isTerminal.value
)
const neverConnected = computed(() => props.absolute === NEVER_SYNCED)

const headline = computed(() => {
  if (isTerminal.value) return 'Live updates stopped'
  if (isDegraded.value) return 'Updates delayed'
  return neverConnected.value ? 'Never connected' : 'Not receiving updates'
})

const detail = computed(() => {
  if (isTerminal.value) return 'Reload the page to resume.'
  if (neverConnected.value) {
    return 'This board has not received live updates since it was opened.'
  }
  return props.absolute
})

function clearRetryTimer() {
  if (retryTimer === null) return
  clearTimeout(retryTimer)
  retryTimer = null
}

function retry() {
  if (retryState.value === 'pending') return
  retryState.value = 'pending'
  clearRetryTimer()
  retryTimer = setTimeout(() => {
    retryTimer = null
    retryState.value = 'failed'
  }, RETRY_WINDOW_MS)
  emit('retry')
}

function reload() {
  window.location.reload()
}

// Any tier movement resolves the attempt: a successful retry lands on live
// and hides the bar, so only a stationary tier can still be in flight.
watch(
  () => props.tier,
  () => {
    clearRetryTimer()
    retryState.value = 'idle'
  }
)

onUnmounted(clearRetryTimer)
</script>
