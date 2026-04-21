<template>
  <div
    class="fixed inset-0 z-50 outline-none"
    @keydown="handleKeydown"
    tabindex="-1"
    ref="panelRoot"
    role="dialog"
    aria-modal="true"
    :aria-label="isEdit ? `Edit application — ${form.company_name || 'Application'}` : 'Add application'"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="close"
    />

    <!-- Panel: right-side drawer on desktop, bottom sheet on mobile -->
    <div
      class="absolute flex flex-col bg-panel shadow-xl
             inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
             md:inset-y-0 md:left-0 md:h-auto md:w-[480px] md:rounded-none
             transition-transform duration-300 ease-out-expo"
      :class="visible
        ? 'translate-y-0 md:translate-x-0 md:translate-y-0'
        : 'translate-y-full md:translate-y-0 md:-translate-x-full'"
    >
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div class="w-8 h-1 bg-line-2 rounded-full"></div>
      </div>

      <!-- Sticky header -->
      <div class="px-5 pt-3 pb-3 border-b border-line shrink-0">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <input
              v-model="form.company_name"
              placeholder="Company name"
              aria-label="Company name"
              class="w-full text-base font-semibold font-condensed text-ink bg-transparent border-b border-transparent focus:border-accent focus:outline-none py-0.5 placeholder:text-ink-3/50 transition-colors"
            />
            <input
              v-model="form.role_title"
              placeholder="Role title"
              aria-label="Role title"
              class="w-full text-sm text-ink-2 bg-transparent border-b border-transparent focus:border-accent focus:outline-none py-0.5 mt-0.5 placeholder:text-ink-3/50 transition-colors"
            />
          </div>
          <button
            @click="close"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken transition-colors shrink-0"
            aria-label="Close panel"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Sticky status bar -->
      <div class="px-5 py-2.5 border-b border-line shrink-0 overflow-x-auto">
        <div class="flex gap-1.5 min-w-max">
          <button
            v-for="s in statuses"
            :key="s"
            @click="onStatusClick(s)"
            :aria-pressed="form.status === s"
            :class="[
              form.status === s ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-50 hover:opacity-80',
              stampingStatus === s ? 'stage-stamp' : ''
            ]"
            :style="statusPillStyle(s)"
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
              <label class="block text-xs font-medium text-ink-3 mb-1">Job Posting URL</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="form.job_posting_url"
                  type="url"
                  placeholder="https://"
                  class="flex-1 min-w-0 border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
                />
                <a
                  v-if="form.job_posting_url"
                  :href="form.job_posting_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 p-1.5 text-ink-3 hover:text-accent transition-colors"
                  title="Open link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Company Website</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="form.company_website_url"
                  type="url"
                  placeholder="https://"
                  class="flex-1 min-w-0 border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
                />
                <a
                  v-if="form.company_website_url"
                  :href="form.company_website_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 p-1.5 text-ink-3 hover:text-accent transition-colors"
                  title="Open link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Min Salary</label>
              <input
                v-model="form.salary_min"
                type="number"
                placeholder="—"
                class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Max Salary</label>
              <input
                v-model="form.salary_max"
                type="number"
                placeholder="—"
                class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-ink-3 mb-1">Location</label>
            <input
              v-model="form.job_location"
              placeholder="Remote, New York, etc."
              class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
            />
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-ink-3">Job Description</label>
              <button
                v-if="isEdit && form.job_description && !editingJobDesc"
                @click="editingJobDesc = true"
                class="text-xs text-accent hover:text-accent-hover"
              >Edit</button>
              <button
                v-if="editingJobDesc"
                @click="editingJobDesc = false"
                class="text-xs text-accent hover:text-accent-hover"
              >Done</button>
            </div>
            <div
              v-if="isEdit && form.job_description && !editingJobDesc"
              class="prose prose-sm max-w-none text-sm text-ink-2 border border-line rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-line-2"
              v-html="renderMarkdown(form.job_description)"
              @click="editingJobDesc = true"
            />
            <textarea
              v-else
              v-model="form.job_description"
              rows="4"
              placeholder="Paste the job description..."
              class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden resize-y"
            />
          </div>

          <!-- Edit/view-only sections -->
          <template v-if="isEdit">

            <!-- Dates grid -->
            <div>
              <p class="text-xs font-medium text-ink-3 mb-2 uppercase tracking-wide">Dates</p>
              <div class="grid grid-cols-3 gap-3">
                <div v-for="d in dates" :key="d.key">
                  <p class="text-xs text-ink-3 uppercase tracking-wide">{{ d.label }}</p>
                  <p v-if="d.key === 'created_at'" class="text-sm text-ink">{{ formatDate(panelApp[d.key]) }}</p>
                  <div v-else-if="editingDateKey === d.key" class="flex items-center gap-1">
                    <input
                      type="date"
                      :value="toDateInputValue(panelApp[d.key])"
                      @change="onDateChange(d.key, $event)"
                      @blur="editingDateKey = null"
                      @keydown.escape="editingDateKey = null"
                      class="text-sm border border-accent rounded px-1 py-0.5 focus:ring-2 focus:ring-accent outline-hidden w-full bg-raised text-ink"
                    />
                    <button
                      v-if="panelApp[d.key]"
                      @mousedown.prevent="clearDate(d.key)"
                      class="p-1 rounded text-ink-3 hover:text-danger leading-none shrink-0"
                      title="Clear date"
                    >&times;</button>
                  </div>
                  <p
                    v-else
                    @click="editingDateKey = d.key"
                    class="text-sm text-ink cursor-pointer hover:text-accent"
                  >{{ formatDate(panelApp[d.key]) }}</p>
                </div>
              </div>
            </div>

            <!-- Mini timeline -->
            <div v-if="miniSegments.length">
              <p class="text-xs text-ink-3 uppercase tracking-wide mb-1.5">Journey</p>
              <div class="relative h-5 rounded overflow-hidden bg-sunken">
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
                  <span class="text-xs text-ink-3 capitalize">{{ seg.stage }}</span>
                </div>
              </div>
            </div>

            <!-- Attachments -->
            <div>
              <h3 class="text-xs font-medium text-ink-3 uppercase tracking-wide mb-2">Attachments</h3>
              <div v-if="attachmentsLoading" class="text-sm text-ink-3">Loading...</div>
              <div v-else>
                <div v-if="attachments.length === 0" class="text-sm text-ink-3 mb-2">No attachments.</div>
                <div
                  v-for="att in attachments"
                  :key="att.id"
                  class="flex items-center justify-between py-1.5 border-b border-line last:border-0"
                >
                  <a
                    :href="getAttachmentUrl(panelApp.id, att.id)"
                    class="text-sm text-accent hover:underline truncate"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ att.original_filename }}</a>
                  <button
                    @click="removeAttachment(att.id)"
                    class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-line-2 hover:text-danger ml-1 shrink-0"
                    title="Delete"
                  >&times;</button>
                </div>
              </div>
              <label class="mt-2 inline-block text-xs text-accent hover:underline cursor-pointer">
                Upload files
                <input type="file" @change="onAttachmentSelect" accept=".pdf,.doc,.docx,.md,.txt" class="hidden" multiple />
              </label>
            </div>

            <!-- Notes -->
            <div>
              <h3 class="text-xs font-medium text-ink-3 uppercase tracking-wide mb-3">Notes</h3>
              <div class="flex flex-col gap-2 mb-3">
                <div class="flex items-center gap-2">
                  <select
                    v-model="newNoteStage"
                    class="border border-line bg-raised rounded-lg px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden capitalize"
                  >
                    <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <button
                    @click="addNote"
                    class="text-sm text-accent hover:text-accent-hover font-medium px-2 ml-auto"
                  >Add</button>
                </div>
                <textarea
                  v-model="newNoteContent"
                  @keydown.ctrl.enter="addNote"
                  @keydown.meta.enter="addNote"
                  placeholder="Add a note... (supports markdown, Ctrl+Enter to submit)"
                  rows="3"
                  class="w-full border border-line bg-raised rounded-lg px-2 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden resize-y"
                />
              </div>
              <div v-if="sortedNotes.length === 0" class="text-sm text-ink-3 py-2">No notes yet.</div>
              <div v-for="note in sortedNotes" :key="note.id" class="bg-raised rounded-lg p-2 mb-1.5">
                <div v-if="editingNoteId === note.id" class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <select
                      v-model="editingStage"
                      class="border border-line bg-raised rounded-lg px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden capitalize"
                    >
                      <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                    </select>
                    <div class="ml-auto flex gap-2">
                      <button
                        @click="saveEdit(note.id)"
                        class="text-xs text-accent-fg bg-accent hover:bg-accent-hover font-medium px-3 py-1.5 rounded"
                      >Save</button>
                      <button
                        @click="cancelEdit"
                        class="text-xs text-ink-2 hover:text-ink font-medium px-3 py-1.5 rounded bg-sunken hover:bg-line"
                      >Cancel</button>
                    </div>
                  </div>
                  <textarea
                    v-model="editingContent"
                    @keydown.escape="cancelEdit"
                    @keydown.ctrl.enter="saveEdit(note.id)"
                    @keydown.meta.enter="saveEdit(note.id)"
                    rows="4"
                    class="w-full text-sm text-ink border border-accent rounded px-1.5 py-0.5 focus:ring-2 focus:ring-accent outline-hidden resize-y bg-panel"
                    ref="editTextarea"
                  />
                </div>
                <div v-else class="flex items-start justify-between">
                  <div class="flex items-start gap-2 flex-1 min-w-0">
                    <span
                      :style="stageBadgeStyle(note.stage)"
                      class="px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-0.5 shrink-0"
                    >{{ note.stage }}</span>
                    <div class="flex-1 min-w-0">
                      <div
                        class="text-sm text-ink-2 prose prose-sm max-w-none cursor-pointer hover:text-accent"
                        v-html="renderMarkdown(note.content)"
                        @click="startEdit(note)"
                      />
                      <div class="text-xs text-ink-3 mt-0.5 flex gap-2">
                        <span>{{ formatDateTime(note.created_at) }}</span>
                        <span v-if="note.updated_at && note.updated_at !== note.created_at">· Edited: {{ formatDateTime(note.updated_at) }}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    @click="removeNote(note.id)"
                    class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-line-2 hover:text-danger ml-1 shrink-0"
                  >&times;</button>
                </div>
              </div>
            </div>

          </template>

          <!-- Create mode: queued file preview -->
          <template v-else>
            <div v-if="queuedFiles.length">
              <h3 class="text-xs font-medium text-ink-3 uppercase tracking-wide mb-2">Files to upload</h3>
              <div
                v-for="(f, i) in queuedFiles"
                :key="i"
                class="flex items-center justify-between py-1 text-sm text-ink-2"
              >
                <span class="truncate">{{ f.name }}</span>
                <button @click="queuedFiles.splice(i, 1)" class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-line-2 hover:text-danger ml-1 shrink-0">&times;</button>
              </div>
            </div>
            <label class="inline-block text-xs text-accent hover:underline cursor-pointer">
              Attach files
              <input type="file" @change="onQueueFiles" accept=".pdf,.doc,.docx,.md,.txt" class="hidden" multiple />
            </label>
          </template>

        </div>
      </div>

      <!-- Sticky footer -->
      <div class="flex items-center justify-between px-5 py-3 border-t border-line shrink-0">
        <button
          v-if="isEdit"
          @click="confirmDelete"
          class="py-2 text-sm text-danger hover:text-danger-hover font-medium"
        >Delete</button>
        <div v-else></div>
        <div class="flex gap-2">
          <button
            v-if="!isEdit"
            @click="close"
            class="px-3 py-2 text-sm font-medium text-ink-2 bg-sunken hover:bg-line rounded-lg transition-colors"
          >Cancel</button>
          <button
            @click="save"
            :disabled="saving"
            class="px-4 py-2 text-sm font-medium text-accent-fg bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
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

