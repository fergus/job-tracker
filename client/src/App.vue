<template>
  <div class="min-h-screen flex flex-col">
    <!-- Skip link -->
    <a
      href="#main-content"
      class="absolute -top-10 left-4 z-[60] bg-accent text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-all focus:top-4"
    >
      Skip to main content
    </a>

    <!-- Top bar -->
    <header class="bg-panel shadow-xs border-b border-line">
      <div class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <LogoBuild :trigger="logoTrigger" />
          <h1 class="text-xl font-bold font-condensed tracking-wide text-ink">Job Tracker</h1>
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
              class="px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-md transition-colors"
            >My Applications</button>
            <button
              @click="setShowAll(true)"
              :class="showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-md transition-colors"
            >All Applications</button>
          </div>

          <!-- View switcher: only when not compact -->
          <div v-if="!compactHeader" class="flex bg-sunken rounded-lg p-0.5">
            <button
              @click="view = 'kanban'"
              :class="view === 'kanban' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-md transition-colors"
            >Board</button>
            <button
              @click="view = 'table'"
              :class="view === 'table' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-md transition-colors"
            >Table</button>
            <button
              @click="view = 'timeline'"
              :class="view === 'timeline' ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
              class="px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-md transition-colors"
            >Timeline</button>
          </div>

          <!-- Show/Hide Closed toggle -->
          <button
            v-show="closedCount > 0"
            :aria-label="showClosed ? 'Hide closed applications' : `Show ${closedCount} closed applications`"
            :aria-pressed="showClosed"
            @click="toggleShowClosed"
            class="hidden sm:flex items-center px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-lg transition-colors"
            :class="showClosed ? 'bg-panel border border-line text-ink shadow-xs' : 'bg-sunken text-ink-3 hover:text-ink-2'"
          >
            {{ showClosed ? 'Hide closed' : `${closedCount} closed` }}
          </button>

          <!-- Always visible: Add button + settings + hamburger -->
          <button
            @click="openPanel()"
            class="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors"
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
    <main id="main-content" class="flex-1 px-4 py-4">
      <Transition name="view" mode="out-in">
        <KanbanBoard
          v-if="view === 'kanban'"
          key="kanban"
          :applications="applications"
          :showUser="showAllUsers"
          :showClosed="showClosed"
          :pulseGhost="pulseGhost"
          :statusVersion="statusVersion"
          @status-change="handleStatusChange"
          @select="openPanel"
          @toggle-show-closed="toggleShowClosed"
        />
        <TableView
          v-else-if="view === 'table'"
          key="table"
          :applications="displayApplications"
          :showUserColumn="showAllUsers"
          :showClosed="showClosed"
          :closedCount="closedCount"
          @select="openPanel"
          @toggle-show-closed="toggleShowClosed"
        />
        <TimelineView
          v-else
          key="timeline"
          :applications="displayApplications"
          :showClosed="showClosed"
          :closedCount="closedCount"
          @open-detail="openPanel"
          @toggle-show-closed="toggleShowClosed"
        />
      </Transition>
    </main>

    <!-- Application panel -->
    <ApplicationPanel
      v-if="showPanel"
      :panelApp="panelApp"
      :totalApplications="applications.length"
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
    <ToastContainer />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { fetchMe, fetchApplications, fetchApplication, updateStatus } from './api'
import { TERMINAL_STAGES } from './utils/timeline.js'
import { useToast } from './composables/useToast'
import LogoBuild from './components/LogoBuild.vue'
import KanbanBoard from './components/KanbanBoard.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import ApplicationPanel from './components/ApplicationPanel.vue'
import SidebarMenu from './components/SidebarMenu.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import ToastContainer from './components/ToastContainer.vue'

const toast = useToast()

const version = __APP_VERSION__

const COMPACT_KEY = 'jobtracker_compact_header'
const SHOW_CLOSED_KEY = 'jobtracker_show_closed'

function lsGet(key) { try { return localStorage.getItem(key) } catch { return null } }
function lsSet(key, val) { try { localStorage.setItem(key, val) } catch {} }

