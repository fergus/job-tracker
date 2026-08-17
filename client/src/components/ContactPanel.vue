<template>
  <div
    class="fixed inset-0 z-[55] outline-none"
    @keydown="handleKeydown"
    tabindex="-1"
    ref="panelRoot"
    role="dialog"
    aria-modal="true"
    :aria-label="contact ? `Contact: ${contact.name}` : 'Contact'"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="requestClose"
    />

    <!-- Panel: right-side drawer on desktop, bottom sheet on mobile -->
    <div
      class="absolute flex flex-col bg-panel shadow-xl
             inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
             md:inset-y-0 md:right-0 md:left-auto md:h-auto md:w-[480px] md:rounded-none
             transition-transform duration-300 ease-out-expo"
      :class="visible
        ? 'translate-y-0 md:translate-x-0'
        : 'translate-y-full md:translate-x-full'"
    >
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
        <div class="w-8 h-1 bg-line-2 rounded-full"></div>
      </div>

      <!-- Header -->
      <div class="px-5 pt-3 pb-3 border-b border-line shrink-0">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-bold font-condensed tracking-wide text-ink truncate">
              {{ contact?.name || 'Contact' }}
            </h2>
            <p v-if="contactSubtitle" class="text-xs text-ink-3 truncate">{{ contactSubtitle }}</p>
          </div>
          <button
            @click="requestClose"
            class="size-11 shrink-0 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken transition-colors"
            aria-label="Close contact"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        <div v-if="loading" class="px-5 py-8 text-sm text-ink-3">Loading...</div>
        <div v-else-if="loadError" class="px-5 py-8">
          <p class="text-sm text-danger">{{ loadError }}</p>
        </div>
        <div v-else class="px-5 py-5 space-y-8">

          <!-- Next touch -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-1">Next touch</h3>
            <p class="text-xs text-ink-3 mb-3">
              What you owe this person, and when. Nothing clears it but you -- logging a call
              below advances the relationship, it does not discharge the commitment.
            </p>
            <p
              v-if="contact.follow_up_state"
              class="mb-3 text-sm font-medium"
              :class="followUpClass"
            >{{ followUpLabel }}</p>
            <div class="space-y-3">
              <div>
                <label for="contact-next-at" class="block text-xs text-ink-3 mb-1">Next touch date</label>
                <input
                  id="contact-next-at"
                  v-model="form.next_action_at"
                  type="date"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div>
                <label for="contact-next-what" class="block text-xs text-ink-3 mb-1">Next touch action</label>
                <input
                  id="contact-next-what"
                  v-model="form.next_action"
                  type="text"
                  maxlength="500"
                  placeholder="e.g. chase the shortlist decision"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <button
                v-if="form.next_action_at || form.next_action"
                @click="clearNextTouch"
                class="text-xs text-ink-3 hover:text-danger px-2 py-1.5 min-h-[44px] inline-flex items-center"
              >Clear the commitment</button>
            </div>
          </section>

          <!-- Details -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-3">Details</h3>
            <div class="space-y-3">
              <div>
                <label for="contact-name" class="block text-xs text-ink-3 mb-1">Name</label>
                <input
                  id="contact-name"
                  v-model="form.name"
                  type="text"
                  maxlength="200"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label for="contact-role" class="block text-xs text-ink-3 mb-1">Role</label>
                  <input
                    id="contact-role"
                    v-model="form.contact_role"
                    type="text"
                    maxlength="200"
                    placeholder="recruiter"
                    class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
                <div>
                  <label for="contact-employer" class="block text-xs text-ink-3 mb-1">Employer</label>
                  <input
                    id="contact-employer"
                    v-model="form.employer"
                    type="text"
                    maxlength="200"
                    class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>
              <div>
                <label for="contact-email" class="block text-xs text-ink-3 mb-1">Email</label>
                <input
                  id="contact-email"
                  v-model="form.email"
                  type="email"
                  maxlength="320"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div>
                <label for="contact-phone" class="block text-xs text-ink-3 mb-1">Phone</label>
                <input
                  id="contact-phone"
                  v-model="form.phone"
                  type="tel"
                  maxlength="50"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div>
                <label for="contact-notes" class="block text-xs text-ink-3 mb-1">Notes</label>
                <p class="text-xs text-ink-3 mb-1">
                  A standing description of who they are, not a log. Interactions go below.
                </p>
                <textarea
                  id="contact-notes"
                  v-model="form.notes"
                  rows="4"
                  maxlength="10000"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-y"
                />
              </div>
            </div>
          </section>

          <!-- Linked records -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-3">Linked records</h3>
            <ul v-if="contact.links?.length" class="space-y-2">
              <li
                v-for="link in contact.links"
                :key="link.id"
                class="text-sm text-ink"
              >
                {{ link.company_name }}
                <span class="text-ink-3">&middot; {{ link.role_title }}</span>
                <span v-if="link.relation" class="text-ink-3">&middot; {{ link.relation }}</span>
              </li>
            </ul>
            <p v-else class="text-sm text-ink-3">Not attached to any record.</p>
          </section>

          <!-- Interaction log -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-1">Interactions</h3>
            <p class="text-xs text-ink-3 mb-3">
              Logging one advances last contacted automatically, so there is no second field to keep.
            </p>

            <div class="bg-raised rounded-lg p-3 mb-4 space-y-2">
              <textarea
                v-model="newNote.content"
                @keydown.ctrl.enter="logInteraction"
                @keydown.meta.enter="logInteraction"
                rows="3"
                maxlength="10000"
                placeholder="What happened? (Ctrl+Enter to log)"
                aria-label="What happened"
                class="w-full text-sm border border-line bg-panel rounded-lg px-2 py-1.5 text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden resize-y"
              />
              <div class="flex items-center gap-2">
                <label for="note-occurred" class="text-xs text-ink-3 shrink-0">Interaction date</label>
                <input
                  id="note-occurred"
                  v-model="newNote.occurred_at"
                  type="date"
                  class="text-sm border border-line bg-panel rounded-lg px-2 py-1.5 text-ink focus:ring-2 focus:ring-accent outline-hidden"
                />
                <span class="text-xs text-ink-3">blank means today</span>
              </div>
              <label class="flex items-center gap-2 text-xs text-ink-2">
                <input v-model="newNote.setsNext" type="checkbox" class="accent-accent" />
                and set the next touch
              </label>
              <div v-if="newNote.setsNext" class="flex items-center gap-2">
                <input
                  v-model="newNote.next_action_at"
                  type="date"
                  aria-label="Logged next touch date"
                  class="text-sm border border-line bg-panel rounded-lg px-2 py-1.5 text-ink focus:ring-2 focus:ring-accent outline-hidden"
                />
                <input
                  v-model="newNote.next_action"
                  type="text"
                  maxlength="500"
                  placeholder="what to chase"
                  aria-label="Logged next touch action"
                  class="flex-1 min-w-0 text-sm border border-line bg-panel rounded-lg px-2 py-1.5 text-ink focus:ring-2 focus:ring-accent outline-hidden"
                />
              </div>
              <div class="flex justify-end">
                <button
                  @click="logInteraction"
                  :disabled="!newNote.content.trim() || logging"
                  class="text-sm px-3 py-1.5 rounded border border-line text-ink hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >Log it</button>
              </div>
            </div>

            <p v-if="!contact.interactions?.length" class="text-sm text-ink-3">
              Nothing logged yet.
            </p>
            <div
              v-for="note in contact.interactions"
              :key="note.id"
              class="bg-raised rounded-lg p-3 mb-2"
            >
              <div class="text-xs text-ink-3 mb-1">{{ formatDate(note.occurred_at) }}</div>
              <div
                class="text-sm text-ink-2 prose prose-sm max-w-none"
                v-html="renderMarkdown(note.content)"
              />
            </div>
          </section>
        </div>
      </div>

      <!-- Footer -->
      <div v-if="!loading && !loadError" class="px-5 py-3 border-t border-line shrink-0 flex items-center justify-between gap-3">
        <span class="text-xs text-ink-3">
          {{ contact.last_contacted_at ? `Last contacted ${formatDate(contact.last_contacted_at)}` : 'Never contacted' }}
        </span>
        <button
          @click="save"
          :disabled="!isDirty || saving"
          class="text-sm px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg font-medium disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >{{ saving ? 'Saving...' : 'Save contact' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { fetchContact, updateContact, addContactNote } from '../api'
