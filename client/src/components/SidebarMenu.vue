<template>
  <div
    class="fixed inset-0 z-40 outline-none"
    @keydown.escape="$emit('close')"
    tabindex="-1"
    ref="drawerRoot"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="$emit('close')"
    />

    <!-- Panel -->
    <div
      class="absolute inset-y-0 right-0 w-72 bg-white flex flex-col shadow-xl transition-transform duration-300 ease-in-out"
      :class="visible ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span class="font-semibold text-gray-800">Menu</span>
        <button
          @click="$emit('close')"
          class="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-4 space-y-6">
        <!-- View section -->
        <div>
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">View</p>
          <div class="flex flex-col gap-1">
            <button
              v-for="{ id, label } in views"
              :key="id"
              @click="$emit('set-view', id); $emit('close')"
              :class="view === id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-100'"
              class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
            >{{ label }}</button>
          </div>
        </div>

        <!-- Data Scope section (admins only) -->
        <div v-if="currentUser?.isAdmin">
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Data Scope</p>
          <div class="flex bg-gray-100 rounded-lg p-0.5">
            <button
              @click="$emit('set-show-all', false)"
              :class="!showAllUsers ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'"
              class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >My Applications</button>
            <button
              @click="$emit('set-show-all', true)"
              :class="showAllUsers ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'"
              class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >All Applications</button>
          </div>
        </div>

        <!-- Always use menu toggle -->
        <div>
          <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Header</p>
          <div class="flex items-start gap-3">
            <button
              role="switch"
              :aria-checked="String(compactHeader)"
              @click="$emit('toggle-compact')"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              :class="compactHeader ? 'bg-blue-600' : 'bg-gray-200'"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                :class="compactHeader ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
            <div>
              <p class="text-sm font-medium text-gray-700">Always use menu</p>
              <p class="text-xs text-gray-500 mt-0.5">Hide view switcher from the header and keep it here</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-4 py-3 border-t border-gray-200">
        <p class="text-xs text-gray-500 truncate">{{ currentUser?.email }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const props = defineProps({
  currentUser: Object,
  view: String,
  showAllUsers: Boolean,
  compactHeader: Boolean,
})

defineEmits(['close', 'set-view', 'set-show-all', 'toggle-compact'])

const views = [
  { id: 'kanban', label: 'Board' },
  { id: 'table', label: 'Table' },
  { id: 'timeline', label: 'Timeline' },
]

const drawerRoot = ref(null)
const visible = ref(false)

onMounted(() => {
  drawerRoot.value?.focus()
  requestAnimationFrame(() => {
    visible.value = true
  })
})
</script>
