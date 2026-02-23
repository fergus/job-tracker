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
          <a v-if="application.job_posting_url" :href="application.job_posting_url" target="_blank" class="text-sm text-blue-600 hover:underline">Job Posting &#8599;</a>
          <a v-if="application.company_website_url" :href="application.company_website_url" target="_blank" class="text-sm text-blue-600 hover:underline">Company Website &#8599;</a>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-3 gap-3">
          <div v-for="d in dates" :key="d.key">
            <p class="text-xs text-gray-400 uppercase tracking-wide">{{ d.label }}</p>
            <p class="text-sm text-gray-700">{{ formatDate(application[d.key]) }}</p>
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
          <div class="flex gap-2 mb-3">
            <select v-model="newNoteStage" class="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden capitalize">
              <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
            </select>
            <input
              v-model="newNoteContent"
              @keydown.enter="addNote"
              placeholder="Add a note..."
              class="flex-1 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
            />
            <button @click="addNote" class="text-sm text-blue-600 hover:text-blue-700 font-medium px-2">Add</button>
          </div>
          <!-- Notes list -->
          <div v-if="sortedNotes.length === 0" class="text-sm text-gray-400 py-2">No notes yet.</div>
          <div v-for="note in sortedNotes" :key="note.id" class="flex items-start justify-between bg-gray-50 rounded-lg p-2 mb-1.5">
            <div class="flex items-start gap-2 flex-1 min-w-0">
              <span :class="stageBadgeClass(note.stage)" class="px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-0.5 shrink-0">{{ note.stage }}</span>
              <div class="flex-1 min-w-0">
                <input
                  v-if="editingNoteId === note.id"
                  v-model="editingContent"
                  @keydown.enter="saveEdit(note.id)"
                  @keydown.escape="cancelEdit"
                  @blur="saveEdit(note.id)"
                  class="w-full text-sm text-gray-700 border border-blue-300 rounded px-1.5 py-0.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-hidden"
                  ref="editInput"
                />
                <p v-else @click="startEdit(note)" class="text-sm text-gray-700 cursor-pointer hover:text-blue-600">{{ note.content }}</p>
                <p class="text-xs text-gray-400 mt-0.5">{{ formatDateTime(note.created_at) }}</p>
              </div>
            </div>
            <button @click="removeNote(note.id)" class="text-gray-300 hover:text-red-500 text-sm ml-2 shrink-0">&times;</button>
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
import { getCVUrl, uploadCV, getCoverLetterUrl, uploadCoverLetter, createNote, updateNote, deleteNote } from '../api'

const props = defineProps({ application: Object })
const emit = defineEmits(['close', 'edit', 'delete', 'status-change', 'cv-uploaded', 'cover-letter-uploaded', 'notes-changed'])

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

const newNoteStage = ref(props.application.status)
const newNoteContent = ref('')
const editingNoteId = ref(null)
const editingContent = ref('')
const editInput = ref(null)

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
  nextTick(() => {
    editInput.value?.focus()
  })
}

async function saveEdit(noteId) {
  const content = editingContent.value?.trim()
  if (!content || editingNoteId.value !== noteId) return
  const note = props.application.notes?.find(n => n.id === noteId)
  if (note && content === note.content) {
    cancelEdit()
    return
  }
  editingNoteId.value = null
  try {
    await updateNote(props.application.id, noteId, { content })
    emit('notes-changed')
  } catch (err) {
    alert('Error updating note: ' + (err.response?.data?.error || err.message))
  }
}

function cancelEdit() {
  editingNoteId.value = null
  editingContent.value = ''
}

function confirmDelete() {
  if (confirm(`Delete application for ${props.application.company_name} - ${props.application.role_title}?`)) {
    emit('delete', props.application.id)
  }
}
</script>
