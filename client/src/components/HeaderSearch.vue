<template>
  <div class="contents">
    <!-- Below sm there is no room for a field in the header, so a button opens
         the same search as a full-width box. -->
    <button
      v-if="!floatingOpen"
      type="button"
      :disabled="disabled"
      class="sm:hidden size-11 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
      aria-label="Search people and roles"
      @click="openFloating"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke-width="2" />
        <path stroke-linecap="round" stroke-width="2" d="M20 20l-3.5-3.5" />
      </svg>
    </button>

    <!-- One input and one result list serve both shapes. Inline it sits in the
         header; floating it moves to body so it shows above an open record
         panel, which covers the header. -->
    <Teleport to="body" :disabled="!floatingOpen">
      <div
        v-if="floatingOpen"
        class="fixed inset-0 z-[58]"
        data-testid="search-backdrop"
        @click="dismiss({ restoreFocus: true })"
      />
      <div
        ref="root"
        :role="floatingOpen ? 'dialog' : undefined"
        :aria-modal="floatingOpen ? 'true' : undefined"
        :aria-label="floatingOpen ? 'Search' : undefined"
        :class="
          floatingOpen
            ? 'fixed z-[58] top-0 inset-x-0 p-3 bg-panel border-b border-line shadow-lg sm:top-16 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[32rem] sm:max-w-[calc(100vw-2rem)] sm:rounded-lg sm:border'
            : 'hidden sm:block relative'
        "
        @focusout="onFocusOut"
        @keydown="onKeydown"
      >
        <div class="flex items-center gap-2">
          <input
            ref="input"
            v-model="query"
            type="text"
            enterkeyhint="search"
            role="combobox"
            autocomplete="off"
            spellcheck="false"
            placeholder="Search people and roles"
            aria-label="Search people and roles"
            aria-autocomplete="list"
            :aria-expanded="showResults ? 'true' : 'false'"
            :aria-controls="listId"
            :aria-activedescendant="activeId"
            :disabled="disabled"
            :class="[
              'text-sm border border-line bg-raised rounded-lg px-3 py-2 min-h-[44px] text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent',
              floatingOpen ? 'flex-1 min-w-0' : 'w-44 md:w-56 lg:w-72',
            ]"
            @focus="activate"
          />
          <button
            v-if="floatingOpen"
            type="button"
            class="size-11 shrink-0 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
            aria-label="Close search"
            @click="dismiss({ restoreFocus: true })"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div
          v-if="showResults"
          :id="listId"
          role="listbox"
          aria-label="Search results"
          :class="[
            'max-h-[70vh] overflow-y-auto py-1',
            floatingOpen
              ? 'mt-2'
              : 'absolute right-0 top-full mt-1 w-[26rem] max-w-[calc(100vw-2rem)] z-40 bg-panel border border-line rounded-lg shadow-lg',
          ]"
        >
          <template v-if="showPeopleGroup">
            <div class="px-3 pt-2 pb-1 text-xs font-medium text-ink-3" role="presentation">People</div>
            <div
              v-for="(item, i) in results.people.items"
              :id="optionId(i)"
              :key="'p' + item.id"
              role="option"
              :aria-selected="i === active ? 'true' : 'false'"
              class="px-3 py-2 min-h-[44px] flex flex-col justify-center cursor-pointer"
              :class="i === active ? 'bg-sunken' : 'hover:bg-sunken'"
              @mousedown.prevent
              @mousemove="active = i"
              @click="choose(item)"
            >
              <span class="text-sm text-ink truncate">{{ item.name }}</span>
              <span v-if="item.detail" class="text-xs text-ink-3 truncate">{{ item.detail }}</span>
            </div>
            <div v-if="results.people.hidden" class="px-3 py-1 text-xs text-ink-3">
              {{ results.people.hidden }} more, keep typing
            </div>
            <div v-if="peopleWaiting" class="px-3 py-2 text-sm text-ink-3">Loading people...</div>
            <div v-else-if="peopleUnavailable" class="px-3 py-2 text-sm text-ink-3 flex items-center gap-3">
              <span>Could not load people</span>
              <button
                type="button"
                class="text-sm font-medium text-accent hover:text-accent-hover min-h-[44px]"
                @mousedown.prevent
                @click="$emit('open-search')"
              >Retry</button>
            </div>
          </template>

          <template v-if="results.roles.items.length">
            <div class="px-3 pt-2 pb-1 text-xs font-medium text-ink-3" role="presentation">Roles</div>
            <div
              v-for="(item, j) in results.roles.items"
              :id="optionId(peopleCount + j)"
              :key="'r' + item.id"
              role="option"
              :aria-selected="peopleCount + j === active ? 'true' : 'false'"
              class="px-3 py-2 min-h-[44px] flex flex-col justify-center cursor-pointer"
              :class="peopleCount + j === active ? 'bg-sunken' : 'hover:bg-sunken'"
              @mousedown.prevent
              @mousemove="active = peopleCount + j"
              @click="choose(item)"
            >
              <span class="text-sm truncate" :class="item.closed ? 'text-ink-3' : 'text-ink'">
                {{ item.company }}
                <span v-if="item.lead" class="ml-1 text-xs text-ink-3">lead</span>
                <span v-if="item.closed" class="ml-1 text-xs text-ink-3">closed</span>
              </span>
              <span v-if="item.title" class="text-xs text-ink-3 truncate">{{ item.title }}</span>
            </div>
            <div v-if="results.roles.hidden" class="px-3 py-1 text-xs text-ink-3">
              {{ results.roles.hidden }} more, keep typing
            </div>
          </template>

          <div v-if="noMatches" class="px-3 py-2 text-sm text-ink-3">No matches</div>
        </div>

        <div class="sr-only" aria-live="polite">{{ status }}</div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { searchRecords } from '../utils/search.js'

