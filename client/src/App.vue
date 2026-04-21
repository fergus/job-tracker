<template>
  <div class="min-h-screen flex flex-col">
    <!-- Top bar -->
    <header class="bg-panel shadow-xs border-b border-line">
      <div class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" class="w-8 h-8 rounded-lg" />
          <h1 class="text-xl font-bold font-condensed tracking-wide text-ink">Job Application Tracker</h1>
          <a
            :href="`https://github.com/fergus/job-tracker/releases/tag/v${version}`"
            target="_blank"
            class="text-xs text-ink-3 hover:text-ink-2 hover:underline"
          >v{{ version }}</a>
        </div>
        <div class="flex items-center gap-3">
          <!-- Admin toggle: only when not compact -->
          <div v-if="currentUser?.isAdmin && !compactHeader" class="flex bg-sunken rounded-lg p-0.5">
            <button
              @click="setShowAll(false)"
              :class="!showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >My Applications</button>
            <button
              @click="setShowAll(true)"
              :class="showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >All Applications</button>
          </div>

          <!-- View switcher: only when not compact -->
          <div v-if="!compactHeader" class="flex bg-sunken rounded-lg p-0.5">
            <button
              @click="view = 'kanban'"
              :class="view === 'kanban' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >Board</button>
            <button
              @click="view = 'table'"
              :class="view === 'table' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >Table</button>
            <button
              @click="view = 'timeline'"
              :class="view === 'timeline' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >Timeline</button>
          </div>

          <!-- Always visible: Add button + settings + hamburger -->
          <button
            @click="openPanel()"
            class="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >+ Add Application</button>
          <button
            @click="showSettings = true"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
            aria-label="Open settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            @click="showSidebar = true"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
            aria-label="Open menu"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="flex-1 px-4 py-4">
      <Transition name="view" mode="out-in">
        <KanbanBoard
          v-if="view === 'kanban'"
          key="kanban"
          :applications="applications"
          :showUser="showAllUsers"
          @status-change="handleStatusChange"
          @select="openPanel"
        />
        <TableView
          v-else-if="view === 'table'"
          key="table"
          :applications="applications"
          :showUserColumn="showAllUsers"
          @select="openPanel"
        />
        <TimelineView
          v-else
          key="timeline"
          :applications="applications"
          @open-detail="openPanel"
        />
      </Transition>
    </main>

    <!-- Application panel -->
    <ApplicationPanel
      v-if="showPanel"
      :panelApp="panelApp"
      @close="closePanel"
      @saved="handlePanelSaved"
      @panel-app-updated="panelApp = $event"
    />
    <SidebarMenu
      v-if="showSidebar"
      :currentUser="currentUser"
      :view="view"
      :compactHeader="compactHeader"
      @close="showSidebar = false"
      @set-view="(v) => { view = v; showSidebar = false }"
      @toggle-compact="toggleCompact"
    />
    <SettingsPanel
      v-if="showSettings"
      :show="showSettings"
      :currentUser="currentUser"
      :showAllUsers="showAllUsers"
      @close="showSettings = false"
      @set-show-all="setShowAll"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { fetchMe, fetchApplications, updateStatus } from './api'
import KanbanBoard from './components/KanbanBoard.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import ApplicationPanel from './components/ApplicationPanel.vue'
import SidebarMenu from './components/SidebarMenu.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const version = __APP_VERSION__

const COMPACT_KEY = 'jobtracker_compact_header'

const view = ref('kanban')
const applications = ref([])
const panelApp = ref(null)
const showPanel = ref(false)
const currentUser = ref(null)
const showAllUsers = ref(false)
const showSidebar = ref(false)
const showSettings = ref(false)
const compactHeader = ref(false)

watch([showSidebar, showPanel], ([sidebar, panel]) => {
  const lock = sidebar || (panel && window.innerWidth < 768)
  document.body.style.overflow = lock ? 'hidden' : ''
})

function toggleCompact() {
  compactHeader.value = !compactHeader.value
  localStorage.setItem(COMPACT_KEY, String(compactHeader.value))
}

async function loadApplications() {
  applications.value = await fetchApplications(null, showAllUsers.value)
}

function openPanel(app = null) {
  showSidebar.value = false
  panelApp.value = app ?? {}
  showPanel.value = true
}

function closePanel() {
  panelApp.value = null
  showPanel.value = false
}

async function handlePanelSaved() {
  await loadApplications()
  if (panelApp.value?.id) {
    panelApp.value = applications.value.find(a => a.id === panelApp.value.id) ?? null
  }
}

async function handleStatusChange(id, status) {
  await updateStatus(id, status)
  await loadApplications()
  if (panelApp.value?.id === id) {
    panelApp.value = applications.value.find(a => a.id === id) ?? null
  }
}

function setShowAll(val) {
  if (showAllUsers.value === val) return
  showAllUsers.value = val
  loadApplications()
}

onMounted(async () => {
  const isMobile = window.innerWidth < 768
  view.value = isMobile ? 'table' : 'kanban'
  const saved = localStorage.getItem(COMPACT_KEY)
  compactHeader.value = saved !== null ? saved === 'true' : isMobile
  currentUser.value = await fetchMe()
  loadApplications()
})
</script>
