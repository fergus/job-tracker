<template>
  <div>
    <!-- Lens switch -->
    <div class="flex justify-end mb-2 md:mb-3">
      <ViewLensToggle view="kanban" @set-view="$emit('set-view', $event)" />
    </div>

    <!-- In play: interviews and offers are the stages that ask something of you, so
         they get a rail above the columns. The cards stay in the Interview column;
         the rail is a way in. -->
    <section
      v-if="railGroups.length"
      aria-label="In play"
      data-testid="in-play-rail"
      class="mb-4 md:mb-5 space-y-2"
    >
      <div
        v-for="group in railGroups"
        :key="group.stage"
        :data-testid="`rail-${group.stage}`"
        class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg px-4 py-3"
        :style="{ backgroundColor: `var(--stage-${group.stage}-bg)`, color: `var(--stage-${group.stage}-fg)` }"
      >
        <p class="flex items-baseline gap-2 font-condensed uppercase tracking-wider">
          <span class="text-4xl font-semibold leading-none tabular-nums">{{ group.items.length }}</span>
          <span class="text-sm font-semibold">{{ group.items.length === 1 ? group.singular : group.plural }}</span>
        </p>
        <ul class="flex flex-wrap gap-2">
          <li v-for="app in group.items" :key="app.id">
            <button
              type="button"
              @click="$emit('select', app)"
              class="min-h-[44px] px-3 rounded-md bg-panel text-ink text-sm border border-line hover:border-line-2 hover:shadow-sm transition-[box-shadow,border-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span class="font-semibold font-condensed text-base">{{ app.company_name }}</span>
              <span class="text-ink-2"> · {{ app.role_title }}</span>
            </button>
          </li>
        </ul>
      </div>
    </section>

    <!-- Desktop: 4 active + 1 Closed column -->
    <div class="hidden md:flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
      <div
        v-for="stage in activeStages"
        :key="stage.value"
        class="@container snap-start shrink-0 flex-1 min-w-[200px]"
      >
        <div
          class="flex items-baseline gap-2 mb-3 pt-2 border-t-4"
          :style="{ borderColor: `var(--stage-${stage.value})` }"
        >
          <span class="text-4xl font-semibold font-condensed leading-none tabular-nums text-ink">{{ columns[stage.value].length }}</span>
          <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ stage.label }}</h3>
        </div>
        <draggable
          v-model="columns[stage.value]"
          group="applications"
          item-key="id"
          :delay="100"
          class="space-y-2 min-h-[100px] rounded-lg p-2"
          :style="wellStyle(stage.value)"
          :data-testid="`well-${stage.value}`"
          @change="(evt) => onActiveChange(evt, stage.value)"
        >
          <template #item="{ element }">
            <KanbanCard
              :application="element"
              :showUser="showUser"
              :land-stage="landedId === element.id ? stage.value : null"
              @select="$emit('select', element)"
            />
          </template>
        </draggable>
      </div>

      <!-- Closed column slot -->
      <div v-if="showClosed" class="@container snap-start shrink-0 flex-1 min-w-[200px]">
        <div
          class="flex items-baseline gap-2 mb-3 pt-2 border-t-4"
          :style="{ borderColor: 'var(--stage-closed)' }"
        >
          <span class="text-4xl font-semibold font-condensed leading-none tabular-nums text-ink">{{ closedCount }}</span>
          <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">Closed</h3>
        </div>

        <!-- One drop target: a drop opens the reason picker -->
        <div :class="['space-y-4 rounded-lg p-2', showClosed ? 'min-h-[60px] bg-sunken' : '']">
          <draggable
            v-model="recentClosed"
            group="applications"
            :sort="false"
            item-key="id"
            :delay="100"
            :class="['space-y-2', showClosed ? 'min-h-[60px]' : '']"
            data-testid="closed-drop-zone"
            @change="onClosedAdded"
            @start="dragActive = true"
            @end="dragActive = false"
          >
            <template #item="{ element }">
              <KanbanCard v-show="showClosed" :application="element" :showUser="showUser" :quiet="isMuted(element)" @select="$emit('select', element)" />
            </template>
          </draggable>

          <button
            v-show="showClosed && olderCount > 0"
            @click="showOlder = !showOlder"
            class="w-full text-xs text-ink-3 hover:text-ink py-1 transition-colors"
          >
            {{ showOlder ? 'Show less' : `Show ${olderCount} older` }}
          </button>

          <!-- Older cards expand below the button, not above -->
          <div v-if="showClosed && showOlder" class="space-y-2 mt-1">
            <KanbanCard
              v-for="app in olderCards"
              :key="app.id"
              :application="app"
              :showUser="showUser"
              :quiet="isMuted(app)"
              @select="$emit('select', app)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile: Active group + optional Closed group -->
    <div class="flex flex-col md:hidden">
      <button
        v-show="!showClosed && closedCount > 0"
        :aria-label="`Show ${closedCount} closed applications`"
        :disabled="dragActive"
        @click="handleToggle"
        class="sticky top-0 z-10 w-full min-h-[44px] px-4 py-2 bg-panel border-b border-line text-sm font-medium text-ink-2 hover:text-ink transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed"
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
              <div
                class="flex items-baseline gap-2 mb-2 pt-1.5 border-t-4"
                :style="{ borderColor: `var(--stage-${stage.value})` }"
              >
                <span class="text-3xl font-semibold font-condensed leading-none tabular-nums text-ink">{{ columns[stage.value].length }}</span>
                <h4 class="text-xs font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ stage.label }}</h4>
              </div>
              <draggable
                v-model="columns[stage.value]"
                group="applications"
                item-key="id"
                :delay="100"
                class="space-y-2 min-h-[60px] rounded-lg p-2"
                :style="wellStyle(stage.value)"
                :data-testid="`well-${stage.value}`"
                @change="(evt) => onActiveChange(evt, stage.value)"
                @start="dragActive = true"
                @end="dragActive = false"
              >
                <template #item="{ element }">
                  <KanbanCard
                    :application="element"
                    :showUser="showUser"
                    :land-stage="landedId === element.id ? stage.value : null"
                    @select="$emit('select', element)"
                  />
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
            <span class="text-xs text-ink-3 ml-auto">{{ closedCount }}</span>
          </div>
          <draggable
            v-model="columns.closed"
            group="applications"
            item-key="id"
            :delay="100"
            class="space-y-2 min-h-[60px] bg-sunken rounded-lg p-2"
            data-testid="closed-drop-zone-mobile"
            @change="onClosedAdded"
            @start="dragActive = true"
            @end="dragActive = false"
          >
            <template #item="{ element }">
              <KanbanCard :application="element" :showUser="showUser" :quiet="isMuted(element)" @select="$emit('select', element)" />
            </template>
          </draggable>
        </div>
      </div>
    </div>

    <CloseReasonPicker
      v-if="pendingClose"
      :subtitle="`${pendingClose.company_name} — ${pendingClose.role_title}`"
      @select="confirmClose"
      @cancel="cancelClose"
    />
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
import ViewLensToggle from './ViewLensToggle.vue'
import CloseReasonPicker from './CloseReasonPicker.vue'
import { isMuted, isTerminal } from '../utils/timeline.js'
import { partitionClosed } from '../utils/closedPartition.js'

