<template>
  <div class="flex items-stretch gap-3" aria-label="View">
    <button
      v-for="lens in LENSES"
      :key="lens.value"
      type="button"
      :aria-current="lens.value === view ? 'true' : undefined"
      @click="$emit('set-view', lens.value)"
      class="min-h-[44px] flex items-center text-xs font-medium tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-1"
      :class="
        lens.value === view
          ? 'text-ink underline underline-offset-4 decoration-accent decoration-2'
          : 'text-ink-3 hover:text-ink-2'
      "
    >
      {{ lens.label }}
    </button>
  </div>
</template>

<script setup>
// The lens switch: which way the Applications section is drawn. It replaces
// the one-way chevron links each view carried, which could only ever move you
// to the other one and sat at 20px, well under the touch target the rest of
// the shell uses.
defineProps({ view: String })
defineEmits(['set-view'])

const LENSES = [
  { value: 'kanban', label: 'Board' },
  { value: 'timeline', label: 'Timeline' },
]
</script>
