<template>
  <div
    @click="$emit('select', application)"
    role="button"
    tabindex="0"
    @keydown.enter="$emit('select', application)"
    @keydown.space.prevent="$emit('select', application)"
    class="bg-panel rounded-lg border border-line p-2 @[200px]:p-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-[transform,box-shadow] duration-200 ease-out-quart"
  >
    <p class="font-semibold font-condensed text-sm text-ink truncate">{{ application.company_name }}</p>
    <p class="text-xs text-ink-2 truncate mt-0.5">{{ application.role_title }}</p>
    <p v-if="showUser" class="text-xs text-ink-3 truncate mt-0.5">{{ application.user_email }}</p>
    <!-- Hidden on narrow columns (<200px); shown when column is wide enough to breathe -->
    <div class="hidden @[200px]:flex items-center justify-between mt-2">
      <span class="text-xs text-ink-3">{{ formatDate(application.updated_at) }}</span>
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