const props = defineProps({
  applications: Array,
  showClosed: Boolean,
  showUser: Boolean,
  writeVersion: Number,
})
// KanbanBoard receives the full unfiltered applications list (unlike TimelineView
// which receive pre-filtered displayApplications) because vuedraggable requires every
// column — including the hidden Closed column — to be mounted in the DOM for drag-and-drop
// to work correctly across the board. showClosed therefore toggles visibility rather
// than filtering the data upstream.
const emit = defineEmits(['stage-change', 'close-record', 'select', 'toggle-show-closed', 'drag-active', 'set-view'])

const activeStages = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'responded', label: 'Responded' },
  { value: 'interview', label: 'Interview' },
]

const mobileActiveGroup = {
  label: 'Active',
  stages: activeStages,
}

// The rail above the columns: interviews first, then offers. Both stay in the
// Interview column; the rail only repeats them.
const railGroups = computed(() => {
  const inColumn = columns.interview
  return [
    { stage: 'interview', singular: 'Interview', plural: 'Interviews', items: inColumn.filter(a => a.stage === 'interview') },
    { stage: 'offer', singular: 'Offer', plural: 'Offers', items: inColumn.filter(a => a.stage === 'offer') },
  ].filter(g => g.items.length)
})

// A faint wash of the stage colour over the neutral well, so the stage reads at board scale.
function wellStyle(stage) {
  return { backgroundColor: `color-mix(in oklch, var(--stage-${stage}-bg) 55%, var(--sunken))` }
}

