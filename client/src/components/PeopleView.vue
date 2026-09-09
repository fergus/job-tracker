<template>
  <div class="max-w-screen-lg mx-auto px-4 py-4">
    <!-- R15: a persistent way in, so someone met at a meetup can be recorded
         without inventing a role to attach them to. -->
    <div v-if="!readOnly" class="flex justify-end mb-4">
      <button
        type="button"
        @click="toggleCreate"
        class="min-h-[44px] px-3 text-xs font-medium text-ink-3 hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
      >
        {{ creating ? 'Cancel' : '+ Add person' }}
      </button>
    </div>

    <form
      v-if="creating"
      @submit.prevent="submitCreate"
      class="mb-8 p-4 bg-panel border border-line rounded-lg flex flex-col gap-3"
    >
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="people-new-name" class="block text-xs text-ink-3 mb-1">Name</label>
          <input
            id="people-new-name"
            ref="nameInput"
            v-model="form.name"
            type="text"
            maxlength="200"
            class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label for="people-new-employer" class="block text-xs text-ink-3 mb-1">Employer</label>
          <input
            id="people-new-employer"
            v-model="form.employer"
            type="text"
            maxlength="200"
            class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      <!-- Offering the next action here is what places the person in a dated
           group. Without one they sort to the bottom of No commitment, which
           is correct but easy to read as the record not having landed. -->
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="people-new-next-at" class="block text-xs text-ink-3 mb-1">
            Next action date <span class="text-ink-3/70">&nbsp;(optional)</span>
          </label>
          <input
            id="people-new-next-at"
            v-model="form.next_action_at"
            type="date"
            class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <div>
          <label for="people-new-next" class="block text-xs text-ink-3 mb-1">
            Next action <span class="text-ink-3/70">&nbsp;(optional)</span>
          </label>
          <input
            id="people-new-next"
            v-model="form.next_action"
            type="text"
            maxlength="500"
            placeholder="e.g. send the writing sample"
            class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
      </div>

      <div class="flex justify-end">
        <button
          type="submit"
          :disabled="!form.name.trim() || savingNew"
          class="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ savingNew ? 'Adding...' : 'Add person' }}
        </button>
      </div>
    </form>

    <!-- R17: nobody in the list at all. Orienting, not congratulatory. -->
    <div v-if="contacts.length === 0 && !creating" class="text-center py-20">
      <p class="text-ink-2 font-medium mb-1">No people yet</p>
      <p class="text-sm text-ink-3 max-w-md mx-auto mb-4">
        Recruiters, referrers, hiring managers — anyone worth staying in touch
        with. People you owe a reply surface first; everyone else sorts by how
        long it has been.
      </p>
      <button
        v-if="!readOnly"
        type="button"
        @click="toggleCreate"
        class="text-sm text-accent hover:underline transition-colors min-h-[44px] px-3"
      >
        Add your first person
      </button>
    </div>

    <!-- R2: one scroll, four groups, no filter control. R19: a single column
         at every width — the board's horizontal snap-scroller is for columns
         you compare, and these are groups you read straight down. -->
    <div v-else-if="contacts.length > 0" class="flex flex-col gap-8">
      <section v-for="group in groups" :key="group.key">
        <h2
          class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider mb-3 pb-2 border-b border-line"
        >
          {{ group.label }}
        </h2>

        <p v-if="group.contacts.length === 0" class="text-sm text-ink-3 py-2">
          Everyone in your list has a next action against them.
        </p>

        <ul v-else class="flex flex-col">
          <li
            v-for="contact in group.contacts"
            :key="contact.id"
            class="border-b border-line/60 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
          >
            <button
              type="button"
              @click="$emit('open-contact', contact.id)"
              :aria-label="rowLabel(contact)"
              class="flex-1 min-w-0 text-left min-h-[44px] py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 transition-colors hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 -mx-2"
            >
              <span class="min-w-0">
                <span class="text-sm font-medium text-ink">{{ contact.name }}</span>
                <span v-if="contact.employer" class="text-sm text-ink-3">
                  — {{ contact.employer }}
                </span>
              </span>
              <span class="shrink-0 text-xs sm:text-right">
                <span
                  v-if="contact.follow_up_state"
                  :class="followUpTone(contact.follow_up_state)"
                  class="block"
                >
                  {{ followUpProse(contact.follow_up_state, contact.follow_up_days, contact.next_action) }}
                </span>
                <span class="block text-ink-3">
                  {{ contactedProse(contact.last_contacted_at, today) }}
                </span>
              </span>
            </button>

            <!-- R12: the only action on a row. Logging what actually happened
                 stays in the drawer, so the interaction history does not fill
                 up with one-tap stubs. R21: in all-users mode there is no
                 write to make, so the control is absent rather than failing. -->
            <div
              v-if="!readOnly && contact.follow_up_state"
              class="shrink-0 flex items-center gap-1 pb-2 sm:pb-0"
            >
              <button
                v-for="offset in SNOOZE_OFFSETS"
                :key="offset.days"
                type="button"
                :disabled="pendingId === contact.id"
                @click="snooze(contact, offset.days)"
                class="min-h-[44px] px-2 text-xs text-ink-3 hover:text-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
                :aria-label="`Snooze ${contact.name} ${offset.label}`"
              >
                {{ offset.label }}
              </button>
              <!-- The native date input, sized to a glyph: shown at its own
                   width it prints mm/dd/yyyy on every dated row, which is
                   clutter in a list you scan. The input still owns the click,
                   the focus and the accessible name. -->
              <span
                class="relative min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-ink-3 hover:text-ink transition-colors rounded-sm focus-within:ring-2 focus-within:ring-accent"
                :class="pendingId === contact.id ? 'opacity-40' : ''"
              >
                <svg
                  class="w-4 h-4 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"
                  />
                </svg>
                <input
                  type="date"
                  :disabled="pendingId === contact.id"
                  :value="''"
                  @change="snoozeTo(contact, $event)"
                  :aria-label="`Pick a new next-action date for ${contact.name}`"
                  class="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { groupContacts, contactedProse } from '../utils/contactGroups.js'
