<template>
  <!-- Desktop: 7 columns -->
  <div class="hidden md:flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
    <div
      v-for="stage in stages"
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
        @change="(evt) => onChange(evt, stage.value)"
      >
        <template #item="{ element }">
          <KanbanCard :application="element" :showUser="showUser" @select="$emit('select', element)" />
        </template>
      </draggable>
    </div>
  </div>

  <!-- Mobile: 2 groups (Active + Closed) -->
  <div class="flex md:hidden gap-5 overflow-x-auto pb-4 snap-x snap-mandatory">
    <div
      v-for="group in mobileGroups"
      :key="group.label"
      class="snap-start shrink-0 w-[85vw]"
    >
      <div class="flex items-center gap-2 mb-4">
        <h3 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider">{{ group.label }}</h3>
        <span class="text-xs text-ink-3 ml-auto">{{ groupCount(group) }}</span>
      </div>
      <div class="space-y-4">
        <div v-for="stage in group.stages" :key="stage.value">
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
            @change="(evt) => onChange(evt, stage.value)"
          >
            <template #item="{ element }">
              <KanbanCard :application="element" :showUser="showUser" @select="$emit('select', element)" />
            </template>
          </draggable>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
// vuedraggable 4.1.0 produces a benign CSP eval violation in the browser console.
// Sortable.js (bundled inside) uses `new Function("return this")()` as a global-object
// fallback, which CSP's script-src blocks — but it's wrapped in try/catch and the
// `window` fallback runs correctly, so drag behaviour is unaffected.
// To eliminate the warning entirely, replace vuedraggable with a CSP-safe library
// (e.g. @dnd-kit/core or native HTML5 drag events). Not worth the effort unless
// vuedraggable is being replaced for another reason.
import draggable from 'vuedraggable'
import KanbanCard from './KanbanCard.vue'

const props = defineProps({ applications: Array, showUser: Boolean })
const emit = defineEmits(['status-change', 'select'])

const stages = [
  { value: 'interested', label: 'Interested' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
]

const mobileGroups = [
  {
    label: 'Active',
    stages: [
      { value: 'interested', label: 'Interested' },
      { value: 'applied', label: 'Applied' },
      { value: 'screening', label: 'Screening' },
      { value: 'interview', label: 'Interview' },
      { value: 'offer', label: 'Offer' },
    ],
  },
  {
    label: 'Closed',
    stages: [
      { value: 'accepted', label: 'Accepted' },
      { value: 'rejected', label: 'Rejected' },
    ],
  },
]

const columns = reactive({
  interested: [],
  applied: [],
  screening: [],
  interview: [],
  offer: [],
  accepted: [],
  rejected: [],
})

watch(() => props.applications, (apps) => {
  for (const s of stages) {
    columns[s.value] = apps.filter(a => a.status === s.value)
  }
}, { immediate: true })

function groupCount(group) {
  return group.stages.reduce((sum, s) => sum + columns[s.value].length, 0)
}

function onChange(evt, status) {
  if (evt.added) {
    const app = evt.added.element
    if (app.status !== status) {
      emit('status-change', app.id, status)
    }
  }
}
</script>
