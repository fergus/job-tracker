<template>
  <div class="max-w-screen-lg mx-auto">
    <h2 class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider mb-4">
      People
    </h2>
    <ul class="flex flex-col gap-1">
      <li v-for="contact in contacts" :key="contact.id" class="text-sm text-ink">
        {{ contact.name }}
      </li>
    </ul>
  </div>
</template>

<script setup>
// The People section. Contacts arrive already classified and ordered by the
// server (KTD1), so this never reclassifies a date or re-sorts a list.
defineProps({ contacts: { type: Array, default: () => [] } })
</script>