function statusPillStyle(s) {
  return {
    backgroundColor: `var(--stage-${s}-bg)`,
    color: `var(--stage-${s}-fg)`,
    '--tw-ring-color': `var(--stage-${s})`,
  }
}

function stageBadgeStyle(s) {
  return {
    backgroundColor: `var(--stage-${s}-bg)`,
    color: `var(--stage-${s}-fg)`,
  }
}

// Animation
const panelRoot = ref(null)
const visible = ref(false)
const stampingStatus = ref(null)

// All interactive element types that participate in the tab order
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Trap focus within the panel so Tab doesn't leak into obscured background content.
// Wraps forward (Tab) from last→first and backward (Shift+Tab) from first→last.
function handleKeydown(event) {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key === 'Tab') {
    const focusable = Array.from(panelRoot.value?.querySelectorAll(FOCUSABLE) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => { visible.value = true })
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

initForm()

onMounted(() => { if (props.panelApp?.id) loadAttachments() })

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

async function onStatusClick(s) {
  if (s !== form.status) {
    stampingStatus.value = s
    setTimeout(() => { stampingStatus.value = null }, 420)
  }
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
  const colorVar = `var(--stage-${seg.stage}, oklch(57% 0.04 240))`
  const left = Math.max(0, miniPct(seg.start))
  const right = Math.min(100, miniPct(seg.end))
  const width = Math.max(right - left, 0.5)
  if (seg.isTrailing) {
    const colorAlpha = `color-mix(in oklch, ${colorVar} 80%, transparent)`
    return {
      left: left + '%',
      width: width + '%',
      backgroundImage: `repeating-linear-gradient(90deg, ${colorAlpha} 0px, ${colorAlpha} 6px, transparent 6px, transparent 10px)`,
    }
  }
  return {
    left: left + '%',
    width: width + '%',
    backgroundColor: colorVar,
  }
}

function miniDays(seg) {
  return durationDays(seg.start, seg.end)
}

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
.prose :deep(code) { background: var(--sunken); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
.prose :deep(pre) { background: var(--sunken); padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.25rem 0; }
.prose :deep(pre code) { background: none; padding: 0; }
.prose :deep(blockquote) { background: var(--sunken); border-radius: 4px; margin: 0.25rem 0; padding: 0.35rem 0.75rem; color: var(--ink-2); font-style: italic; }
.prose :deep(a) { color: var(--accent); text-decoration: underline; }
.prose :deep(strong) { font-weight: 600; }
.prose :deep(em) { font-style: italic; }
</style>