const view = ref('kanban')
const applications = ref([])
const panelApp = ref(null)
const showPanel = ref(false)
const currentUser = ref(null)
const showAllUsers = ref(false)
const showSidebar = ref(false)
const showSettings = ref(false)
const compactHeader = ref(false)
const logoTrigger = ref(0)
const pulseGhost = ref(false)
let pulseTimeout = null
const statusVersion = ref(0)

const _stored = lsGet(SHOW_CLOSED_KEY)
const showClosed = ref(_stored === null ? true : _stored === 'true')

const displayApplications = computed(() => {
  if (showClosed.value) return applications.value
  return applications.value.filter(a => !TERMINAL_STAGES.includes(a.status))
})

const closedCount = computed(() =>
  applications.value.filter(a => TERMINAL_STAGES.includes(a.status)).length
)

function toggleShowClosed() {
  showClosed.value = !showClosed.value
  if (showClosed.value) {
    if (pulseTimeout) clearTimeout(pulseTimeout)
    pulseGhost.value = false
  }
  lsSet(SHOW_CLOSED_KEY, String(showClosed.value))
}

watch(showClosed, (visible) => {
  if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
    nextTick(() => {
      showPanel.value = false
    })
  }
})

watch([showSidebar, showPanel], ([sidebar, panel]) => {
  const lock = sidebar || (panel && window.innerWidth < 768)
  document.body.style.overflow = lock ? 'hidden' : ''
})

function toggleCompact() {
  compactHeader.value = !compactHeader.value
  lsSet(COMPACT_KEY, String(compactHeader.value))
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
  if (panelApp.value?.id) {
    const exists = applications.value.some(a => a.id === panelApp.value.id)
    if (exists) {
      await refreshApplication(panelApp.value.id)
    } else {
      applications.value = [...applications.value, panelApp.value]
    }
  }
}

async function refreshApplication(id) {
  try {
    const updated = await fetchApplication(id)
    const idx = applications.value.findIndex(a => a.id === id)
    if (idx !== -1) {
      applications.value = [
        ...applications.value.slice(0, idx),
        updated,
        ...applications.value.slice(idx + 1)
      ]
    } else {
      applications.value = [...applications.value, updated]
    }
    if (panelApp.value?.id === id) {
      panelApp.value = updated
    }
  } catch (err) {
    if (err.response?.status === 404) {
      applications.value = applications.value.filter(a => a.id !== id)
      if (panelApp.value?.id === id) {
        panelApp.value = null
      }
    } else {
      toast.error('Error refreshing application: ' + (err.response?.data?.error || err.message))
    }
  }
}

function triggerGhostPulse() {
  pulseGhost.value = true
  if (pulseTimeout) clearTimeout(pulseTimeout)
  pulseTimeout = setTimeout(() => {
    pulseGhost.value = false
  }, 1500)
}

async function handleStatusChange(id, status) {
  const prevStatus = applications.value.find(a => a.id === id)?.status
  try {
    await updateStatus(id, status)
  } catch (err) {
    toast.error('Failed to update status — ' + (err.response?.data?.error || err.message))
    await loadApplications()
    statusVersion.value++
    return
  }
  logoTrigger.value++
  await refreshApplication(id)
  statusVersion.value++
  if (TERMINAL_STAGES.includes(status) && !showClosed.value) {
    triggerGhostPulse()
  }
  if (prevStatus && prevStatus !== status) {
    const label = status.charAt(0).toUpperCase() + status.slice(1)
    toast.success(`Moved to ${label}`, {
      actionLabel: 'Undo',
      action: async () => {
        try {
          await updateStatus(id, prevStatus)
        } catch (undoErr) {
          toast.error('Undo failed — ' + (undoErr.response?.data?.error || undoErr.message))
          await loadApplications()
          return
        }
        logoTrigger.value++
        await refreshApplication(id)
      },
    })
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
  const saved = lsGet(COMPACT_KEY)
  compactHeader.value = saved !== null ? saved === 'true' : isMobile
  currentUser.value = await fetchMe()
  loadApplications()
})

onUnmounted(() => {
  if (pulseTimeout) clearTimeout(pulseTimeout)
})
</script>
