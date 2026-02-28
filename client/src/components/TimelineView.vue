<template>
  <div class="max-w-screen-2xl mx-auto px-4 py-4">
    <!-- Empty state -->
    <div v-if="sortedApps.length === 0" class="text-center text-gray-400 py-20 text-sm">
      No applications to display.
    </div>

    <div v-else>
      <!-- Header row with axis -->
      <div class="flex">
        <div class="shrink-0" :style="{ width: LABEL_WIDTH + 'px' }"></div>
        <div class="flex-1 relative h-8 border-b border-gray-200">
          <!-- Month tick marks -->
          <div
            v-for="tick in monthTicks"
            :key="tick.label"
            class="absolute top-0 h-full flex flex-col justify-end"
            :style="{ left: tick.pct + '%' }"
          >
            <div class="h-2 w-px bg-gray-300"></div>
            <span class="text-xs text-gray-400 whitespace-nowrap" style="transform: translateX(-50%)">{{ tick.label }}</span>
          </div>
        </div>
      </div>

      <!-- Application rows -->
      <div
        v-for="app in sortedApps"
        :key="app.id"
        class="flex items-center group cursor-pointer hover:bg-gray-50 rounded transition-colors"
        style="min-height: 36px;"
        @click="$emit('open-detail', app)"
      >
        <!-- Label -->
        <div
          class="shrink-0 pr-3 text-right"
          :style="{ width: LABEL_WIDTH + 'px' }"
        >
          <span class="text-xs text-gray-700 font-medium leading-tight block truncate">{{ app.company_name }}</span>
          <span class="text-xs text-gray-400 leading-tight block truncate">{{ app.role_title }}</span>
        </div>

        <!-- Bar area -->
        <div class="flex-1 relative h-6 bg-gray-100 rounded overflow-visible my-1">
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
        class="fixed z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap shadow-lg"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px', transform: 'translate(-50%, -100%) translateY(-6px)' }"
      >
        <span class="capitalize font-medium">{{ tooltip.stage }}</span>
        <span class="text-gray-300"> · {{ tooltip.days }} day{{ tooltip.days === 1 ? '' : 's' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { computeSegments, stageColor, durationDays } from '../utils/timeline'

const LABEL_WIDTH = 200

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

  // Start from beginning of the next month after minDate
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
  const width = Math.max(right - left, 0.3) // minimum 0.3% so it's visible

  const style = {
    left: left + '%',
    width: width + '%',
    backgroundColor: stageColor(seg.stage),
    opacity: seg.isTrailing ? '0.7' : '1',
  }

  if (seg.isTrailing) {
    style.borderRight = `2px dashed ${stageColor(seg.stage)}`
    style.backgroundImage = `repeating-linear-gradient(
      90deg,
      ${stageColor(seg.stage)}99 0px,
      ${stageColor(seg.stage)}99 6px,
      transparent 6px,
      transparent 10px
    )`
    style.backgroundColor = 'transparent'
  }

  return style
}

function showTooltip(event, seg) {
  const days = durationDays(seg.start, seg.end)
  tooltip.value = {
    stage: seg.stage,
    days,
    x: event.clientX,
    y: event.clientY,
  }
}

function hideTooltip() {
  tooltip.value = null
}
</script>
