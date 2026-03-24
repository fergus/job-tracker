<template>
  <div
    class="fixed inset-0 z-50 outline-none"
    @keydown.escape="close"
    tabindex="-1"
    ref="panelRoot"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="close"
    />

    <!-- Panel: right-side drawer on desktop, bottom sheet on mobile -->
    <div
      class="absolute flex flex-col bg-white shadow-xl
             inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
             md:inset-y-0 md:right-0 md:w-[480px] md:rounded-none
             transition-transform duration-300 ease-in-out"
      :class="visible
        ? 'translate-y-0 md:translate-x-0 md:translate-y-0'
        : 'translate-y-full md:translate-y-0 md:translate-x-full'"
    >
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div class="w-8 h-1 bg-gray-300 rounded-full"></div>
      </div>

      <!-- Sticky header -->
      <div class="px-5 pt-3 pb-3 border-b border-gray-200 shrink-0">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <input
              v-model="form.company_name"
              placeholder="Company name"
              class="w-full text-base font-semibold text-gray-900 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 placeholder:text-gray-300 transition-colors"
            />
            <input
              v-model="form.role_title"
              placeholder="Role title"
              class="w-full text-sm text-gray-500 bg-transparent border-b border-transparent focus:border-blue-400 focus:outline-none py-0.5 mt-0.5 placeholder:text-gray-300 transition-colors"
            />
          </div>
          <button
            @click="close"
            class="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0 mt-0.5"
            aria-label="Close panel"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Sticky status bar -->
      <div class="px-5 py-2.5 border-b border-gray-100 shrink-0 overflow-x-auto">
        <div class="flex gap-1.5 min-w-max">
          <button
            v-for="s in statuses"
            :key="s"
            @click="onStatusClick(s)"
            :class="[statusPillClass(s), form.status === s ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-50 hover:opacity-80']"
            class="px-2.5 py-1.5 rounded-full text-xs font-medium capitalize transition-all"
          >{{ s }}</button>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto">
        <div class="px-5 py-4 space-y-5">

          <!-- Core fields -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Job Posting URL</label>
              <input
                v-model="form.job_posting_url"
                type="url"
                placeholder="https://"
                class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Company Website</label>
              <input
                v-model="form.company_website_url"
                type="url"
                placeholder="https://"
                class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Min Salary</label>
              <input
                v-model="form.salary_min"
                type="number"
                placeholder="—"
                class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">Max Salary</label>
              <input
                v-model="form.salary_max"
                type="number"
                placeholder="—"
                class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">Location</label>
            <input
              v-model="form.job_location"
              placeholder="Remote, New York, etc."
              class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-gray-500">Job Description</label>
              <button
                v-if="isEdit && form.job_description && !editingJobDesc"
                @click="editingJobDesc = true"
                class="text-xs text-blue-500 hover:text-blue-700"
              >Edit</button>
              <button
                v-if="editingJobDesc"
                @click="editingJobDesc = false"
                class="text-xs text-blue-500 hover:text-blue-700"
              >Done</button>
            </div>
            <div
              v-if="isEdit && form.job_description && !editingJobDesc"
              class="prose prose-sm max-w-none text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-gray-300"
              v-html="renderMarkdown(form.job_description)"
              @click="editingJobDesc = true"
            />
            <textarea
              v-else
              v-model="form.job_description"
              rows="4"
              placeholder="Paste the job description..."
              class="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden resize-y"
            />
          </div>

          <!-- Edit/view-only sections -->
          <template v-if="isEdit">

            <!-- Dates grid -->
            <div>
              <p class="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Dates</p>
              <div class="grid grid-cols-3 gap-3">
                <div v-for="d in dates" :key="d.key">
                  <p class="text-xs text-gray-400 uppercase tracking-wide">{{ d.label }}</p>
                  <p v-if="d.key === 'created_at'" class="text-sm text-gray-700">{{ formatDate(panelApp[d.key]) }}</p>
                  <div v-else-if="editingDateKey === d.key" class="flex items-center gap-1">
                    <input
                      type="date"
                      :value="toDateInputValue(panelApp[d.key])"
                      @change="onDateChange(d.key, $event)"
                      @blur="editingDateKey = null"
                      @keydown.escape="editingDateKey = null"
                      class="text-sm border border-blue-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 outline-hidden w-full"
                    />
                    <button
                      v-if="panelApp[d.key]"
                      @mousedown.prevent="clearDate(d.key)"
                      class="p-1 rounded text-gray-400 hover:text-red-500 leading-none shrink-0"
                      title="Clear date"
                    >&times;</button>
                  </div>
                  <p
                    v-else
                    @click="editingDateKey = d.key"
                    class="text-sm text-gray-700 cursor-pointer hover:text-blue-600"
                  >{{ formatDate(panelApp[d.key]) }}</p>
                </div>
              </div>
            </div>

            <!-- Mini timeline -->
            <div v-if="miniSegments.length">
              <p class="text-xs text-gray-400 uppercase tracking-wide mb-1.5">Journey</p>
              <div class="relative h-5 rounded overflow-hidden bg-gray-100">
                <div
                  v-for="seg in miniSegments"
                  :key="seg.stage"
                  class="absolute top-0 h-full rounded"
                  :style="miniSegmentStyle(seg)"
                  :title="`${seg.stage} · ${formatShortDate(seg.start)} – ${formatShortDate(seg.end)} · ${miniDays(seg)} day${miniDays(seg) === 1 ? '' : 's'}`"
                ></div>
              </div>
              <div class="flex gap-3 mt-1.5 flex-wrap">
                <div v-for="seg in miniSegments" :key="seg.stage" class="flex items-center gap-1">
                  <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: stageColor(seg.stage) }"></span>
                  <span class="text-xs text-gray-500 capitalize">{{ seg.stage }}</span>
                </div>
              </div>
            </div>

            <!-- Attachments -->
            <div>
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Attachments</h3>
              <div v-if="attachmentsLoading" class="text-sm text-gray-400">Loading...</div>
              <div v-else>
                <div v-if="attachments.length === 0" class="text-sm text-gray-400 mb-2">No attachments.</div>
                <div
                  v-for="att in attachments"
                  :key="att.id"
                  class="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0"
                >
                  <a
                    :href="getAttachmentUrl(panelApp.id, att.id)"
                    class="text-sm text-blue-600 hover:underline truncate"
                    download
                  >{{ att.filename }}</a>
                  <button
                    @click="removeAttachment(att.id)"
                    class="p-1.5 rounded text-gray-300 hover:text-red-500 ml-1 shrink-0"
                    title="Delete"
                  >&times;</button>
                </div>
              </div>
              <label class="mt-2 inline-block text-xs text-blue-600 hover:underline cursor-pointer">
                Upload files
                <input type="file" @change="onAttachmentSelect" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" class="hidden" multiple />
              </label>
            </div>

            <!-- Notes -->
            <div>
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Notes</h3>
              <div class="flex flex-col gap-2 mb-3">
                <div class="flex items-center gap-2">
                  <select
                    v-model="newNoteStage"
                    class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden capitalize"
                  >
                    <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <button
                    @click="addNote"
                    class="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 ml-auto"
                  >Add</button>
                </div>
                <textarea
                  v-model="newNoteContent"
                  @keydown.ctrl.enter="addNote"
                  @keydown.meta.enter="addNote"
                  placeholder="Add a note... (supports markdown, Ctrl+Enter to submit)"
                  rows="3"
                  class="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden resize-y"
                />
              </div>
              <div v-if="sortedNotes.length === 0" class="text-sm text-gray-400 py-2">No notes yet.</div>
              <div v-for="note in sortedNotes" :key="note.id" class="bg-gray-50 rounded-lg p-2 mb-1.5">
                <div v-if="editingNoteId === note.id" class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <select
                      v-model="editingStage"
                      class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden capitalize"
                    >
                      <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                    </select>
                    <div class="ml-auto flex gap-2">
                      <button
                        @click="saveEdit(note.id)"
                        class="text-xs text-white bg-blue-600 hover:bg-blue-700 font-medium px-3 py-1.5 rounded"
                      >Save</button>
                      <button
                        @click="cancelEdit"
                        class="text-xs text-gray-600 hover:text-gray-800 font-medium px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
                      >Cancel</button>
                    </div>
                  </div>
                  <textarea
                    v-model="editingContent"
                    @keydown.escape="cancelEdit"
                    @keydown.ctrl.enter="saveEdit(note.id)"
                    @keydown.meta.enter="saveEdit(note.id)"
                    rows="4"
                    class="w-full text-sm text-gray-700 border border-blue-300 rounded px-1.5 py-0.5 focus:ring-2 focus:ring-blue-500 outline-hidden resize-y"
                    ref="editTextarea"
                  />
                </div>
                <div v-else class="flex items-start justify-between">
                  <div class="flex items-start gap-2 flex-1 min-w-0">
                    <span
                      :class="stageBadgeClass(note.stage)"
                      class="px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-0.5 shrink-0"
                    >{{ note.stage }}</span>
                    <div class="flex-1 min-w-0">
                      <div
                        class="text-sm text-gray-700 prose prose-sm max-w-none cursor-pointer hover:text-blue-600"
                        v-html="renderMarkdown(note.content)"
                        @click="startEdit(note)"
                      />
                      <div class="text-xs text-gray-400 mt-0.5 flex gap-2">
                        <span>{{ formatDateTime(note.created_at) }}</span>
                        <span v-if="note.updated_at && note.updated_at !== note.created_at">· Edited: {{ formatDateTime(note.updated_at) }}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    @click="removeNote(note.id)"
                    class="p-1.5 rounded text-gray-300 hover:text-red-500 ml-1 shrink-0"
                  >&times;</button>
                </div>
              </div>
            </div>

          </template>

          <!-- Create mode: queued file preview -->
          <template v-else>
            <div v-if="queuedFiles.length">
              <h3 class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Files to upload</h3>
              <div
                v-for="(f, i) in queuedFiles"
                :key="i"
                class="flex items-center justify-between py-1 text-sm text-gray-600"
              >
                <span class="truncate">{{ f.name }}</span>
                <button @click="queuedFiles.splice(i, 1)" class="p-1.5 rounded text-gray-300 hover:text-red-500 ml-1 shrink-0">&times;</button>
              </div>
            </div>
            <label class="inline-block text-xs text-blue-600 hover:underline cursor-pointer">
              Attach files
              <input type="file" @change="onQueueFiles" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg" class="hidden" multiple />
            </label>
          </template>

        </div>
      </div>

      <!-- Sticky footer -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-gray-200 shrink-0">
        <button
          v-if="isEdit"
          @click="confirmDelete"
          class="py-2 text-sm text-red-600 hover:text-red-700 font-medium"
        >Delete</button>
        <div v-else></div>
        <div class="flex gap-2">
          <button
            v-if="!isEdit"
            @click="close"
            class="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >Cancel</button>
          <button
            @click="save"
            :disabled="saving"
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >{{ saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Application') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import {
  createApplication, updateApplication, updateStatus, deleteApplication,
  updateDates, createNote, updateNote, deleteNote,
  fetchAttachments, uploadAttachments, getAttachmentUrl, deleteAttachment,
} from '../api'
import { computeSegments, stageColor, durationDays } from '../utils/timeline'

marked.setOptions({ breaks: true })

const props = defineProps({ panelApp: Object })
const emit = defineEmits(['close', 'saved', 'panel-app-updated'])

const isEdit = computed(() => !!(props.panelApp?.id))

const statuses = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected']

const dates = [
  { key: 'created_at', label: 'Created' },
  { key: 'interested_at', label: 'Interested' },
  { key: 'applied_at', label: 'Applied' },
  { key: 'screening_at', label: 'Screening' },
  { key: 'interview_at', label: 'Interview' },
  { key: 'offer_at', label: 'Offer' },
  { key: 'closed_at', label: 'Closed' },
]

const statusPillClasses = {
  interested: 'bg-gray-100 text-gray-700 ring-gray-400',
  applied: 'bg-blue-100 text-blue-700 ring-blue-400',
  screening: 'bg-yellow-100 text-yellow-700 ring-yellow-400',
  interview: 'bg-purple-100 text-purple-700 ring-purple-400',
  offer: 'bg-green-100 text-green-700 ring-green-400',
  accepted: 'bg-emerald-100 text-emerald-700 ring-emerald-400',
  rejected: 'bg-red-100 text-red-700 ring-red-400',
}

const stageBadgeClasses = {
  interested: 'bg-gray-100 text-gray-700',
  applied: 'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-green-100 text-green-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

function statusPillClass(s) {
  return statusPillClasses[s] || statusPillClasses.interested
}

function stageBadgeClass(s) {
  return stageBadgeClasses[s] || 'bg-gray-100 text-gray-700'
}

// Animation
const panelRoot = ref(null)
const visible = ref(false)

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => { visible.value = true })
  // Edit-mode initialization (all refs guaranteed to exist by mount time)
  if (props.panelApp?.id) {
    loadAttachments()
    newNoteStage.value = props.panelApp.status
  }
})

