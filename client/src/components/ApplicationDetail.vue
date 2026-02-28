<template>
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="handleClose">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{{ application.company_name }}</h2>
          <p class="text-sm text-gray-500">{{ application.role_title }}</p>
        </div>
        <button @click="handleClose" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div class="px-6 py-4 space-y-5">
        <!-- Status -->
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-gray-700">Status:</label>
          <select
            :value="application.status"
            @change="$emit('status-change', application.id, ($event.target).value)"
            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
          >
            <option v-for="s in statuses" :key="s" :value="s" class="capitalize">{{ s }}</option>
          </select>
        </div>

        <!-- Links -->
        <div v-if="application.job_posting_url || application.company_website_url" class="flex gap-4">
          <a v-if="application.job_posting_url" :href="application.job_posting_url" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:underline">Job Posting &#8599;</a>
          <a v-if="application.company_website_url" :href="application.company_website_url" target="_blank" rel="noopener noreferrer" class="text-sm text-blue-600 hover:underline">Company Website &#8599;</a>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-3 gap-3">
          <div v-for="d in dates" :key="d.key">
            <p class="text-xs text-gray-400 uppercase tracking-wide">{{ d.label }}</p>
            <!-- Read-only created_at -->
            <p v-if="d.key === 'created_at'" class="text-sm text-gray-700">{{ formatDate(application[d.key]) }}</p>
            <!-- Editing mode -->
            <div v-else-if="editingDateKey === d.key" class="flex items-center gap-1">
              <input
                type="date"
                :value="toDateInputValue(application[d.key])"
                @change="onDateChange(d.key, $event)"
                @blur="editingDateKey = null"
                @keydown.escape="editingDateKey = null"
                class="text-sm border border-blue-300 rounded px-1 py-0.5 focus:ring-2 focus:ring-blue-500 outline-hidden w-full"
                ref="dateInput"
              />
              <button
                v-if="application[d.key]"
                @mousedown.prevent="clearDate(d.key)"
                class="text-gray-400 hover:text-red-500 text-sm leading-none shrink-0"
                title="Clear date"
              >&times;</button>
            </div>
            <!-- Display mode (clickable) -->
            <p v-else @click="editingDateKey = d.key" class="text-sm text-gray-700 cursor-pointer hover:text-blue-600">{{ formatDate(application[d.key]) }}</p>
          </div>
        </div>

        <!-- Mini Timeline -->
        <div>
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
              <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: miniStageColor(seg.stage) }"></span>
              <span class="text-xs text-gray-500 capitalize">{{ seg.stage }}</span>
            </div>
          </div>
        </div>

        <!-- Job Description -->
        <div v-if="application.job_description">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Job Description</h3>
          <p class="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{{ application.job_description }}</p>
        </div>

        <!-- CV -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-1">CV / Resume</h3>
          <div class="flex items-center gap-3">
            <a
              v-if="application.cv_filename"
              :href="cvUrl"
              class="text-sm text-blue-600 hover:underline"
            >{{ application.cv_filename }} &#8595;</a>
            <span v-else class="text-sm text-gray-400">No CV uploaded</span>
            <label class="text-xs text-blue-600 hover:underline cursor-pointer">
              {{ application.cv_filename ? 'Replace' : 'Upload' }}
              <input type="file" @change="onCVUpload" accept=".pdf,.doc,.docx" class="hidden" />
            </label>
          </div>
        </div>

        <!-- Cover Letter -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Cover Letter</h3>
          <div class="flex items-center gap-3">
            <a
              v-if="application.cover_letter_filename"
              :href="coverLetterUrl"
              class="text-sm text-blue-600 hover:underline"
            >{{ application.cover_letter_filename }} &#8595;</a>
            <span v-else class="text-sm text-gray-400">No cover letter uploaded</span>
            <label class="text-xs text-blue-600 hover:underline cursor-pointer">
              {{ application.cover_letter_filename ? 'Replace' : 'Upload' }}
              <input type="file" @change="onCoverLetterUpload" accept=".pdf,.doc,.docx" class="hidden" />
            </label>
          </div>
        </div>

        <!-- Stage Notes -->
        <div>
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Notes</h3>
          <!-- Add note form -->
          <div class="flex flex-col gap-2 mb-3">
            <div class="flex items-center gap-2">
              <select v-model="newNoteStage" class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden capitalize">
                <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
              </select>
              <button @click="addNote" class="text-sm text-blue-600 hover:text-blue-700 font-medium px-2 ml-auto">Add</button>
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
          <!-- Notes list -->
          <div v-if="sortedNotes.length === 0" class="text-sm text-gray-400 py-2">No notes yet.</div>
          <div v-for="note in sortedNotes" :key="note.id" class="bg-gray-50 rounded-lg p-2 mb-1.5">
            <!-- Edit mode -->
            <div v-if="editingNoteId === note.id" class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <select v-model="editingStage" class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden capitalize">
                  <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                </select>
                <div class="ml-auto flex gap-2">
                  <button @click="saveEdit(note.id)" class="text-xs text-white bg-blue-600 hover:bg-blue-700 font-medium px-2 py-1 rounded">Save</button>
                  <button @click="cancelEdit" class="text-xs text-gray-600 hover:text-gray-800 font-medium px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">Cancel</button>
                </div>
              </div>
              <textarea
                v-model="editingContent"
                @keydown.escape="cancelEdit"
                @keydown.ctrl.enter="saveEdit(note.id)"
                @keydown.meta.enter="saveEdit(note.id)"
                rows="4"
                class="w-full text-sm text-gray-700 border border-blue-300 rounded px-1.5 py-0.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden resize-y"
                ref="editTextarea"
              />
            </div>
            <!-- View mode -->
            <div v-else class="flex items-start justify-between">
              <div class="flex items-start gap-2 flex-1 min-w-0">
                <span :class="stageBadgeClass(note.stage)" class="px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-0.5 shrink-0">{{ note.stage }}</span>
                <div class="flex-1 min-w-0">
                  <div
                    class="text-sm text-gray-700 prose prose-sm max-w-none cursor-pointer hover:text-blue-600"
                    v-html="renderMarkdown(note.content)"
                    @click="startEdit(note)"
                  />
                  <div class="text-xs text-gray-400 mt-0.5 flex gap-2">
                    <span>Created: {{ formatDateTime(note.created_at) }}</span>
                    <span v-if="note.updated_at && note.updated_at !== note.created_at">· Edited: {{ formatDateTime(note.updated_at) }}</span>
                  </div>
                </div>
              </div>
              <button @click="removeNote(note.id)" class="text-gray-300 hover:text-red-500 text-sm ml-2 shrink-0">&times;</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between px-6 py-4 border-t border-gray-200">
        <button
          @click="confirmDelete"
          class="text-sm text-red-600 hover:text-red-700 font-medium"
        >Delete</button>
        <div class="flex gap-3">
          <button @click="handleClose" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Close</button>
          <button @click="$emit('edit', application)" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Edit</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { getCVUrl, uploadCV, getCoverLetterUrl, uploadCoverLetter, createNote, updateNote, deleteNote, updateDates } from '../api'
