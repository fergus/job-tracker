<template>
  <div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
    <div class="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
        <h2 class="text-lg font-semibold text-gray-900">{{ isEdit ? 'Edit Application' : 'New Application' }}</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <form @submit.prevent="submit" class="flex flex-col flex-1 min-h-0">
      <div class="px-6 py-4 space-y-4 overflow-y-auto flex-1">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Company *</label>
            <input v-model="form.company_name" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Role *</label>
            <input v-model="form.role_title" required class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
        </div>

        <div v-if="!isEdit">
          <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select v-model="form.status" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
            <option v-for="s in statuses" :key="s" :value="s" class="capitalize">{{ s }}</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Job Description</label>
          <textarea v-model="form.job_description" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Job Posting URL</label>
            <input v-model="form.job_posting_url" type="url" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Company Website</label>
            <input v-model="form.company_website_url" type="url" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
          </div>
        </div>

        <div v-if="!isEdit" class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">CV / Resume</label>
            <input type="file" @change="onCVChange" accept=".pdf,.doc,.docx" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cover Letter</label>
            <input type="file" @change="onCoverLetterChange" accept=".pdf,.doc,.docx" class="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Interview Notes</label>
          <textarea v-model="form.interview_notes" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Prep Work</label>
          <textarea v-model="form.prep_work" rows="3" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"></textarea>
        </div>

      </div>
        <div class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button type="button" @click="$emit('close')" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button type="submit" :disabled="saving" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {{ saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { createApplication, updateApplication } from '../api'

const props = defineProps({ application: Object })
const emit = defineEmits(['close', 'saved'])

const isEdit = computed(() => !!props.application)
const saving = ref(false)
const cvFile = ref(null)
const coverLetterFile = ref(null)

const statuses = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected']

const form = reactive({
  company_name: props.application?.company_name || '',
  role_title: props.application?.role_title || '',
  status: props.application?.status || 'interested',
  job_description: props.application?.job_description || '',
  job_posting_url: props.application?.job_posting_url || '',
  company_website_url: props.application?.company_website_url || '',
  interview_notes: props.application?.interview_notes || '',
  prep_work: props.application?.prep_work || '',
})

function onCVChange(e) {
  cvFile.value = e.target.files[0] || null
}

function onCoverLetterChange(e) {
  coverLetterFile.value = e.target.files[0] || null
}

async function submit() {
  saving.value = true
  try {
    if (isEdit.value) {
      await updateApplication(props.application.id, {
        company_name: form.company_name,
        role_title: form.role_title,
        job_description: form.job_description,
        job_posting_url: form.job_posting_url,
        company_website_url: form.company_website_url,
        interview_notes: form.interview_notes,
        prep_work: form.prep_work,
      })
    } else {
      const formData = new FormData()
      formData.append('company_name', form.company_name)
      formData.append('role_title', form.role_title)
      formData.append('status', form.status)
      if (form.job_description) formData.append('job_description', form.job_description)
      if (form.job_posting_url) formData.append('job_posting_url', form.job_posting_url)
      if (form.company_website_url) formData.append('company_website_url', form.company_website_url)
      if (form.interview_notes) formData.append('interview_notes', form.interview_notes)
      if (form.prep_work) formData.append('prep_work', form.prep_work)
      if (cvFile.value) formData.append('cv', cvFile.value)
      if (coverLetterFile.value) formData.append('cover_letter', coverLetterFile.value)
      await createApplication(formData)
    }
    emit('saved')
  } catch (err) {
    alert('Error saving: ' + (err.response?.data?.error || err.message))
  } finally {
    saving.value = false
  }
}
</script>