const props = defineProps({
  applications: { type: Array, default: () => [] },
  contacts: { type: Array, default: () => [] },
  peopleLoading: { type: Boolean, default: false },
  peopleFailed: { type: Boolean, default: false },
  // A record panel covers the header, so search has to float above it.
  panelOpen: { type: Boolean, default: false },
  // Held while a board card is being dragged: nothing may open over the board.
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['open-search', 'select'])

const listId = 'header-search-results'
const optionId = (i) => `header-search-option-${i}`

const root = ref(null)
const input = ref(null)
const query = ref('')
const active = ref(0)
const inlineActive = ref(false)
const floatingOpen = ref(false)
let returnFocusTo = null

// The sm breakpoint (40rem) decides whether the header has room for a field.
const wideQuery = window.matchMedia('(min-width: 40rem)')
const wide = ref(wideQuery.matches)
const onWideChange = (e) => { wide.value = e.matches }
onMounted(() => wideQuery.addEventListener('change', onWideChange))
onUnmounted(() => wideQuery.removeEventListener('change', onWideChange))

const results = computed(() => searchRecords(query.value, props.applications, props.contacts))
const peopleCount = computed(() => results.value.people.items.length)
const optionCount = computed(() => peopleCount.value + results.value.roles.items.length)
const hasQuery = computed(() => query.value.trim() !== '')
const showResults = computed(() => hasQuery.value && (floatingOpen.value || inlineActive.value))

// With no people held yet, an empty People group means "not loaded", not
// "nobody matches", and must not read as the person not existing.
const peopleWaiting = computed(() => props.peopleLoading && props.contacts.length === 0)
const peopleUnavailable = computed(
  () => !props.peopleLoading && props.peopleFailed && props.contacts.length === 0,
)
const showPeopleGroup = computed(
  () => peopleCount.value > 0 || peopleWaiting.value || peopleUnavailable.value,
)
const noMatches = computed(
  () => optionCount.value === 0 && !peopleWaiting.value && !peopleUnavailable.value,
)

const activeId = computed(() =>
  showResults.value && optionCount.value > 0 ? optionId(active.value) : undefined,
)

const status = computed(() => {
  if (!showResults.value) return ''
  if (peopleWaiting.value) return 'Loading people'
  if (noMatches.value) return 'No matches'
  const n = optionCount.value
  return `${n} result${n === 1 ? '' : 's'}`
})

// The first result is highlighted after every keystroke, so Enter opens the
// best match without reaching for the arrow keys.
watch(query, () => { active.value = 0 })
watch(optionCount, (n) => { if (active.value >= n) active.value = 0 })

function activate() {
  inlineActive.value = true
  emit('open-search')
}

async function openFloating() {
  if (!floatingOpen.value) {
    returnFocusTo = document.activeElement
    floatingOpen.value = true
    emit('open-search')
  }
  await nextTick()
  input.value?.focus()
}

/** Ctrl/Cmd+K: focus the header field, or float the box when it is hidden. */
function open() {
  if (props.disabled) return
  if (!wide.value || props.panelOpen) return openFloating()
  input.value?.focus()
  input.value?.select()
}

function dismiss({ restoreFocus = false } = {}) {
  const wasFloating = floatingOpen.value
  query.value = ''
  inlineActive.value = false
  floatingOpen.value = false
  if (!wasFloating) input.value?.blur()
  if (restoreFocus && wasFloating && returnFocusTo?.isConnected) returnFocusTo.focus()
  returnFocusTo = null
}

function choose(item) {
  emit('select', item)
}

function onFocusOut(event) {
  if (floatingOpen.value) return
  if (root.value?.contains(event.relatedTarget)) return
  inlineActive.value = false
  query.value = ''
}

function onKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    dismiss({ restoreFocus: true })
    return
  }
  const n = optionCount.value
  if (!showResults.value || n === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % n
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + n) % n
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const { people, roles } = results.value
    choose(active.value < people.items.length
      ? people.items[active.value]
      : roles.items[active.value - people.items.length])
  }
}

defineExpose({ open, dismiss })
</script>