// Form state
const form = reactive({
  company_name: '',
  role_title: '',
  status: 'interested',
  job_description: '',
  job_posting_url: '',
  company_website_url: '',
  salary_min: '',
  salary_max: '',
  job_location: '',
})

function initForm() {
  const a = props.panelApp || {}
  form.company_name = a.company_name || ''
  form.role_title = a.role_title || ''
  form.status = a.status || 'interested'
  form.job_description = a.job_description || ''
  form.job_posting_url = a.job_posting_url || ''
  form.company_website_url = a.company_website_url || ''
  form.salary_min = a.salary_min != null ? a.salary_min : ''
  form.salary_max = a.salary_max != null ? a.salary_max : ''
  form.job_location = a.job_location || ''
}

// Initialize form from prop immediately (form reactive object is already declared above)
initForm()

// Re-init when switching between apps without unmounting (no immediate — avoid TDZ)
watch(() => props.panelApp?.id, (newId) => {
  initForm()
  editingDateKey.value = null
  editingJobDesc.value = false
  if (newId) {
    loadAttachments()
    newNoteStage.value = props.panelApp.status
  } else {
    attachments.value = []
    queuedFiles.value = []
  }
})

function isDirty() {
  const a = props.panelApp || {}
  if (!isEdit.value) {
    return !!(form.company_name || form.role_title)
  }
  return (
    form.company_name !== (a.company_name || '') ||
    form.role_title !== (a.role_title || '') ||
    form.job_description !== (a.job_description || '') ||
    form.job_posting_url !== (a.job_posting_url || '') ||
    form.company_website_url !== (a.company_website_url || '') ||
    form.job_location !== (a.job_location || '')
  )
}

