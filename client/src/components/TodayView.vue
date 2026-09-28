<template>
  <div class="max-w-screen-lg mx-auto px-4 py-4">
    <!-- R5: nothing owed this week. Shown only after a load has actually
         succeeded, so a failed first load never reads as "you're clear". -->
    <div v-if="loaded && items.length === 0" class="text-center py-20">
      <p class="text-ink-2 font-medium mb-1">Nothing owed this week</p>
      <p class="text-sm text-ink-3 max-w-md mx-auto">
        Follow-ups you set on roles and people land here as they come due. The
        pipeline and your people list are one click away.
      </p>
    </div>

    <!-- One scroll, a single column at every width: these are groups you read
         straight down, not columns you compare. -->
    <div v-else-if="items.length > 0" class="flex flex-col gap-8">
      <section v-for="group in groups" :key="group.key">
        <h2
          class="text-sm font-semibold font-condensed text-ink-2 uppercase tracking-wider mb-3 pb-2 border-b border-line"
        >
          {{ group.label }}
        </h2>

        <ul class="flex flex-col">
          <li
            v-for="item in group.items"
            :key="rowKey(item)"
            class="border-b border-line/60 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3"
          >
            <button
              type="button"
              @click="$emit('open', item)"
              :aria-label="rowLabel(item)"
              class="flex-1 min-w-0 text-left min-h-[44px] py-3 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4 transition-colors hover:bg-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm px-2 -mx-2"
            >
              <span class="min-w-0 flex-1 truncate" :title="nameLine(item)">
                <!-- The kind in words, so a person and a role never differ by
                     colour alone. -->
                <span
                  class="inline-block w-12 text-[10px] font-semibold font-condensed uppercase tracking-wider text-ink-3"
                >{{ kindLabel(item) }}</span>
                <span class="text-sm font-medium text-ink">{{ item.title }}</span>
                <span v-if="item.subtitle" class="text-sm text-ink-3">
                  — {{ item.subtitle }}
                </span>
                <span v-if="showUser && item.user_email" class="text-xs text-ink-3">
                  · {{ item.user_email }}
                </span>
              </span>
              <span
                class="min-w-0 shrink-0 sm:max-w-[50%] text-xs sm:text-right truncate"
                :class="followUpTone(item.follow_up_state)"
                :title="owedLine(item)"
              >
                {{ owedLine(item) }}
              </span>
            </button>

            <SnoozeControl
              v-if="!readOnly"
              :subject="item.title"
              :disabled="pendingKey !== null"
              :pending="pendingKey === rowKey(item)"
              @snooze="(date) => $emit('snooze', item, date)"
            />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { groupToday, kindLabel } from '../utils/todayGroups.js'
import { followUpProse, followUpTone } from '../utils/followUp.js'
import SnoozeControl from './SnoozeControl.vue'

// The Today section. Items arrive already filtered, classified and ordered by
// the server, so this never reclassifies a date or re-sorts. Rows open the
// record or the person, or snooze the date; anything that writes history goes
// through the panels.
const props = defineProps({
  items: { type: Array, default: () => [] },
  // A load has succeeded at least once. Until then an empty list means
  // "not known yet", not "nothing owed".
  loaded: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  showUser: { type: Boolean, default: false },
  // `kind-id` of the row whose snooze is in flight, or null.
  pendingKey: { type: String, default: null },
})
defineEmits(['open', 'snooze'])

const groups = computed(() => groupToday(props.items))

function rowKey(item) {
  return `${item.kind}-${item.id}`
}

// A step with no wording still says what it is: a follow-up.
function owedLine(item) {
  return followUpProse(
    item.follow_up_state,
    item.follow_up_days,
    item.next_action || 'Follow up',
  )
}

function nameLine(item) {
  return item.subtitle ? `${item.title} — ${item.subtitle}` : item.title
}

function rowLabel(item) {
  return [kindLabel(item), nameLine(item), owedLine(item)].join('. ')
}
</script>
