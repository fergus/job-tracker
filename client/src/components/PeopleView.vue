<template>
  <div class="max-w-screen-lg mx-auto px-4 py-4">
    <!-- R17: nobody in the list at all. Orienting, not congratulatory. -->
    <div v-if="contacts.length === 0" class="text-center py-20">
      <p class="text-ink-2 font-medium mb-1">No people yet</p>
      <p class="text-sm text-ink-3 max-w-md mx-auto">
        Recruiters, referrers, hiring managers — anyone worth staying in touch
        with. People you owe a reply surface first; everyone else sorts by how
        long it has been.
      </p>
    </div>

    <!-- R2: one scroll, four groups, no filter control. R19: a single column
         at every width — the board's horizontal snap-scroller is for columns
         you compare, and these are groups you read straight down. -->
    <div v-else class="flex flex-col gap-8">
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
          <li v-for="contact in group.contacts" :key="contact.id">
            <button
              type="button"
              @click="$emit('open-contact', contact.id)"
              :aria-label="rowLabel(contact)"
              class="w-full text-left min-h-[44px] py-3 border-b border-line/60 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 transition-colors hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 -mx-2"
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
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { groupContacts, contactedProse } from '../utils/contactGroups.js'
import { followUpProse, followUpTone } from '../utils/followUp.js'

// The People section. Contacts arrive already classified and ordered by the
// server (KTD1), so this never reclassifies a date or re-sorts a list. The
// only thing it computes is which of four buckets each person falls in, and
// it does that in one pass -- sibling computeds each rescanning the same
// array is a documented past defect in this repo.
const props = defineProps({ contacts: { type: Array, default: () => [] } })
defineEmits(['open-contact'])

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
