<template>
  <div class="bg-panel rounded-lg border border-line overflow-hidden">
    <table class="w-full text-sm" aria-label="Job applications">
      <thead>
        <tr class="bg-raised border-b border-line">
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            @click="toggleSort(col.key)"
            :aria-sort="col.key !== 'latest_note' ? (sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined"
            class="text-left px-4 py-3 font-semibold text-ink-2 select-none"
            :class="[{ 'hidden md:table-cell': col.mobileHidden }, col.key !== 'latest_note' ? 'cursor-pointer hover:bg-sunken' : 'cursor-default']"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key" class="ml-1" aria-hidden="true">{{ sortDir === 'asc' ? '&#9650;' : '&#9660;' }}</span>
          </th>
          <th scope="col" class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="app in sorted"
          :key="app.id"
          @click="$emit('select', app)"
          class="border-b border-line hover:bg-accent-muted cursor-pointer transition-colors"
        >
          <td class="px-4 py-3 font-medium font-condensed text-ink">{{ app.company_name }}</td>
          <td class="px-4 py-3 text-ink-2">{{ app.role_title }}</td>
          <td class="px-4 py-3">
            <span :style="statusStyle(app.status)" class="px-2 py-0.5 rounded-full text-xs font-medium capitalize">
              {{ app.status }}
            </span>
          </td>
          <td v-if="showUserColumn" class="hidden md:table-cell px-4 py-3 text-ink-3 text-sm">{{ app.user_email }}</td>
          <td class="hidden md:table-cell px-4 py-3 text-ink-3 truncate max-w-xs">{{ latestNote(app) }}</td>
          <td class="hidden md:table-cell px-4 py-3 text-ink-3 text-xs tabular-nums">{{ formatDate(lastActivity(app)) }}</td>
        </tr>
        <tr v-if="applications.length === 0">
          <td :colspan="columns.length" class="px-4 py-8 text-center text-ink-3">No applications yet. Click "+ Add Application" to get started.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({ applications: Array, showUserColumn: Boolean })
defineEmits(['select'])

const baseColumns = [
  { key: 'company_name', label: 'Company' },
  { key: 'role_title', label: 'Role' },
  { key: 'status', label: 'Status' },
]
const userColumn = { key: 'user_email', label: 'User', mobileHidden: true }
const tailColumns = [
  { key: 'latest_note', label: 'Latest Note', mobileHidden: true },
  { key: 'updated_at', label: 'Last Updated', mobileHidden: true },
]

const columns = computed(() => {
  if (props.showUserColumn) {
    return [...baseColumns, userColumn, ...tailColumns]
  }
  return [...baseColumns, ...tailColumns]
})

const sortKey = ref('updated_at')
const sortDir = ref('desc')

function toggleSort(key) {
  if (key === 'latest_note') return
  if (sortKey.value === key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

function latestNote(app) {
  if (!app.notes || app.notes.length === 0) return '-'
  return app.notes[app.notes.length - 1].content
}

function lastActivity(app) {
  const updatedAt = app.updated_at || ''
  const notes = app.notes || []
  const latestNoteDate = notes.length > 0 ? notes[notes.length - 1].created_at || '' : ''
  return latestNoteDate > updatedAt ? latestNoteDate : updatedAt
}

const sorted = computed(() => {
  const arr = [...props.applications]
  arr.sort((a, b) => {
    let va, vb
    if (sortKey.value === 'updated_at') {
      va = lastActivity(a)
      vb = lastActivity(b)
    } else {
      va = a[sortKey.value] || ''
      vb = b[sortKey.value] || ''
    }
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir.value === 'asc' ? cmp : -cmp
  })
  return arr
})

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString()
}

function statusStyle(status) {
  return {
    backgroundColor: `var(--stage-${status}-bg)`,
    color: `var(--stage-${status}-fg)`,
  }
}
</script>