import { formatDate } from '../utils/date.js'
import { renderMarkdown } from '../utils/markdown.js'
import { getErrorMessage } from '../utils/error.js'
import { useToast } from '../composables/useToast'

const props = defineProps({ contactId: { type: Number, required: true } })
const emit = defineEmits(['close', 'saved'])

const toast = useToast()

const panelRoot = ref(null)
const visible = ref(false)
const loading = ref(true)
const loadError = ref(null)
const saving = ref(false)
const logging = ref(false)
const contact = ref(null)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// The editable fields, mirrored into a local form so a half-typed edit is never
// pushed to the server and Escape can be guarded on unsaved work.
const EDITABLE = [
  'name',
  'contact_role',
  'employer',
  'email',
  'phone',
  'notes',
  'next_action_at',
  'next_action',
]

const form = reactive(Object.fromEntries(EDITABLE.map((f) => [f, ''])))
let original = {}

const newNote = reactive({
  content: '',
  occurred_at: '',
  setsNext: false,
  next_action_at: '',
  next_action: '',
})

const contactSubtitle = computed(() => {
  if (!contact.value) return ''
  return [contact.value.contact_role, contact.value.employer].filter(Boolean).join(' at ')
})

const followUpClass = computed(() => {
  if (contact.value?.follow_up_state === 'overdue') return 'text-danger'
  if (contact.value?.follow_up_state === 'due') return 'text-accent'
  return 'text-ink-3'
})

