<template>
  <div
    @click="$emit('select', application)"
    class="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow"
  >
    <p class="font-semibold text-sm text-gray-900 truncate">{{ application.company_name }}</p>
    <p class="text-xs text-gray-600 truncate mt-0.5">{{ application.role_title }}</p>
    <p v-if="showUser" class="text-xs text-gray-400 truncate mt-0.5">{{ application.user_email }}</p>
    <div class="flex items-center justify-between mt-2">
      <span class="text-xs text-gray-400">{{ formatDate(application.updated_at) }}</span>
      <span class="flex gap-1">
        <span v-if="application.cv_filename" class="text-xs text-blue-500" title="CV attached">&#128206;</span>
        <span v-if="application.cover_letter_filename" class="text-xs text-green-500" title="Cover letter attached">&#128196;</span>
      </span>
    </div>
  </div>
</template>

<script setup>
defineProps({ application: Object, showUser: Boolean })
defineEmits(['select'])

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}
</script>
