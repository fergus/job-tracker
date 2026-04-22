<template>
  <div class="max-w-screen-2xl mx-auto px-4 py-4">
    <!-- Empty state -->
    <div v-if="sortedApps.length === 0" class="text-center py-20">
      <p class="text-ink-2 font-medium mb-1">No applications to track yet</p>
      <p class="text-sm text-ink-3">Add your first application to see your job search timeline here.</p>
    </div>

    <div v-else>
      <!-- Header row with axis -->
      <div class="flex">
        <div class="shrink-0 w-24 sm:w-36 md:w-[200px]"></div>
        <div class="flex-1 relative h-8 border-b border-line">
          <!-- Month tick marks -->
          <div
            v-for="tick in monthTicks"
            :key="tick.label"
            class="absolute top-0 h-full flex flex-col justify-end"
            :style="{ left: tick.pct + '%' }"
          >
            <div class="h-2 w-px bg-line-2"></div>
            <span class="text-xs text-ink-3 whitespace-nowrap" style="transform: translateX(-50%)">{{ tick.label }}</span>
          </div>
        </div>
      </div>

      <!-- Application rows -->
      <div
        v-for="app in sortedApps"
        :key="app.id"
        class="flex items-center group cursor-pointer hover:bg-raised rounded transition-colors"
        style="min-height: 36px;"
        role="button"
        tabindex="0"
        @click="$emit('open-detail', app)"
        @keydown.enter="$emit('open-detail', app)"
      >
        <!-- Label -->
        <div
          class="shrink-0 w-24 sm:w-36 md:w-[200px] pr-3 text-right"
        >
          <span class="text-xs text-ink-2 font-medium leading-tight block truncate">{{ app.company_name }}</span>
          <span class="text-xs text-ink-3 leading-tight block truncate">{{ app.role_title }}</span>
        </div>

        <!-- Bar area -->
        <div class="flex-1 relative h-6 bg-sunken rounded overflow-visible my-1">
          <div
            v-for="seg in getSegments(app)"
            :key="seg.stage"
            class="absolute top-0 h-full rounded"
            :style="segmentStyle(seg)"
            @mouseenter="showTooltip($event, seg)"
            @mouseleave="hideTooltip"
          ></div>
        </div>
      </div>

      <!-- Tooltip -->
      <div
        v-if="tooltip"
        class="fixed z-50 bg-ink text-canvas text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap shadow-lg"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px', transform: 'translate(-50%, -100%) translateY(-6px)' }"
      >
        <span class="capitalize font-medium">{{ tooltip.stage }}</span>
        <span class="text-gray-300"> · {{ tooltip.startLabel }} – {{ tooltip.endLabel }} · {{ tooltip.days }} day{{ tooltip.days === 1 ? '' : 's' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { computeSegments, durationDays } from '../utils/timeline'

const props = defineProps({ applications: Array })
const emit = defineEmits(['open-detail'])

const today = new Date().toISOString()

const tooltip = ref(null)

const minDate = computed(() => {
  if (!props.applications?.length) return today
  const dates = props.applications.map(a => a.created_at).filter(Boolean)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today
})

const maxDate = computed(() => today)

const totalMs = computed(() => new Date(maxDate.value) - new Date(minDate.value) || 1)

const sortedApps = computed(() => {
  if (!props.applications?.length) return []
  return [...props.applications].sort((a, b) => {
    const aDate = a.updated_at || a.created_at || ''
    const bDate = b.updated_at || b.created_at || ''
    return bDate.localeCompare(aDate)
  })
})

const monthTicks = computed(() => {
  const ticks = []
  const start = new Date(minDate.value)
  const end = new Date(maxDate.value)

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1)

  while (cursor <= end) {
    const pct = ((cursor - new Date(minDate.value)) / totalMs.value) * 100
    if (pct >= 0 && pct <= 100) {
      const label = cursor.toLocaleDateString(undefined, { month: 'short', year: cursor.getMonth() === 0 ? 'numeric' : undefined })
      ticks.push({ label, pct })
    }
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return ticks
})

function pctOf(isoDate) {
  return ((new Date(isoDate) - new Date(minDate.value)) / totalMs.value) * 100
}

function getSegments(app) {
  return computeSegments(app, today)
}

function segmentStyle(seg) {
  const left = Math.max(0, pctOf(seg.start))
  const right = Math.min(100, pctOf(seg.end))
  const width = Math.max(right - left, 0.3)
  const colorVar = `var(--stage-${seg.stage}, oklch(57% 0.04 240))`

  if (seg.isTrailing) {
    const colorAlpha = `color-mix(in oklch, ${colorVar} 60%, transparent)`
    return {
      left: left + '%',
      width: width + '%',
      borderRight: `2px dashed ${colorVar}`,
      backgroundImage: `repeating-linear-gradient(90deg, ${colorAlpha} 0px, ${colorAlpha} 6px, transparent 6px, transparent 10px)`,
      backgroundColor: 'transparent',
    }
  }

  return {
    left: left + '%',
    width: width + '%',
    backgroundColor: colorVar,
  }
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function showTooltip(event, seg) {
  const days = durationDays(seg.start, seg.end)
  tooltip.value = {
    stage: seg.stage,
    days,
    startLabel: formatShortDate(seg.start),
    endLabel: formatShortDate(seg.end),
    x: event.clientX,
    y: event.clientY,
  }
}

function hideTooltip() {
  tooltip.value = null
}
</script>