import { computeSegments, stageColor, durationDays } from '../utils/timeline'

marked.setOptions({ breaks: true })

const props = defineProps({ application: Object })
const emit = defineEmits(['close', 'edit', 'delete', 'status-change', 'cv-uploaded', 'cover-letter-uploaded', 'notes-changed', 'dates-changed'])

const statuses = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected']

const stageBadgeClasses = {
  interested: 'bg-gray-100 text-gray-700',
  applied: 'bg-blue-100 text-blue-700',
  screening: 'bg-yellow-100 text-yellow-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-green-100 text-green-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

function stageBadgeClass(stage) {
  return stageBadgeClasses[stage] || 'bg-gray-100 text-gray-700'
}

function renderMarkdown(content) {
  return DOMPurify.sanitize(marked.parse(content || ''))
}

const dates = [
  { key: 'created_at', label: 'Created' },
  { key: 'applied_at', label: 'Applied' },
  { key: 'screening_at', label: 'Screening' },
  { key: 'interview_at', label: 'Interview' },
  { key: 'offer_at', label: 'Offer' },
  { key: 'closed_at', label: 'Closed' },
]

const cvUrl = computed(() => getCVUrl(props.application.id))
const coverLetterUrl = computed(() => getCoverLetterUrl(props.application.id))

// Mini timeline
const miniSegments = computed(() => computeSegments(props.application, new Date().toISOString()))

const miniTotalMs = computed(() => {
  const start = new Date(props.application.created_at)
  const end = props.application.closed_at ? new Date(props.application.closed_at) : new Date()
  return Math.max(end - start, 1)
})

function miniPct(isoDate) {
  return ((new Date(isoDate) - new Date(props.application.created_at)) / miniTotalMs.value) * 100
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

function miniStageColor(stage) {
  return stageColor(stage)
}

function miniDays(seg) {
  return durationDays(seg.start, seg.end)
}

const editingDateKey = ref(null)
const dateInput = ref(null)

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
    await updateDates(props.application.id, { [key]: isoValue })
    emit('dates-changed')
  } catch (err) {
    alert('Error updating date: ' + (err.response?.data?.error || err.message))
  }
}