const followUpLabel = computed(() => {
  const c = contact.value
  if (!c?.follow_up_state) return ''
  const what = c.next_action ? `: ${c.next_action}` : ''
  const days = c.follow_up_days
  if (c.follow_up_state === 'overdue') {
    const late = Math.abs(days)
    return `Overdue by ${late} ${late === 1 ? 'day' : 'days'}${what}`
  }
  if (c.follow_up_state === 'due') return `Due today${what}`
  return `Due in ${days} ${days === 1 ? 'day' : 'days'}${what}`
})

const isDirty = computed(() => EDITABLE.some((f) => form[f] !== original[f]))

function hydrate(data) {
  contact.value = data
  for (const field of EDITABLE) {
    form[field] = data[field] ?? ''
  }
  original = { ...form }
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    hydrate(await fetchContact(props.contactId))
  } catch (err) {
    loadError.value = 'Could not load this contact -- ' + getErrorMessage(err)
  } finally {
    loading.value = false
  }
}

function clearNextTouch() {
  form.next_action_at = ''
  form.next_action = ''
}

// Empty strings mean "cleared" to the operator, but the service distinguishes a
// blank from an absent field, so send null rather than an empty string.
function payloadFromForm() {
  const patch = {}
  for (const field of EDITABLE) {
    if (form[field] === original[field]) continue
    patch[field] = form[field] === '' ? null : form[field]
  }
  return patch
}

async function save() {
  const patch = payloadFromForm()
  if (Object.keys(patch).length === 0) return
  saving.value = true
  try {
    hydrate(await updateContact(props.contactId, patch))
    emit('saved')
    toast.success('Contact saved')
  } catch (err) {
    toast.error('Failed to save contact -- ' + getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

async function logInteraction() {
  const content = newNote.content.trim()
  if (!content || logging.value) return
  const body = { content }
  if (newNote.occurred_at) body.occurred_at = newNote.occurred_at
  if (newNote.setsNext) {
    body.next_action_at = newNote.next_action_at || null
    body.next_action = newNote.next_action || null
  }
  logging.value = true
  try {
    const updated = await addContactNote(props.contactId, body)
    // The note may have moved the next touch, so the form is re-seeded from the
    // server rather than left showing what was there before the log.
    hydrate(updated)
    newNote.content = ''
    newNote.occurred_at = ''
    newNote.setsNext = false
    newNote.next_action_at = ''
    newNote.next_action = ''
    emit('saved')
  } catch (err) {
    toast.error('Failed to log the interaction -- ' + getErrorMessage(err))
  } finally {
    logging.value = false
  }
}

function requestClose() {
  if (isDirty.value && !confirm('You have unsaved changes. Close anyway?')) return
  emit('close')
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    requestClose()
    return
  }
  if (event.key === 'Tab') {
    const focusable = Array.from(panelRoot.value?.querySelectorAll(FOCUSABLE) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) { event.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
}

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => {
    visible.value = true
  })
  load()
})
</script>