// Close with exit animation and optional pending-note flush
async function close() {
  if (newNoteContent.value?.trim() && isEdit.value) {
    await addNote()
  }
  if (isDirty()) {
    if (!confirm('You have unsaved changes. Close anyway?')) return
  }
  visible.value = false
  setTimeout(() => emit('close'), 300)
}

// Status
async function onStatusClick(s) {
  form.status = s
  if (isEdit.value) {
    try {
      await updateStatus(props.panelApp.id, s)
      emit('saved')
    } catch (err) {
      form.status = props.panelApp.status
      alert('Error updating status: ' + (err.response?.data?.error || err.message))
    }
  }
}

// Save (create or update text fields)
const saving = ref(false)

async function save() {
  if (!form.company_name.trim() || !form.role_title.trim()) {
    alert('Company name and role title are required.')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateApplication(props.panelApp.id, {
        company_name: form.company_name,
        role_title: form.role_title,
        job_description: form.job_description,
        job_posting_url: form.job_posting_url,
        company_website_url: form.company_website_url,
        job_location: form.job_location,
      })
      emit('saved')
    } else {
      const formData = new FormData()
      formData.append('company_name', form.company_name)
      formData.append('role_title', form.role_title)
      formData.append('status', form.status)
      if (form.job_description) formData.append('job_description', form.job_description)
      if (form.job_posting_url) formData.append('job_posting_url', form.job_posting_url)
      if (form.company_website_url) formData.append('company_website_url', form.company_website_url)
      if (form.job_location) formData.append('job_location', form.job_location)
      formData.append('salary_min', form.salary_min !== '' ? form.salary_min : '')
      formData.append('salary_max', form.salary_max !== '' ? form.salary_max : '')

      const newApp = await createApplication(formData)

      if (queuedFiles.value.length > 0) {
        await uploadAttachments(newApp.id, queuedFiles.value)
        queuedFiles.value = []
      }

      emit('panel-app-updated', newApp)
      emit('saved')
    }
  } catch (err) {
    alert('Error saving: ' + (err.response?.data?.error || err.message))
  } finally {
    saving.value = false
  }
}

