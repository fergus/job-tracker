<template>
  <div>
    <!-- Desktop: 5 active + 1 Closed column -->
    <div class="hidden md:flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
      <div
        v-for="stage in activeStages"
        :key="stage.value"
        class="@container snap-start shrink-0 flex-1 min-w-[200px]"
      >
        <div class="flex items-center gap-2 mb-4">
          <span
            class="w-2.5 h-2.5 rounded-full inline-block"
            :style="{ backgroundColor: `var(--stage-${stage.value})` }"
          ></span>
          <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ stage.label }}</h3>
          <span class="text-xs text-ink-3 ml-auto">{{ columns[stage.value].length }}</span>
        </div>
        <draggable
          v-model="columns[stage.value]"
          group="applications"
          item-key="id"
          :delay="100"
          class="space-y-2 min-h-[100px] bg-sunken rounded-lg p-2"
          @change="(evt) => onActiveChange(evt, stage.value)"
        >
          <template #item="{ element }">
            <KanbanCard :application="element" :showUser="showUser" @select="$emit('select', element)" />
          </template>
        </draggable>
      </div>

      <!-- Closed column slot -->
      <div class="@container snap-start shrink-0 flex-1 min-w-[200px]">
        <!-- Header: ghost or full -->
        <div class="flex items-center gap-2 mb-4">
          <template v-if="showClosed">
            <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">Closed</h3>
            <span class="text-xs text-ink-3 ml-auto">{{ closedCount }}</span>
            <button
              @click="$emit('toggle-show-closed')"
              class="ml-1 text-xs text-ink-3 hover:text-ink underline"
              aria-label="Hide closed applications"
            >Hide</button>
          </template>
          <button
            v-else-if="closedCount > 0"
            :aria-label="`Show ${closedCount} closed applications`"
            :aria-pressed="false"
            @click="$emit('toggle-show-closed')"
            class="w-full flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-sunken text-ink-3 hover:text-ink hover:bg-raised transition-colors text-sm font-medium"
          >
            <span aria-live="polite" :class="['px-1.5 py-0.5 rounded-full bg-panel text-xs font-semibold', pulseGhost ? 'ring-2 ring-accent motion-safe:animate-pulse' : '']">{{ closedCount }}</span>
            <span>Closed</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>

        <!-- Drop targets: always mounted, visibility toggled -->
        <div :class="['space-y-2 rounded-lg p-2', showClosed ? 'min-h-[60px] bg-sunken' : '']">
          <draggable
            v-model="columns.accepted"
            group="applications"
            :sort="false"
            item-key="id"
            :delay="100"
            class="space-y-2"
            @change="onAcceptedAdded"
          >
            <template #item="{ element }">
              <KanbanCard v-show="showClosed && (isRecent(element) || showOlder)" :application="element" :showUser="showUser" :quiet="isQuieted(element.status)" @select="$emit('select', element)" />
            </template>
          </draggable>

          <draggable
            v-model="columns.rejected"
            group="applications"
            :sort="false"
            item-key="id"
            :delay="100"
            class="space-y-2"
            data-testid="closed-drop-zone"
            @change="onRejectedAdded"
          >
            <template #item="{ element }">
              <KanbanCard v-show="showClosed && (isRecent(element) || showOlder)" :application="element" :showUser="showUser" :quiet="isQuieted(element.status)" @select="$emit('select', element)" />
            </template>
          </draggable>

          <button
            v-show="showClosed && olderCount > 0"
            @click="showOlder = !showOlder"
            class="w-full text-xs text-ink-3 hover:text-ink py-1 transition-colors"
          >
            {{ showOlder ? 'Show less' : `Show ${olderCount} older` }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile: Active group + optional Closed group -->
    <div class="flex flex-col md:hidden">
      <button
        v-show="!showClosed && closedCount > 0"
        :aria-label="`Show ${closedCount} closed applications`"
        @click="handleToggle"
        class="sticky top-0 z-10 w-full min-h-[44px] px-4 py-2 bg-panel/90 backdrop-blur-sm border-b border-line text-sm font-medium text-ink-2 hover:text-ink transition-colors text-center"
      >
        {{ closedCount }} closed
      </button>

      <div class="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
        <!-- Active group -->
        <div class="snap-start shrink-0 w-[85vw]">
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">Active</h3>
            <span class="text-xs text-ink-3 ml-auto">{{ groupCount(mobileActiveGroup) }}</span>
          </div>
          <div class="space-y-4">
            <div v-for="stage in mobileActiveGroup.stages" :key="stage.value">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="w-2 h-2 rounded-full inline-block"
                  :style="{ backgroundColor: `var(--stage-${stage.value})` }"
                ></span>
                <h4 class="text-xs font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ stage.label }}</h4>
                <span class="text-xs text-ink-3 ml-auto">{{ columns[stage.value].length }}</span>
              </div>
              <draggable
                v-model="columns[stage.value]"
                group="applications"
                item-key="id"
                :delay="100"
                class="space-y-2 min-h-[60px] bg-sunken rounded-lg p-2"
                @change="(evt) => onActiveChange(evt, stage.value)"
              >
                <template #item="{ element }">
                  <KanbanCard :application="element" :showUser="showUser" @select="$emit('select', element)" />
                </template>
              </draggable>
            </div>
          </div>
        </div>

        <!-- Closed group -->
        <div
          v-if="showClosed"
          ref="closedGroupRef"
          class="snap-start shrink-0 w-[85vw]"
        >
          <div class="flex items-center gap-2 mb-4">
            <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">Closed</h3>
            <span class="text-xs text-ink-3 ml-auto">{{ groupCount(mobileClosedGroup) }}</span>
            <button
              @click="$emit('toggle-show-closed')"
              class="ml-1 text-xs text-ink-3 hover:text-ink underline"
              aria-label="Hide closed applications"
            >Hide</button>
          </div>
          <div class="space-y-4">
            <div v-for="stage in mobileClosedGroup.stages" :key="stage.value">
              <div class="flex items-center gap-2 mb-2">
                <span
                  class="w-2 h-2 rounded-full inline-block"
                  :style="{ backgroundColor: `var(--stage-${stage.value})` }"
                ></span>
                <h4 class="text-xs font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ stage.label }}</h4>
                <span class="text-xs text-ink-3 ml-auto">{{ columns[stage.value].length }}</span>
              </div>
              <draggable
                v-model="columns[stage.value]"
                group="applications"
                item-key="id"
                :delay="100"
                class="space-y-2 min-h-[60px] bg-sunken rounded-lg p-2"
                @change="(evt) => onActiveChange(evt, stage.value)"
              >
                <template #item="{ element }">
                  <KanbanCard :application="element" :showUser="showUser" :quiet="isQuieted(element.status)" @select="$emit('select', element)" />
                </template>
              </draggable>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch, ref, computed, nextTick } from 'vue'
