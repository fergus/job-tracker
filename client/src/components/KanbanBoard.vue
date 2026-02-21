<template>
  <div class="flex gap-4 overflow-x-auto pb-4">
    <div
      v-for="stage in stages"
      :key="stage.value"
      class="flex-1 min-w-[200px]"
    >
      <div class="flex items-center gap-2 mb-3">
        <span :class="stage.color" class="w-2.5 h-2.5 rounded-full inline-block"></span>
        <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wide">{{ stage.label }}</h3>
        <span class="text-xs text-gray-400 ml-auto">{{ columns[stage.value].length }}</span>
      </div>
      <draggable
        v-model="columns[stage.value]"
        group="applications"
        item-key="id"
        class="space-y-2 min-h-[100px] bg-gray-100 rounded-lg p-2"
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
  { value: 'interested', label: 'Interested', color: 'bg-gray-400' },
  { value: 'applied', label: 'Applied', color: 'bg-blue-400' },
  { value: 'screening', label: 'Screening', color: 'bg-yellow-400' },
  { value: 'interview', label: 'Interview', color: 'bg-purple-400' },
  { value: 'offer', label: 'Offer', color: 'bg-green-400' },
  { value: 'accepted', label: 'Accepted', color: 'bg-emerald-500' },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-400' },
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
