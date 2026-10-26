<template>
  <!-- Same head the board's columns wear: a 4px rule in the group's colour and
       a condensed numeral. The count sits outside the heading so the heading's
       accessible name stays the label alone; the list already announces its
       own length. -->
  <div
    class="flex items-baseline gap-2 mb-3 pt-2 border-t-4"
    :style="{ borderColor: rule }"
  >
    <span
      class="text-4xl font-semibold font-condensed leading-none tabular-nums"
      :style="{ color: tone === 'overdue' ? 'var(--danger)' : 'var(--ink)' }"
      aria-hidden="true"
    >{{ count }}</span>
    <h2 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">
      {{ label }}
    </h2>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// `tone` is the server's follow-up state, or `none` for a group with no
// commitment: only what is owed earns colour.
const props = defineProps({
  label: { type: String, required: true },
  count: { type: Number, required: true },
  tone: { type: String, default: 'none' },
})

const RULES = {
  overdue: 'var(--danger)',
  due: 'var(--accent)',
  upcoming: 'var(--line-2)',
  none: 'var(--stage-closed)',
}

const rule = computed(() => RULES[props.tone] ?? RULES.none)
</script>
