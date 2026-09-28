<template>
  <nav class="flex items-stretch gap-4" aria-label="Section">
    <!-- Today is where the day starts; Pipeline and People are places you go
         to review or look someone up, so they sit quieter beside it. -->
    <button
      type="button"
      :aria-current="section === PRIMARY.value ? 'page' : undefined"
      @click="$emit('set-section', PRIMARY.value)"
      class="min-h-[44px] flex items-end pb-1 border-b-2 text-sm font-semibold font-condensed uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm"
      :class="
        section === PRIMARY.value
          ? 'border-accent text-ink'
          : 'border-transparent text-ink-3 hover:text-ink-2'
      "
    >
      {{ PRIMARY.label }}
    </button>
    <span class="flex items-stretch gap-3 sm:ml-2">
      <button
        v-for="s in SECONDARY"
        :key="s.value"
        type="button"
        :aria-current="s.value === section ? 'page' : undefined"
        @click="$emit('set-section', s.value)"
        class="min-h-[44px] flex items-end pb-1 border-b-2 text-xs font-medium font-condensed uppercase tracking-wider transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-sm"
        :class="
          s.value === section
            ? 'border-accent text-ink'
            : 'border-transparent text-ink-3 hover:text-ink-2'
        "
      >
        {{ s.label }}
      </button>
    </span>
  </nav>
</template>

<script setup>
// The section switch: which view you are looking at. A plain button set
// rather than a tab widget, because the outgoing section unmounts and there is
// no stable panel for a tab to reference. Underlined rather than a filled
// segmented control, which reads as the generic dashboard look the brief
// rejects.
defineProps({ section: String })
defineEmits(['set-section'])

const PRIMARY = { value: 'today', label: 'Today' }
// `applications` keeps its internal key; the pipeline is still the
// applications section, now under the name that says what it is for.
const SECONDARY = [
  { value: 'applications', label: 'Pipeline' },
  { value: 'people', label: 'People' },
]
</script>
