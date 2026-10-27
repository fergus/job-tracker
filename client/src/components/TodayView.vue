<template>
  <div class="max-w-screen-lg mx-auto px-4 py-4">
    <!-- R5: nothing owed this week. Shown only after a load has actually
         succeeded, so a failed first load never reads as "you're clear". -->
    <div v-if="loaded && items.length === 0" class="text-center py-20">
      <p class="font-condensed text-3xl font-semibold text-ink mb-2">Nothing owed this week</p>
      <p class="text-sm text-ink-3 max-w-md mx-auto">
        Follow-ups you set on roles and people land here as they come due. The
        pipeline and your people list are one click away.
      </p>
    </div>

    <!-- One scroll, a single column at every width: these are groups you read
         straight down, not columns you compare. -->
    <div v-else-if="items.length > 0" class="flex flex-col gap-10">
      <section v-for="group in groups" :key="group.key">
        <GroupHeader :label="group.label" :count="group.items.length" :tone="group.key" />

        <ul class="flex flex-col gap-2">
          <li
            v-for="item in group.items"
            :key="rowKey(item)"
            :class="[
              'group min-w-0 bg-panel rounded-lg border flex flex-col sm:flex-row sm:items-center sm:pr-2 transition-[border-color,box-shadow] duration-200 ease-out-quart hover:shadow-md',
              group.key === 'overdue' ? 'border-danger/40 hover:border-danger' : 'border-line hover:border-line-2',
            ]"
          >
            <button
              type="button"
              @click="$emit('open', item)"
              :aria-label="rowLabel(item)"
              class="flex-1 min-w-0 text-left min-h-[56px] px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-6 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span class="min-w-0 flex-1" :title="nameLine(item)">
                <!-- The kind in words, so a person and a role never differ by
                     colour alone. -->
                <span
                  class="inline-block mb-1 px-1.5 py-0.5 rounded text-[11px] leading-none font-semibold font-condensed uppercase tracking-wider"
                  :class="item.kind === 'contact' ? 'bg-accent-muted text-accent' : 'bg-sunken text-ink-2'"
                >{{ kindLabel(item) }}</span>
                <span class="block truncate font-condensed font-semibold text-lg leading-tight text-ink">{{ item.title }}</span>
                <span v-if="item.subtitle" class="block truncate text-sm text-ink-2">{{ item.subtitle }}</span>
                <span v-if="item.connection_count" class="block truncate text-xs font-medium text-accent">
                  You know {{ item.connection_count }} {{ item.connection_count === 1 ? 'person' : 'people' }} here
                </span>
                <span v-if="showUser && item.user_email" class="block truncate text-xs text-ink-3">{{ item.user_email }}</span>
              </span>
              <span
                class="min-w-0 shrink-0 sm:max-w-[45%] text-sm sm:text-right sm:line-clamp-2"
                :class="[followUpTone(item.follow_up_state), item.follow_up_state === 'upcoming' ? '' : 'font-semibold']"
                :title="owedLine(item)"
              >
                {{ owedLine(item) }}
              </span>
            </button>

            <!-- Where a pointer can hover, the snooze waits until the row is
                 reached; touch and keyboard always see it. -->
            <SnoozeControl
              v-if="!readOnly"
              class="px-3 sm:px-0 [@media(hover:hover)]:sm:opacity-0 [@media(hover:hover)]:sm:group-hover:opacity-100 [@media(hover:hover)]:sm:group-focus-within:opacity-100 transition-opacity duration-150"
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
import { groupToday, kindLabel, todayItemKey as rowKey } from '../utils/todayGroups.js'
import { followUpProse, followUpTone } from '../utils/followUp.js'
import GroupHeader from './GroupHeader.vue'
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
  const know = item.connection_count
    ? `You know ${item.connection_count} ${item.connection_count === 1 ? 'person' : 'people'} here`
    : ''
  return [kindLabel(item), nameLine(item), know, owedLine(item)].filter(Boolean).join('. ')
}
</script>