import { followUpProse, followUpTone } from '../utils/followUp.js'

// The People section. Contacts arrive already classified and ordered by the
// server (KTD1), so this never reclassifies a date or re-sorts a list. The
// only thing it computes is which of four buckets each person falls in, and
// it does that in one pass -- sibling computeds each rescanning the same
// array is a documented past defect in this repo.
const props = defineProps({
  contacts: { type: Array, default: () => [] },
  readOnly: { type: Boolean, default: false },
  pendingId: { type: [Number, String], default: null },
})
const emit = defineEmits(['open-contact', 'snooze', 'create'])

const creating = ref(false)
const savingNew = ref(false)
const nameInput = ref(null)
const form = reactive({ name: '', employer: '', next_action_at: '', next_action: '' })

function toggleCreate() {
  creating.value = !creating.value
  if (!creating.value) return
  for (const field of Object.keys(form)) form[field] = ''
  nextTick(() => nameInput.value?.focus())
}

// A blank name is rejected here rather than by the server: the request would
// only come back 400, and the form already knows. The shell owns the write and
// reports back, so a failed create leaves the form open with its input intact
// rather than discarding what the user typed.
function submitCreate() {
  const name = form.name.trim()
  if (!name || savingNew.value) return
  savingNew.value = true
  emit(
    'create',
    {
      name,
      employer: form.employer.trim() || null,
      next_action_at: form.next_action_at || null,
      next_action: form.next_action.trim() || null,
    },
    (created) => {
      savingNew.value = false
      if (created) creating.value = false
    },
  )
}

// Relative offsets cover the reason a commitment slips -- "not today, but
// soon" -- and the date input covers the case where the user knows exactly
// when. Both write the date and nothing else.
const SNOOZE_OFFSETS = [
  { days: 1, label: '+1d' },
  { days: 7, label: '+1w' },
]

function snooze(contact, days) {
  if (props.pendingId !== null) return
  emit('snooze', contact.id, shiftDate(today.value, days))
}

function snoozeTo(contact, event) {
  const picked = event.target.value
  event.target.value = ''
  if (!picked || props.pendingId !== null) return
  emit('snooze', contact.id, picked)
}

function shiftDate(from, days) {
  const d = new Date(`${from}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const groups = computed(() => groupContacts(props.contacts))

// KTD7. Group membership stays server-derived, but the rendered elapsed text
// would otherwise still read "3 days ago" after a session sat open past
// midnight. A minute-resolution tick is enough for a day boundary and costs
// nothing; only the text moves.
const today = ref(localCalendarDate())
let dayTimer = null

function localCalendarDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

onMounted(() => {
  dayTimer = setInterval(() => {
    const now = localCalendarDate()
    if (now !== today.value) today.value = now
  }, 60000)
})

onUnmounted(() => {
  if (dayTimer !== null) clearInterval(dayTimer)
})

// R8 and R11: a row is a person and where they work. What roles they are
// attached to belongs in the drawer, not in a list you scan.
function rowLabel(contact) {
  const who = contact.employer ? `${contact.name}, ${contact.employer}` : contact.name
  const owed = followUpProse(
    contact.follow_up_state,
    contact.follow_up_days,
    contact.next_action,
  )
  return [who, owed, contactedProse(contact.last_contacted_at, today.value)]
    .filter(Boolean)
    .join('. ')
}
</script>
