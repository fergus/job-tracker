<template>
  <div
    class="fixed inset-0 z-50 outline-none"
    @keydown.escape="$emit('close')"
    tabindex="-1"
    ref="panelRoot"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="$emit('close')"
    />

    <!-- Panel: right-side drawer on desktop, bottom sheet on mobile -->
    <div
      class="absolute flex flex-col bg-panel shadow-xl
             inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
             md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[480px] md:rounded-none
             transition-transform duration-300 ease-in-out"
      :class="visible
        ? 'translate-y-0 md:translate-x-0'
        : 'translate-y-full md:translate-x-full'"
    >
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div class="w-8 h-1 bg-line-2 rounded-full"></div>
      </div>

      <!-- Header -->
      <div class="px-5 pt-3 pb-3 border-b border-line shrink-0">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-ink">Settings</h2>
          <button
            @click="$emit('close')"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken transition-colors"
            aria-label="Close settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto">
        <div class="px-5 py-5 space-y-6">

          <!-- Data Scope section (admins only) -->
          <section v-if="props.currentUser?.isAdmin">
            <h3 class="text-sm font-semibold text-ink-2 mb-3">Data Scope</h3>
            <div class="flex bg-sunken rounded-lg p-0.5">
              <button
                @click="$emit('set-show-all', false)"
                :class="!props.showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
                class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
              >My Applications</button>
              <button
                @click="$emit('set-show-all', true)"
                :class="props.showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
                class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
              >All Applications</button>
            </div>
          </section>

          <!-- API Keys section -->
          <section>
            <h3 class="text-sm font-semibold text-ink-2 mb-3">API Keys</h3>
            <p class="text-xs text-ink-3 mb-4">
              Use API keys to access the REST API programmatically without the browser login flow.
              Keys are scoped to your account. The raw key is shown once at creation — save it immediately.
            </p>

            <!-- Generate form -->
            <div class="flex gap-2 mb-3">
              <input
                v-model="generateLabel"
                type="text"
                placeholder="Label (optional)"
                maxlength="100"
                class="flex-1 text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                @keydown.enter="generate"
              />
              <button
                @click="generate"
                :disabled="isGenerating"
                class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              >{{ isGenerating ? 'Generating…' : 'Generate Key' }}</button>
            </div>
            <p v-if="generateError" class="text-xs text-red-600 mb-3">{{ generateError }}</p>

            <!-- Key list -->
            <div v-if="keys.length === 0" class="text-sm text-ink-3 italic py-2">
              No API keys yet.
            </div>
            <ul v-else class="space-y-2">
              <li
                v-for="key in keys"
                :key="key.id"
                class="border border-line rounded-lg px-4 py-3"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-ink truncate">{{ key.label || 'Unnamed' }}</p>
                    <p class="text-xs text-ink-3 mt-0.5">
                      Created {{ relativeTime(key.created_at) }} ·
                      {{ key.last_used_at ? `Last used ${relativeTime(key.last_used_at)}` : 'Never used' }}
                    </p>
                  </div>
                  <div class="shrink-0">
                    <!-- Inline revoke confirmation -->
                    <template v-if="confirmRevokeId === key.id">
                      <span class="text-xs text-ink-3 mr-1">Revoke?</span>
                      <button
                        @click="confirmRevoke(key.id)"
                        class="text-xs text-danger hover:text-danger-hover font-medium mr-2"
                      >Yes</button>
                      <button
                        @click="confirmRevokeId = null"
                        class="text-xs text-ink-3 hover:text-ink-2"
                      >Cancel</button>
                    </template>
                    <button
                      v-else
                      @click="confirmRevokeId = key.id"
                      class="text-xs text-ink-3 hover:text-danger transition-colors"
                    >Revoke</button>
                  </div>
                </div>
              </li>
            </ul>
          </section>

        </div>
      </div>

      <!-- One-time key modal (non-dismissible by backdrop) -->
      <div
        v-if="newKey"
        class="absolute inset-0 bg-panel/95 flex items-center justify-center p-6 rounded-t-2xl md:rounded-none"
        @click.stop
      >
        <div class="w-full max-w-sm">
          <div class="text-center mb-4">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-base font-semibold text-ink">API Key Generated</h3>
            <p class="text-sm text-ink-3 mt-1">Copy this key now — it won't be shown again.</p>
          </div>

          <div class="bg-raised border border-line rounded-lg p-3 mb-3">
            <code class="text-xs text-ink break-all font-mono">{{ newKey }}</code>
          </div>

          <button
            @click="copyKey"
            class="w-full mb-2 border border-line hover:bg-raised text-ink-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >{{ copied ? '✓ Copied' : 'Copy to clipboard' }}</button>

          <button
            @click="newKey = null; copied = false"
            class="w-full bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >I've saved this key</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { generateApiKey, listApiKeys, revokeApiKey } from '../api'

const props = defineProps({
  show: Boolean,
  currentUser: Object,
  showAllUsers: Boolean,
})
defineEmits(['close', 'set-show-all'])

const panelRoot = ref(null)
const visible = ref(false)
const keys = ref([])
const newKey = ref(null)
const generateLabel = ref('')
const generateError = ref(null)
const isGenerating = ref(false)
const confirmRevokeId = ref(null)
const copied = ref(false)

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => {
    visible.value = true
  })
  loadKeys()
})

async function loadKeys() {
  try {
    keys.value = await listApiKeys()
  } catch {
    keys.value = []
  }
}

async function generate() {
  if (isGenerating.value) return
  generateError.value = null
  isGenerating.value = true
  try {
    const res = await generateApiKey(generateLabel.value.trim() || null)
    newKey.value = res.key
    generateLabel.value = ''
    await loadKeys()
  } catch (err) {
    const msg = err?.response?.data?.error
    generateError.value = msg || 'Failed to generate key. Please try again.'
  } finally {
    isGenerating.value = false
  }
}

async function confirmRevoke(id) {
  try {
    await revokeApiKey(id)
  } catch {
    // 404 = already gone; treat as success
  }
  confirmRevokeId.value = null
  await loadKeys()
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(newKey.value)
    copied.value = true
  } catch {
    // Clipboard API unavailable — user can copy manually
  }
}

function relativeTime(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
</script>