const columns = reactive({
  interested: [],
  applied: [],
  responded: [],
  interview: [],
  closed: [],
})

const showOlder = ref(false)
const closedGroupRef = ref(null)
const inFlightIds = ref(new Set())
const dragActive = ref(false)
// The card just dropped into an open column, for the landing flash.
const landedId = ref(null)
let landedTimer = null
// The open record a drop on Closed is waiting to name a reason for.
const pendingClose = ref(null)

const closedCount = computed(() => columns.closed.length)

const olderCount = computed(() => partitionClosed(columns.closed).older.length)

const olderCards = computed(() => partitionClosed(columns.closed).older)

// Filtered ref for the desktop closed-column draggable — only recent cards,
// so older cards are never duplicated in the DOM alongside the static older list.
const recentClosed = ref([])

// The Interview column also holds offers: both are open and past responded.
function columnFor(app) {
  if (app.state !== 'open') return null
  return app.stage === 'offer' ? 'interview' : app.stage
}

function syncColumns() {
  const apps = props.applications || []
  for (const s of activeStages) {
    columns[s.value] = apps.filter(a => columnFor(a) === s.value)
  }
  columns.closed = apps.filter(isTerminal)
  recentClosed.value = partitionClosed(columns.closed).recent
}

watch(() => props.applications, syncColumns, { immediate: true })

function groupCount(group) {
  return group.stages.reduce((sum, s) => sum + columns[s.value].length, 0)
}

// A drop on an open column. The Interview column holds interview and offer, so
// a card already at one of them keeps its stage; reaching offer is a stage the
// panel sets.
function targetStage(app, column) {
  if (column === 'interview' && ['interview', 'offer'].includes(app.stage)) return app.stage
  return column
}

function onActiveChange(evt, column) {
  if (!evt.added) return
  const app = evt.added.element
  if (inFlightIds.value.has(app.id)) return
  const stage = targetStage(app, column)
  landedId.value = app.id
  clearTimeout(landedTimer)
  landedTimer = setTimeout(() => { landedId.value = null }, 600)
  // Reopening a closed card is a state change even when the stage matches.
  if (app.state === 'closed' || app.stage !== stage) {
    inFlightIds.value.add(app.id)
    emit('stage-change', app.id, stage)
  }
}

// A drop on Closed does not close anything yet: the picker names the reason,
// and Escape returns the card to where it came from.
function onClosedAdded(evt) {
  if (!evt.added) return
  const app = evt.added.element
  if (inFlightIds.value.has(app.id) || isTerminal(app)) return
  pendingClose.value = app
}

function confirmClose(reason) {
  const app = pendingClose.value
  pendingClose.value = null
  if (!app) return
  inFlightIds.value.add(app.id)
  emit('close-record', app.id, reason)
}

function cancelClose() {
  pendingClose.value = null
  syncColumns()
}

function handleToggle() {
  if (dragActive.value) return
  emit('toggle-show-closed')
}

watch(() => props.showClosed, async (val) => {
  if (val) {
    await nextTick()
    await nextTick()
    closedGroupRef.value?.scrollIntoView({ behavior: 'smooth' })
  }
})

watch(() => props.writeVersion, () => {
  inFlightIds.value.clear()
})

watch(dragActive, (val) => {
  emit('drag-active', val)
})
</script>
