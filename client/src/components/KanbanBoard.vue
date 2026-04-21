<template>
  <div class="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
    <div
      v-for="stage in stages"
      :key="stage.value"
      class="snap-start shrink-0 w-[85vw] md:shrink md:flex-1 md:min-w-[200px]"
    >
      <div class="flex items-center gap-2 mb-3">
        <span
          class="w-2.5 h-2.5 rounded-full inline-block"
          :style="{ backgroundColor: `var(--stage-${stage.value})` }"
        ></span>
        <h3 class="text-sm font-semibold text-ink-2 uppercase tracking-wide">{{ stage.label }}</h3>
        <span class="text-xs text-ink-3 ml-auto">{{ columns[stage.value].length }}</span>
      </div>
      <draggable
        v-model="columns[stage.value]"
        group="applications"
        item-key="id"
        class="space-y-2 min-h-[100px] bg-sunken rounded-lg p-2"
        @change="(evt) => onChange(evt, stage.value)"
      >
        <template #item="{ element }">
          <KanbanCard :application="element" :showUser="showUser" @select="$emit('select', element)" />
        </template>
      </draggable>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch } from 'vue'
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

function onChange(evt, status) {
  if (evt.added) {
    const app = evt.added.element
    if (app.status !== status) {
      emit('status-change', app.id, status)
    }
  }
}
</script>
