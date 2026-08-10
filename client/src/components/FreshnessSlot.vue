<template>
  <!--
    The ambient freshness slot (R1). It sits beside the version link and
    inherits its type scale and muted ink (KTD6) -- every tier renders the
    same way, so no tier is distinguished by colour or position (R15), and
    there is no dot or icon (R18).

    Hidden below the `sm` breakpoint (R17): that is a viewport rule, not the
    `compactHeader` preference. The bar is the only surface on mobile.
  -->
  <span
    v-if="display"
    class="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-3 tabular-nums"
  >
    <span aria-hidden="true">&middot;</span>
    <!-- R3: the absolute form stays reachable in every tier. -->
    <span :title="absolute">{{ display }}</span>
  </span>
</template>

<script setup>
defineProps({
  // The tier's display string; empty only before the first confirmed
  // connection (R4). The machine never returns it to empty afterwards (R4b).
  display: { type: String, default: '' },
  absolute: { type: String, default: '' }
})
</script>
