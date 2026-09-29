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
              class="flex-1 min-w-0 text-left min-h-[44px] py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4 transition-colors hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 -mx-2"
            >
              <!-- One line, ellipsed. A recruiter's full name and employer can
                   each run past the row on their own, and letting them wrap
                   turned a scannable list into a stack of paragraphs. -->
              <span class="min-w-0 flex-1 truncate" :title="nameLine(contact)">
                <span class="text-sm font-medium text-ink">{{ contact.name }}</span>
                <span v-if="contact.employer" class="text-sm text-ink-3">
                  — {{ contact.employer }}
                </span>
              </span>
              <!-- Bounded so a long commitment cannot crowd out the name it
                   belongs to; the full wording is a hover away and in the
                   drawer. -->
              <span class="min-w-0 shrink-0 sm:max-w-[45%] text-xs sm:text-right">
                <span
                  v-if="contact.follow_up_state"
                  :class="followUpTone(contact.follow_up_state)"
                  class="block truncate"
                  :title="followUpProse(contact.follow_up_state, contact.follow_up_days, contact.next_action)"
                >
                  {{ followUpProse(contact.follow_up_state, contact.follow_up_days, contact.next_action) }}
                </span>
                <span class="block truncate text-ink-3">
                  {{ contactedProse(contact.days_since_contact) }}
                </span>
              </span>
            </button>

            <!-- R12: the only action on a row. Logging what actually happened
                 stays in the drawer, so the interaction history does not fill
                 up with one-tap stubs. R21: in all-users mode there is no
                 write to make, so the control is absent rather than failing. -->
            <SnoozeControl
              v-if="!readOnly && contact.follow_up_state"
              :subject="contact.name"
              :disabled="pendingId !== null"
              :pending="pendingId === contact.id"
              @snooze="(date) => $emit('snooze', contact.id, date)"
            />
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
import SnoozeControl from './SnoozeControl.vue'

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
const emit = defineEmits(['open-contact', 'snooze', 'create', 'day-changed'])

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

const groups = computed(() => groupContacts(props.contacts))

// KTD7 says classification stays server-derived and the client refetches
// rather than recomputes. The interval is only a day-rollover detector: when
// the calendar date changes under a session left open overnight, the whole
// list is refetched so group membership moves with it. Nothing here derives a
// date itself -- rendering reads the server's own counts.
let dayTimer = null
let currentDay = localCalendarDate()

function localCalendarDate() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10)
}

onMounted(() => {
  dayTimer = setInterval(() => {
    const now = localCalendarDate()
    if (now === currentDay) return
    currentDay = now
    emit('day-changed')
  }, 60000)
})

onUnmounted(() => {
  if (dayTimer !== null) clearInterval(dayTimer)
})

// R8 and R11: a row is a person and where they work. What roles they are
// attached to belongs in the drawer, not in a list you scan.
function nameLine(contact) {
  return contact.employer ? `${contact.name} — ${contact.employer}` : contact.name
}

function rowLabel(contact) {
  const who = contact.employer ? `${contact.name}, ${contact.employer}` : contact.name
  const owed = followUpProse(
    contact.follow_up_state,
    contact.follow_up_days,
    contact.next_action,
  )
  return [who, owed, contactedProse(contact.days_since_contact)]
    .filter(Boolean)
    .join('. ')
}
</script>
