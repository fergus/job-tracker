<template>
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{{ application.company_name }}</h2>
          <p class="text-sm text-gray-500">{{ application.role_title }}</p>
        </div>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <div class="px-6 py-4 space-y-5">
        <!-- Status -->
        <div class="flex items-center gap-3">
          <label class="text-sm font-medium text-gray-700">Status:</label>
          <select
            :value="application.status"
            @change="$emit('status-change', application.id, ($event.target).value)"
            class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
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

        <!-- Interview Notes -->
        <div v-if="application.interview_notes">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Interview Notes</h3>
          <p class="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{{ application.interview_notes }}</p>
        </div>

        <!-- Prep Work -->
        <div v-if="application.prep_work">
          <h3 class="text-sm font-semibold text-gray-700 mb-1">Prep Work</h3>
          <p class="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{{ application.prep_work }}</p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between px-6 py-4 border-t border-gray-200">
        <button
          @click="confirmDelete"
          class="text-sm text-red-600 hover:text-red-700 font-medium"
        >Delete</button>
        <div class="flex gap-3">
          <button @click="$emit('close')" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Close</button>
          <button @click="$emit('edit', application)" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">Edit</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { getCVUrl, uploadCV, getCoverLetterUrl, uploadCoverLetter } from '../api'

const props = defineProps({ application: Object })
const emit = defineEmits(['close', 'edit', 'delete', 'status-change', 'cv-uploaded', 'cover-letter-uploaded'])

const statuses = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected']

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

function formatDate(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString()
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

function confirmDelete() {
  if (confirm(`Delete application for ${props.application.company_name} - ${props.application.role_title}?`)) {
    emit('delete', props.application.id)
  }
}
</script>
