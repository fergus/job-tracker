<template>
  <div class="max-w-screen-2xl mx-auto px-4 py-4">
    <!-- Empty state -->
    <div v-if="sortedApps.length === 0" class="text-center py-20">
      <template v-if="closedCount > 0">
        <p class="text-ink-2 font-medium mb-1">All your applications are closed</p>
        <button @click="$emit('toggle-show-closed')" class="text-sm text-accent hover:underline transition-colors">
          Show {{ closedCount }} closed
        </button>
      </template>
      <template v-else>
        <p class="text-ink-2 font-medium mb-1">No applications in view</p>
        <p class="text-sm text-ink-3">Add your first application — the timeline shows how long each stage took, so you can spot patterns across your search.</p>
      </template>
    </div>

    <div v-else>
      <!-- Controls + Summary -->
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div class="text-xs text-ink-3">
          <span class="font-medium text-ink-2">{{ summary.active }}</span> active
          <span v-if="summary.stalled > 0" class="ml-2 text-danger font-medium">{{ summary.stalled }} stalled &gt;30 days</span>
          <span v-if="summary.avgCurrent > 0" class="ml-2">avg. in stage: <span class="font-medium text-ink-2">{{ summary.avgCurrent }}d</span></span>
        </div>
        <div class="flex flex-col items-end gap-2">
          <button
            @click="$emit('set-view', 'kanban')"
            class="text-xs text-ink-3 hover:text-ink transition-colors flex items-center gap-1 min-h-5"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Board
          </button>
          <div class="flex items-center gap-2">
            <label for="timeline-sort" class="text-xs text-ink-3">Sort by</label>
            <select
            id="timeline-sort"
            v-model="sortKey"
            class="text-xs bg-panel border border-line rounded px-2 py-1 text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="updated">Recently updated</option>
            <option value="company">Company name</option>
            <option value="duration">Longest in stage</option>
            <option value="start">Start date</option>
            <option value="status">Status</option>
          </select>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-x-4 gap-y-1 mb-3">
        <div
          v-for="stage in allStages"
          :key="stage"
          class="flex items-center gap-1.5"
        >
          <div
            class="w-2.5 h-2.5 rounded-full"
            :style="{ backgroundColor: `var(--stage-${stage})` }"
          ></div>
          <span class="text-xs text-ink-3 capitalize">{{ stage }}</span>
        </div>
      </div>

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
            <span class="text-xs text-ink-3 whitespace-nowrap -translate-x-1/2">{{ tick.label }}</span>
          </div>
          <!-- Today anchor when no month ticks -->
          <div
            v-if="monthTicks.length <= 1"
            class="absolute top-0 h-full flex flex-col justify-end left-full"
          >
            <div class="h-2 w-px bg-line-2"></div>
            <span class="text-xs text-ink-3 whitespace-nowrap -translate-x-1/2">Today</span>
          </div>
        </div>
      </div>

      <!-- Grouped application rows -->
      <template v-for="group in groupedApps" :key="group.status">
        <!-- Section header -->
        <div class="flex items-center gap-2 mt-3 mb-1">
          <div
            class="w-2 h-2 rounded-full"
            :style="{ backgroundColor: `var(--stage-${group.status})` }"
          ></div>
          <span class="text-xs font-bold uppercase tracking-wider text-ink-3">{{ group.status }}</span>
          <span class="text-xs text-ink-3">({{ group.apps.length }})</span>
        </div>

        <div
          v-for="app in group.apps"
          :key="app.id"
          class="flex items-center group cursor-pointer hover:bg-raised rounded transition-colors min-h-9"
          role="button"
          tabindex="0"
          :aria-label="`${app.company_name} — ${app.role_title}, currently ${app.status}, started ${formatShortDate(app.created_at)}`"
          @click="$emit('open-detail', app)"
          @keydown.enter="$emit('open-detail', app)"
          @keydown.space.prevent="$emit('open-detail', app)"
        >
          <!-- Label -->
          <div class="shrink-0 w-24 sm:w-36 md:w-[200px] pl-3 pr-2 text-left">
            <span
              :class="[
                'text-sm font-condensed font-semibold leading-tight block truncate',
                isRejected(app.status) ? 'text-ink-3' : 'text-ink'
              ]"
            >
              {{ app.company_name }}
            </span>
            <span
              :class="[
                'text-xs leading-tight block truncate',
                isRejected(app.status) ? 'text-ink-3 opacity-60' : 'text-ink-3'
              ]"
            >
              {{ app.role_title }}
            </span>
          </div>

          <!-- Bar area -->
          <div class="flex-1 relative h-6 bg-sunken rounded overflow-visible my-1">
            <template v-for="seg in getSegments(app)" :key="seg.stage">
              <!-- Sliver dot for near-zero-width segments -->
              <div
                v-if="seg.isSliver"
                class="absolute top-1/2 -translate-y-1/2 rounded-full"
                :style="sliverStyle(seg)"
                @mouseenter="showTooltip($event, seg)"
                @mouseleave="hideTooltip"
                @click.stop="showTooltipTouch($event, seg)"
              ></div>
              <!-- Normal bar segment -->
              <div
                v-else
                class="absolute top-0 h-full rounded flex items-center justify-center overflow-hidden"
                :style="segmentStyle(seg, app.status)"
                @mouseenter="showTooltip($event, seg)"
                @mouseleave="hideTooltip"
                @click.stop="showTooltipTouch($event, seg)"
              >
                <span
                  v-if="seg.label"
                  class="text-[10px] font-medium text-white/90 px-1 truncate"
                  :style="{ textShadow: '0 1px 2px rgba(0,0,0,0.4)' }"
                >
                  {{ seg.label }}
                </span>
                <!-- Checkmark for accepted -->
                <svg
                  v-if="seg.stage === 'accepted'"
                  class="w-3 h-3 text-white/90 ml-0.5 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  stroke-width="3"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </template>
          </div>
        </div>
      </template>

      <!-- Tooltip -->
      <div
        v-if="tooltip"
        class="fixed z-50 bg-ink text-canvas text-xs rounded px-2 py-1 pointer-events-none whitespace-nowrap shadow-lg"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px', transform: 'translate(-50%, -100%) translateY(-6px)' }"
      >
        <span class="capitalize font-medium">{{ tooltip.stage }}</span>
        <span class="text-canvas/60"> · {{ tooltip.startLabel }} – {{ tooltip.endLabel }} · {{ tooltip.days }} day{{ tooltip.days === 1 ? '' : 's' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { computeSegments, durationDays, isRejected, isAccepted, isTerminal } from '../utils/timeline'

const props = defineProps({ applications: Array, showClosed: Boolean, closedCount: Number })
const emit = defineEmits(['open-detail', 'toggle-show-closed', 'set-view'])

const SORT_KEY = 'jobtracker_timeline_sort'

function lsGet(key) { try { return localStorage.getItem(key) } catch { return null } }
function lsSet(key, val) { try { localStorage.setItem(key, val) } catch {} }

const today = ref(new Date().toISOString())
const sortKey = ref(lsGet(SORT_KEY) || 'updated')
const tooltip = ref(null)
const tooltipTimer = ref(null)

watch(sortKey, (val) => {
  lsSet(SORT_KEY, val)
})

let dateInterval
onMounted(() => {
  dateInterval = setInterval(() => {
    const now = new Date().toISOString()
    if (now.slice(0, 10) !== today.value.slice(0, 10)) {
      today.value = now
    }
  }, 60_000)
})

onUnmounted(() => {
  clearInterval(dateInterval)
  if (tooltipTimer.value) clearTimeout(tooltipTimer.value)
})

const allStages = ['interested', 'applied', 'responded', 'interview', 'offer', 'accepted', 'rejected']

const minDate = computed(() => {
  if (!props.applications?.length) return today.value
  const dates = props.applications.map(a => a.created_at).filter(Boolean)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : today.value
})

const maxDate = computed(() => today.value)

const totalMs = computed(() => new Date(maxDate.value) - new Date(minDate.value) || 1)

function sortApps(apps) {
  const list = [...apps]
  switch (sortKey.value) {
    case 'company':
      return list.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
    case 'duration': {
      return list.sort((a, b) => {
        const aSegs = computeSegments(a, today.value)
        const bSegs = computeSegments(b, today.value)
        const aDur = aSegs.length ? durationDays(aSegs[aSegs.length - 1].start, aSegs[aSegs.length - 1].end) : 0
        const bDur = bSegs.length ? durationDays(bSegs[bSegs.length - 1].start, bSegs[bSegs.length - 1].end) : 0
        return bDur - aDur
      })
    }
    case 'start':
      return list.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    case 'status': {
      const order = ['interested', 'applied', 'responded', 'interview', 'offer', 'accepted', 'rejected']
      return list.sort((a, b) => {
        const aIdx = order.indexOf(a.status)
        const bIdx = order.indexOf(b.status)
        if (aIdx !== bIdx) return aIdx - bIdx
        const aDate = a.updated_at || a.created_at || ''
        const bDate = b.updated_at || b.created_at || ''
        return bDate.localeCompare(aDate)
      })
    }
    default: // updated
      return list.sort((a, b) => {
        const aDate = a.updated_at || a.created_at || ''
        const bDate = b.updated_at || b.created_at || ''
        return bDate.localeCompare(aDate)
      })
  }
}

const sortedApps = computed(() => {
  if (!props.applications?.length) return []
  return sortApps(props.applications)
})

const groupedApps = computed(() => {
  const order = ['interested', 'applied', 'responded', 'interview', 'offer', 'accepted', 'rejected']
  const groups = []
  for (const status of order) {
    const apps = sortedApps.value.filter(a => a.status === status)
    if (apps.length) groups.push({ status, apps })
  }
  return groups
})

const summary = computed(() => {
  const active = props.applications?.filter(a => !isTerminal(a.status)).length || 0
  let stalled = 0
  let totalCurrent = 0
  let countCurrent = 0
  for (const app of props.applications || []) {
    const segs = computeSegments(app, today.value)
    const last = segs[segs.length - 1]
    if (last) {
      const dur = durationDays(last.start, last.end)
      if (dur > 30 && !isTerminal(app.status)) stalled++
      if (!isTerminal(app.status)) {
        totalCurrent += dur
        countCurrent++
      }
    }
  }
  return {
    active,
    stalled,
    avgCurrent: countCurrent ? Math.round(totalCurrent / countCurrent) : 0,
  }
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
  const segs = computeSegments(app, today.value)
  return segs.map(seg => {
    const left = Math.max(0, pctOf(seg.start))
    const right = Math.min(100, pctOf(seg.end))
    const width = Math.max(right - left, 0)
    const isSliver = width < 0.5
    const label = isSliver ? null : getSegmentLabel(seg.stage, width)
    return { ...seg, left, width, isSliver, label }
  })
}

function getSegmentLabel(stage, widthPct) {
  if (widthPct > 10) return stage.charAt(0).toUpperCase() + stage.slice(1)
  if (widthPct > 4) return stage.slice(0, 2).toUpperCase()
  return null
}

function sliverStyle(seg) {
  const colorVar = `var(--stage-${seg.stage}, oklch(57% 0.04 240))`
  return {
    left: `calc(${seg.left}% - 3px)`,
    width: '6px',
    height: '6px',
    backgroundColor: colorVar,
    filter: isRejected(seg.stage) ? 'grayscale(0.4) brightness(0.85)' : undefined,
  }
}

function segmentStyle(seg, appStatus) {
  const colorVar = `var(--stage-${seg.stage}, oklch(57% 0.04 240))`

  if (seg.isTrailing) {
    const colorAlpha = `color-mix(in oklch, ${colorVar} 60%, transparent)`
    return {
      left: seg.left + '%',
      width: seg.width + '%',
      borderRight: `2px dashed ${colorVar}`,
      backgroundImage: `repeating-linear-gradient(90deg, ${colorAlpha} 0px, ${colorAlpha} 6px, transparent 6px, transparent 10px)`,
      backgroundColor: 'transparent',
    }
  }

  const baseStyle = {
    left: seg.left + '%',
    width: seg.width + '%',
    backgroundColor: colorVar,
  }

  if (isRejected(appStatus)) {
    baseStyle.filter = 'grayscale(0.4) brightness(0.85)'
  }

  return baseStyle
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function showTooltip(event, seg) {
  if (tooltipTimer.value) clearTimeout(tooltipTimer.value)
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

function showTooltipTouch(event, seg) {
  const rect = event.target.getBoundingClientRect()
  const days = durationDays(seg.start, seg.end)
  tooltip.value = {
    stage: seg.stage,
    days,
    startLabel: formatShortDate(seg.start),
    endLabel: formatShortDate(seg.end),
    x: rect.left + rect.width / 2,
    y: rect.top,
  }
  if (tooltipTimer.value) clearTimeout(tooltipTimer.value)
  tooltipTimer.value = setTimeout(() => {
    tooltip.value = null
  }, 3000)
}

function hideTooltip() {
  tooltip.value = null
}
</script>
