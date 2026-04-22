<template>
  <svg
    ref="svgRef"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 64 64"
    class="w-8 h-8 rounded-lg shrink-0"
    aria-hidden="true"
    @mouseenter="replay"
  >
    <rect width="64" height="64" rx="12" style="fill: var(--logo-bg)" />
    <g style="fill: var(--logo-chevron)">
      <path class="b b1" d="M 12 26 L 16 22 L 26 32 L 16 42 L 12 38 L 18 32 Z" />
      <path class="b b2" d="M 22 22 L 26 18 L 40 32 L 26 46 L 22 42 L 32 32 Z" />
      <path class="b b3" d="M 32 18 L 36 14 L 54 32 L 36 50 L 32 46 L 46 32 Z" />
    </g>
  </svg>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({ trigger: { type: Number, default: 0 } })
const svgRef = ref(null)

function replay() {
  if (!svgRef.value) return
  const paths = svgRef.value.querySelectorAll('.b')
  paths.forEach(p => { p.style.animation = 'none' })
  void svgRef.value.getBoundingClientRect()
  paths.forEach(p => { p.style.animation = '' })
}

watch(() => props.trigger, replay)
</script>
