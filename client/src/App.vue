<template>
  <div class="min-h-screen">
    <!-- Top bar -->
    <header class="bg-white shadow-xs border-b border-gray-200">
      <div class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <img src="/logo.svg" alt="" class="w-8 h-8 rounded-lg" />
          <h1 class="text-xl font-bold text-gray-800">Job Application Tracker</h1>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex bg-gray-100 rounded-lg p-0.5">
            <button
              @click="view = 'kanban'"
              :class="view === 'kanban' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >Board</button>
            <button
              @click="view = 'table'"
              :class="view === 'table' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'"
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
            >Table</button>
          </div>
          <button
            @click="openForm()"
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >+ Add Application</button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="px-4 py-4">
      <KanbanBoard
        v-if="view === 'kanban'"
        :applications="applications"
        @status-change="handleStatusChange"
        @select="openDetail"
      />
      <TableView
        v-else
        :applications="applications"
        @select="openDetail"
      />
    </main>

    <!-- Modals -->
    <ApplicationForm
      v-if="showForm"
      :application="editingApp"
      @close="showForm = false"
      @saved="handleSaved"
    />
    <ApplicationDetail
      v-if="showDetail"
      :application="selectedApp"
      @close="showDetail = false"
      @edit="handleEdit"
      @delete="handleDelete"
      @status-change="handleStatusChange"
      @cv-uploaded="handleFileUploaded"
      @cover-letter-uploaded="handleFileUploaded"
      @notes-changed="handleNotesChanged"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { fetchApplications, updateStatus, deleteApplication } from './api'
import KanbanBoard from './components/KanbanBoard.vue'
import TableView from './components/TableView.vue'
import ApplicationForm from './components/ApplicationForm.vue'
import ApplicationDetail from './components/ApplicationDetail.vue'

const view = ref('kanban')
const applications = ref([])
const showForm = ref(false)
const showDetail = ref(false)
const editingApp = ref(null)
const selectedApp = ref(null)

async function loadApplications() {
  applications.value = await fetchApplications()
}

function openForm(app = null) {
  editingApp.value = app
  showForm.value = true
  showDetail.value = false
}

function openDetail(app) {
  selectedApp.value = app
  showDetail.value = true
}

function handleSaved() {
  showForm.value = false
  loadApplications()
}

function handleEdit(app) {
  showDetail.value = false
  openForm(app)
}

async function handleDelete(id) {
  await deleteApplication(id)
  showDetail.value = false
  loadApplications()
}

async function handleStatusChange(id, status) {
  await updateStatus(id, status)
  loadApplications()
}

async function handleFileUploaded() {
  await loadApplications()
  if (selectedApp.value) {
    selectedApp.value = applications.value.find(a => a.id === selectedApp.value.id) || null
  }
}

async function handleNotesChanged() {
  await loadApplications()
  if (selectedApp.value) {
    selectedApp.value = applications.value.find(a => a.id === selectedApp.value.id) || null
  }
}

onMounted(loadApplications)
</script>
