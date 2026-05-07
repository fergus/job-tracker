<template>
  <div
    @click="$emit('select', application)"
    role="button"
    tabindex="0"
    @keydown.enter="$emit('select', application)"
    @keydown.space.prevent="$emit('select', application)"
    class="bg-panel rounded-lg border border-line p-3 @[200px]:p-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-200 ease-out-quart"
  >
    <!-- Quiet cards brighten on hover so the muted company name becomes fully readable -->
    <p :class="['font-semibold font-condensed text-sm truncate transition-colors duration-200', quiet ? 'text-ink-3 hover:text-ink' : 'text-ink']">{{ application.company_name }}</p>
    <p :class="['text-xs truncate mt-1', quiet ? 'text-ink-3' : 'text-ink-2']">{{ application.role_title }}</p>
    <span
      v-if="application.status === 'offer'"
      class="inline-block mt-1.5 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide"
      :style="{ backgroundColor: 'var(--stage-offer-bg)', color: 'var(--stage-offer-fg)' }"
    >Offer</span>
    <p v-if="showUser" :class="['text-xs truncate mt-0.5', quiet ? 'text-ink-3 opacity-60' : 'text-ink-3']">{{ application.user_email }}</p>
    <!-- Hidden on narrow columns (<200px); shown when column is wide enough to breathe -->
    <div class="hidden @[200px]:flex items-center justify-between mt-3">
      <span
        class="text-xs flex items-center gap-1"
        :class="stalenessClass"
        :title="stalenessLabel"
      >
        <span
          v-if="stalenessLevel > 0"
          class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="stalenessDotClass"
          aria-hidden="true"
        ></span>
        {{ formatRelativeDate(application.updated_at) }}
      </span>
      <span class="flex gap-1.5 items-center">
        <span v-if="application.attachment_count > 0" class="flex items-center gap-0.5 text-ink-3" :title="`${application.attachment_count} attachment${application.attachment_count > 1 ? 's' : ''}`">
          <svg class="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 4v6a3 3 0 006 0V2.5a2.5 2.5 0 00-5 0v7a1.5 1.5 0 003 0V5" />
          </svg>
          <span v-if="application.attachment_count > 1" class="text-[10px] leading-none">{{ application.attachment_count }}</span>
        </span>
        <svg v-else-if="application.cv_filename" class="w-3.5 h-3.5 text-ink-3" title="CV attached" aria-label="CV attached" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 1H3.5A1.5 1.5 0 002 2.5v11A1.5 1.5 0 003.5 15h9A1.5 1.5 0 0014 13.5V6L9 1z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 1v5h5" />
        </svg>
        <svg v-else-if="application.cover_letter_filename" class="w-3.5 h-3.5 text-ink-3" title="Cover letter attached" aria-label="Cover letter attached" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M2 4.5A1.5 1.5 0 013.5 3h9A1.5 1.5 0 0114 4.5v7a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 012 11.5v-7z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M2 4.5l6 4.5 6-4.5" />
        </svg>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ application: Object, showUser: Boolean, quiet: Boolean })
defineEmits(['select'])

const STALE_STAGES = new Set(['applied', 'responded', 'interview', 'offer'])

const staleDays = computed(() => {
  if (!STALE_STAGES.has(props.application.status)) return 0
  return (Date.now() - new Date(props.application.updated_at)) / 86_400_000
})

const stalenessLevel = computed(() => {
  if (staleDays.value >= 30) return 2
  if (staleDays.value >= 14) return 1
  return 0
})

const stalenessClass = computed(() => {
  if (stalenessLevel.value === 2) return 'text-danger'
  if (stalenessLevel.value === 1) return 'text-accent'
  return 'text-ink-3'
})

const stalenessDotClass = computed(() => {
  if (stalenessLevel.value === 2) return 'bg-danger'
  return 'bg-accent'
})

function formatStaleDuration(days) {
  if (days >= 60) return `${Math.round(days / 30)} months`
  if (days >= 30) return '1 month'
  return `${Math.round(days)} days`
}

const stalenessLabel = computed(() => {
  if (stalenessLevel.value === 0) return ''
  const duration = formatStaleDuration(staleDays.value)
  if (stalenessLevel.value === 2) return `No movement in ${duration} — worth following up`
  return `No movement in ${duration}`
})

import { formatRelativeDate } from '../utils/date.js'
</script>
