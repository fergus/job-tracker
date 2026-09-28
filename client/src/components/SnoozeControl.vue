<template>
  <div class="shrink-0 flex items-center gap-1 pb-2 sm:pb-0">
    <button
      v-for="offset in SNOOZE_OFFSETS"
      :key="offset.days"
      type="button"
      :disabled="disabled"
      @click="snooze(offset.days)"
      class="min-h-[44px] px-2 text-xs text-ink-3 hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      :aria-label="`Snooze ${subject} ${offset.label}`"
    >
      {{ offset.label }}
    </button>
    <!-- The native date input, sized to a glyph: shown at its own width it
         prints mm/dd/yyyy on every dated row, which is clutter in a list you
         scan. The input still owns the click, the focus and the accessible
         name. -->
    <span
      class="relative min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-ink-3 hover:text-ink transition-colors rounded-sm focus-within:ring-2 focus-within:ring-accent"
      :class="pending ? 'opacity-40' : ''"
    >
      <svg
        class="w-4 h-4 pointer-events-none"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
        />
      </svg>
      <input
        type="date"
        :disabled="disabled"
        :value="''"
        @change="snoozeTo"
        :aria-label="`Pick a new next-action date for ${subject}`"
        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </span>
  </div>
</template>

<script setup>
import { localCalendarDate } from '../composables/useDayRollover.js'

// The inline reschedule shared by People and Today. It emits a new date and
// nothing else: which record it writes, and how, is the shell's decision, so
// a snooze can never be mistaken for an interaction.
const props = defineProps({
  // Who or what the row is, for the controls' accessible names.
  subject: { type: String, required: true },
  // Any row's write is in flight, so this row must not start another.
  disabled: { type: Boolean, default: false },
  // This row's write is the one in flight.
  pending: { type: Boolean, default: false },
})
const emit = defineEmits(['snooze'])

// Relative offsets cover the reason a commitment slips -- "not today, but
// soon" -- and the date input covers the case where the user knows exactly
// when. Both write the date and nothing else.
//
// Known edge, accepted: the offset shifts from the browser's calendar date
// while the server classifies against INSTANCE_TIMEZONE. A browser running a
// day ahead of the instance can land "+1d" on a date the server still calls
// today, leaving the row due. Deliberate for a single-operator instance whose
// browser and server normally share a zone; the date picker is exact either
// way.
const SNOOZE_OFFSETS = [
  { days: 1, label: '+1d' },
  { days: 7, label: '+1w' },
]

function shiftDate(from, days) {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function snooze(days) {
  if (props.disabled) return
  emit('snooze', shiftDate(localCalendarDate(Date.now()), days))
}

function snoozeTo(event) {
  const picked = event.target.value
  // Clear only once the pick is actually being acted on: clearing first threw
  // away a date the guard then refused, with nothing shown to the user.
  if (!picked || props.disabled) return
  event.target.value = ''
  emit('snooze', picked)
}
</script>
