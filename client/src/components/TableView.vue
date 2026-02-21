<template>
  <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
    <table class="w-full text-sm">
      <thead>
        <tr class="bg-gray-50 border-b border-gray-200">
          <th
            v-for="col in columns"
            :key="col.key"
            @click="toggleSort(col.key)"
            class="text-left px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
          >
            {{ col.label }}
            <span v-if="sortKey === col.key" class="ml-1">{{ sortDir === 'asc' ? '&#9650;' : '&#9660;' }}</span>
          </th>
          <th class="px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="app in sorted"
          :key="app.id"
          @click="$emit('select', app)"
          class="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
        >
          <td class="px-4 py-3 font-medium text-gray-900">{{ app.company_name }}</td>
          <td class="px-4 py-3 text-gray-700">{{ app.role_title }}</td>
          <td class="px-4 py-3">
            <span :class="statusClass(app.status)" class="px-2 py-0.5 rounded-full text-xs font-medium capitalize">
              {{ app.status }}
            </span>
          </td>
          <td v-if="showUserColumn" class="px-4 py-3 text-gray-500 text-sm">{{ app.user_email }}</td>
          <td class="px-4 py-3 text-gray-500 truncate max-w-xs">{{ latestNote(app) }}</td>
          <td class="px-4 py-3 text-gray-500 text-xs">{{ formatDate(lastActivity(app)) }}</td>
        </tr>
        <tr v-if="applications.length === 0">
          <td :colspan="showUserColumn ? 6 : 5" class="px-4 py-8 text-center text-gray-400">No applications yet. Click "+ Add Application" to get started.</td>
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
const userColumn = { key: 'user_email', label: 'User' }
const tailColumns = [
  { key: 'latest_note', label: 'Latest Note' },
  { key: 'updated_at', label: 'Last Updated' },
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

function statusClass(status) {
  const map = {
    interested: 'bg-gray-100 text-gray-700',
    applied: 'bg-blue-100 text-blue-700',
    screening: 'bg-yellow-100 text-yellow-700',
    interview: 'bg-purple-100 text-purple-700',
    offer: 'bg-green-100 text-green-700',
    accepted: 'bg-emerald-100 text-emerald-700',
    rejected: 'bg-red-100 text-red-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}
</script>