// Delete
async function confirmDelete() {
  if (!confirm(`Delete application for ${props.panelApp.company_name} – ${props.panelApp.role_title}?`)) return
  try {
    await deleteApplication(props.panelApp.id)
    visible.value = false
    setTimeout(() => { emit('saved'); emit('close') }, 300)
  } catch (err) {
    alert('Error deleting: ' + (err.response?.data?.error || err.message))
  }
}

// Dates
const editingDateKey = ref(null)
const editingJobDesc = ref(false)

function toDateInputValue(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

async function onDateChange(key, event) {
  const val = event.target.value
  editingDateKey.value = null
  if (!val) return
  const isoValue = new Date(val + 'T12:00:00').toISOString()
  try {
    await updateDates(props.panelApp.id, { [key]: isoValue })
    emit('saved')
  } catch (err) {
    alert('Error updating date: ' + (err.response?.data?.error || err.message))
  }
}

async function clearDate(key) {
  editingDateKey.value = null
  try {
    await updateDates(props.panelApp.id, { [key]: null })
    emit('saved')
  } catch (err) {
    alert('Error clearing date: ' + (err.response?.data?.error || err.message))
  }
}

// Mini timeline
const miniSegments = computed(() => {
  if (!isEdit.value) return []
  return computeSegments(props.panelApp, new Date().toISOString())
})

const miniTotalMs = computed(() => {
  if (!isEdit.value) return 1
  const start = new Date(props.panelApp.created_at)
  const end = props.panelApp.closed_at ? new Date(props.panelApp.closed_at) : new Date()
  return Math.max(end - start, 1)
})

function miniPct(isoDate) {
  return ((new Date(isoDate) - new Date(props.panelApp.created_at)) / miniTotalMs.value) * 100
}

function miniSegmentStyle(seg) {
  const left = Math.max(0, miniPct(seg.start))
  const right = Math.min(100, miniPct(seg.end))
  const width = Math.max(right - left, 0.5)

  if (seg.isTrailing) {
    return {
      left: left + '%',
      width: width + '%',
      backgroundImage: `repeating-linear-gradient(
        90deg,
        ${stageColor(seg.stage)}cc 0px,
        ${stageColor(seg.stage)}cc 6px,
        transparent 6px,
        transparent 10px
      )`,
    }
  }
  return {
    left: left + '%',
    width: width + '%',
    backgroundColor: stageColor(seg.stage),
  }
}

function miniDays(seg) {
  return durationDays(seg.start, seg.end)
}

// Attachments
const attachments = ref([])
const attachmentsLoading = ref(false)
const queuedFiles = ref([])

async function loadAttachments() {
  if (!props.panelApp?.id) return
  attachmentsLoading.value = true
  try {
    attachments.value = await fetchAttachments(props.panelApp.id)
  } catch {
    attachments.value = []
  } finally {
    attachmentsLoading.value = false
  }
}

async function onAttachmentSelect(e) {
  const files = Array.from(e.target.files)
  e.target.value = ''
  if (!files.length) return
  try {
    await uploadAttachments(props.panelApp.id, files)
    await loadAttachments()
  } catch (err) {
    alert('Upload failed: ' + (err.response?.data?.error || err.message))
  }
}

async function removeAttachment(attachmentId) {
  try {
    await deleteAttachment(props.panelApp.id, attachmentId)
    attachments.value = attachments.value.filter(a => a.id !== attachmentId)
  } catch (err) {
    alert('Error deleting attachment: ' + (err.response?.data?.error || err.message))
  }
}

function onQueueFiles(e) {
  const files = Array.from(e.target.files)
  e.target.value = ''
  queuedFiles.value.push(...files)
}

// Notes
const newNoteStage = ref('interested')
const newNoteContent = ref('')
const editingNoteId = ref(null)
const editingContent = ref('')
const editingStage = ref('')
const editTextarea = ref(null)

const sortedNotes = computed(() => {
  return [...(props.panelApp?.notes || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
})

async function addNote() {
  const content = newNoteContent.value?.trim()
  if (!content) return
  try {
    await createNote(props.panelApp.id, { stage: newNoteStage.value, content })
    newNoteContent.value = ''
    emit('saved')
  } catch (err) {
    alert('Error adding note: ' + (err.response?.data?.error || err.message))
  }
}

async function removeNote(noteId) {
  try {
    await deleteNote(props.panelApp.id, noteId)
    emit('saved')
  } catch (err) {
    alert('Error deleting note: ' + (err.response?.data?.error || err.message))
  }
}

function startEdit(note) {
  editingNoteId.value = note.id
  editingContent.value = note.content
  editingStage.value = note.stage
  nextTick(() => { editTextarea.value?.focus() })
}

async function saveEdit(noteId) {
  const content = editingContent.value?.trim()
  if (!content || editingNoteId.value !== noteId) return
  const note = props.panelApp?.notes?.find(n => n.id === noteId)
  if (note && content === note.content && editingStage.value === note.stage) {
    cancelEdit()
    return
  }
  editingNoteId.value = null
  try {
    await updateNote(props.panelApp.id, noteId, { content, stage: editingStage.value })
    emit('saved')
  } catch (err) {
    alert('Error updating note: ' + (err.response?.data?.error || err.message))
  }
}

function cancelEdit() {
  editingNoteId.value = null
  editingContent.value = ''
  editingStage.value = ''
}

// Formatting
function renderMarkdown(content) {
  return DOMPurify.sanitize(marked.parse(content || ''))
}

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString()
}

function formatShortDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.prose :deep(p) { margin: 0 0 0.25rem; }
.prose :deep(p:last-child) { margin-bottom: 0; }
.prose :deep(ul), .prose :deep(ol) { margin: 0.25rem 0 0.25rem 1.25rem; padding: 0; }
.prose :deep(li) { margin: 0; }
.prose :deep(h1), .prose :deep(h2), .prose :deep(h3) { font-weight: 600; margin: 0.25rem 0; }
.prose :deep(code) { background: #f3f4f6; padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
.prose :deep(pre) { background: #f3f4f6; padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.25rem 0; }
.prose :deep(pre code) { background: none; padding: 0; }
.prose :deep(blockquote) { border-left: 3px solid #d1d5db; margin: 0.25rem 0; padding-left: 0.75rem; color: #6b7280; }
.prose :deep(a) { color: #2563eb; text-decoration: underline; }
.prose :deep(strong) { font-weight: 600; }
.prose :deep(em) { font-style: italic; }
</style>