// vuedraggable 4.1.0 produces a benign CSP eval violation in the browser console.
// Sortable.js (bundled inside) uses `new Function("return this")()` as a global-object
// fallback, which CSP's script-src blocks — but it's wrapped in try/catch and the
// `window` fallback runs correctly, so drag behaviour is unaffected.
// To eliminate the warning entirely, replace vuedraggable with a CSP-safe library
// (e.g. @dnd-kit/core or native HTML5 drag events). Not worth the effort unless
// vuedraggable is being replaced for another reason.
import draggable from 'vuedraggable'
import KanbanCard from './KanbanCard.vue'
import { TERMINAL_STAGES, isQuieted } from '../utils/timeline.js'

const props = defineProps({
  applications: Array,
  showClosed: Boolean,
  showUser: Boolean,
  pulseGhost: Boolean,
  statusVersion: Number,
})
// KanbanBoard receives the full unfiltered applications list (unlike TableView/TimelineView
// which receive pre-filtered displayApplications) because vuedraggable requires every
// column — including the hidden Closed column — to be mounted in the DOM for drag-and-drop
// to work correctly across the board. showClosed therefore toggles visibility rather
// than filtering the data upstream.
const emit = defineEmits(['status-change', 'select', 'toggle-show-closed'])

const activeStages = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
]

const mobileActiveGroup = {
  label: 'Active',
  stages: [
    { value: 'interested', label: 'Interested' },
    { value: 'applied', label: 'Applied' },
    { value: 'screening', label: 'Screening' },
    { value: 'interview', label: 'Interview' },
    { value: 'offer', label: 'Offer' },
  ],
}

const mobileClosedGroup = {
  label: 'Closed',
  stages: [
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
  ],
}

const columns = reactive({
  interested: [],
  applied: [],
  screening: [],
  interview: [],
  offer: [],
  accepted: [],
  rejected: [],
})

const showOlder = ref(false)
const closedGroupRef = ref(null)
const inFlightIds = ref(new Set())

const closedCount = computed(() => columns.accepted.length + columns.rejected.length)

const RECENT_CLOSED_DAYS = 14

function daysSinceClosed(app) {
  const dateStr = app.closed_at || app.updated_at
  if (!dateStr) return Infinity
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000
}

function isRecent(app) {
  return daysSinceClosed(app) < RECENT_CLOSED_DAYS
}

const olderCount = computed(() => {
  const all = [...columns.accepted, ...columns.rejected]
  return all.filter(app => !isRecent(app)).length
})

watch(() => props.applications, (apps) => {
  for (const s of activeStages) {
    columns[s.value] = apps.filter(a => a.status === s.value)
  }
  columns.accepted = apps.filter(a => a.status === 'accepted')
  columns.rejected = apps.filter(a => a.status === 'rejected')
}, { immediate: true })

function groupCount(group) {
  return group.stages.reduce((sum, s) => sum + columns[s.value].length, 0)
}

function onActiveChange(evt, status) {
  if (evt.added) {
    const app = evt.added.element
    if (inFlightIds.value.has(app.id)) return
    if (app.status !== status) {
      inFlightIds.value.add(app.id)
      emit('status-change', app.id, status)
    }
  }
}

function onAcceptedAdded(evt) {
  if (evt.added) {
    const app = evt.added.element
    if (inFlightIds.value.has(app.id)) return
    if (app.status === 'accepted') return
    // Drag from active column defaults to rejected per plan;
    // drag from rejected within Closed changes to accepted
    const newStatus = TERMINAL_STAGES.includes(app.status) ? 'accepted' : 'rejected'
    inFlightIds.value.add(app.id)
    emit('status-change', app.id, newStatus)
  }
}

function onRejectedAdded(evt) {
  if (evt.added) {
    const app = evt.added.element
    if (inFlightIds.value.has(app.id)) return
    if (app.status !== 'rejected') {
      inFlightIds.value.add(app.id)
      emit('status-change', app.id, 'rejected')
    }
  }
}

function handleToggle() {
  emit('toggle-show-closed')
}

watch(() => props.showClosed, async (val) => {
  if (val) {
    await nextTick()
    await nextTick()
    closedGroupRef.value?.scrollIntoView({ behavior: 'smooth' })
  }
})

watch(() => props.statusVersion, () => {
  inFlightIds.value.clear()
})
</script>