async function clearDate(key) {
  editingDateKey.value = null
  try {
    await updateDates(props.application.id, { [key]: null })
    emit('dates-changed')
  } catch (err) {
    alert('Error clearing date: ' + (err.response?.data?.error || err.message))
  }
}

function formatShortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const newNoteStage = ref(props.application.status)
const newNoteContent = ref('')
const editingNoteId = ref(null)
const editingContent = ref('')
const editingStage = ref('')
const editTextarea = ref(null)

const sortedNotes = computed(() => {
  return [...(props.application.notes || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
})

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString()
}

function formatDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function addNote() {
  const content = newNoteContent.value?.trim()
  if (!content) return
  try {
    await createNote(props.application.id, { stage: newNoteStage.value, content })
    newNoteContent.value = ''
    emit('notes-changed')
  } catch (err) {
    alert('Error adding note: ' + (err.response?.data?.error || err.message))
  }
}

async function removeNote(noteId) {
  try {
    await deleteNote(props.application.id, noteId)
    emit('notes-changed')
  } catch (err) {
    alert('Error deleting note: ' + (err.response?.data?.error || err.message))
  }
}

async function onCVUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    await uploadCV(props.application.id, file)
    emit('cv-uploaded')
  } catch (err) {
    alert('Upload failed: ' + (err.response?.data?.error || err.message))
  }
}

async function onCoverLetterUpload(e) {
  const file = e.target.files[0]
  if (!file) return
  try {
    await uploadCoverLetter(props.application.id, file)
    emit('cover-letter-uploaded')
  } catch (err) {
    alert('Upload failed: ' + (err.response?.data?.error || err.message))
  }
}

async function handleClose() {
  const content = newNoteContent.value?.trim()
  if (content) {
    await addNote()
  }
  emit('close')
}

function startEdit(note) {
  editingNoteId.value = note.id
  editingContent.value = note.content
  editingStage.value = note.stage
  nextTick(() => {
    editTextarea.value?.focus()
  })
}

async function saveEdit(noteId) {
  const content = editingContent.value?.trim()
  if (!content || editingNoteId.value !== noteId) return
  const note = props.application.notes?.find(n => n.id === noteId)
  if (note && content === note.content && editingStage.value === note.stage) {
    cancelEdit()
    return
  }
  editingNoteId.value = null
  try {
    await updateNote(props.application.id, noteId, { content, stage: editingStage.value })
    emit('notes-changed')
  } catch (err) {
    alert('Error updating note: ' + (err.response?.data?.error || err.message))
  }
}

function cancelEdit() {
  editingNoteId.value = null
  editingContent.value = ''
  editingStage.value = ''
}

function confirmDelete() {
  if (confirm(`Delete application for ${props.application.company_name} - ${props.application.role_title}?`)) {
    emit('delete', props.application.id)
  }
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
