<template>
  <nav class="flex items-stretch gap-4" aria-label="Section">
    <button
      v-for="s in SECTIONS"
      :key="s.value"
      type="button"
      :aria-current="s.value === section ? 'page' : undefined"
      @click="$emit('set-section', s.value)"
      class="min-h-[44px] flex items-end pb-1 border-b-2 text-sm font-semibold font-condensed uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm"
      :class="
        s.value === section
          ? 'border-accent text-ink'
          : 'border-transparent text-ink-3 hover:text-ink-2'
      "
    >
      {{ s.label }}
    </button>
  </nav>
</template>

<script setup>
// The section switch: which entity you are looking at. A plain button set
// rather than a tab widget, because the outgoing section unmounts and there is
// no stable panel for a tab to reference. Underlined rather than a filled
// segmented control, which reads as the generic dashboard look the brief
// rejects.
defineProps({ section: String })
defineEmits(['set-section'])

const SECTIONS = [
  { value: 'applications', label: 'Applications' },
  { value: 'people', label: 'People' },
]
</script>
