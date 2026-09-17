<template>
    <div class="min-h-screen flex flex-col">
        <!-- Skip link -->
        <a
            href="#main-content"
            class="absolute -top-10 left-4 z-[60] bg-accent text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-all focus:top-4"
        >
            Skip to main content
        </a>

        <!-- Top bar -->
        <header class="bg-panel shadow-xs border-b border-line">
            <div
                class="max-w-screen-2xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-y-1"
            >
                <div class="flex items-center gap-2.5 order-1">
                    <LogoBuild :trigger="logoTrigger" />
                    <h1
                        class="text-xl font-bold font-condensed tracking-wide text-ink"
                    >
                        Job Tracker
                    </h1>
                    <a
                        :href="`https://github.com/fergus/job-tracker/releases/tag/v${version}`"
                        target="_blank"
                        class="text-xs text-ink-3 hover:text-ink-2 hover:underline"
                        >v{{ version }}</a
                    >
                    <FreshnessSlot
                        :display="freshnessDisplay"
                        :absolute="freshnessAbsolute"
                    />
                </div>
                <SectionNav
                    :section="section"
                    @set-section="setSection"
                    class="order-3 w-full sm:order-2 sm:w-auto sm:ml-4 sm:mr-auto"
                />
                <div class="flex items-center gap-3 order-2 sm:order-3">
                    <!-- Show/Hide Closed toggle -->
                    <button
                        v-show="closedCount > 0"
                        :aria-label="
                            showClosed
                                ? 'Hide closed applications'
                                : `Show ${closedCount} closed applications`
                        "
                        :aria-pressed="showClosed"
                        :disabled="dragActive"
                        @click="toggleShowClosed"
                        class="hidden sm:flex items-center px-3 py-1.5 min-h-[44px] text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        :class="
                            showClosed
                                ? 'bg-panel border border-line text-ink shadow-xs'
                                : 'bg-sunken text-ink-3 hover:text-ink-2'
                        "
                    >
                        {{
                            showClosed ? "Hide closed" : `${closedCount} closed`
                        }}
                    </button>

                    <!-- Always visible: Add button + settings -->
                    <button
                        @click="openPanel()"
                        class="bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 min-h-[44px] rounded-lg text-sm font-medium transition-colors"
                    >
                        + Add Application
                    </button>
                    <button
                        ref="settingsBtn"
                        @click="showSettings = true"
                        class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:bg-sunken transition-colors"
                        aria-label="Open settings"
                    >
                        <svg
                            class="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </header>

        <!-- Connection escalation bar (KTD7: outside the view so it survives
             view switches) -->
        <FreshnessBar
            :tier="freshnessTier"
            :display="freshnessDisplay"
            :absolute="freshnessAbsolute"
            @retry="retryLiveUpdates"
        />

        <!-- Tier announcements (KTD8): a summary only, so the ticking
             duration is never announced (R14). Terminal is assertive because
             it is the only tier the user must act on (R14a). -->
        <div class="sr-only" role="status" aria-live="polite">
            {{ politeAnnouncement }}
        </div>
        <div class="sr-only" role="alert">{{ assertiveAnnouncement }}</div>

        <!-- Main content -->
        <main id="main-content" class="flex-1 px-4 py-4">
            <Transition name="view" mode="out-in">
                <KanbanBoard
                    v-if="section === 'applications' && view === 'kanban'"
                    key="kanban"
                    :applications="applications"
                    :showUser="showAllUsers"
                    :showClosed="showClosed"
                    :statusVersion="statusVersion"
                    @status-change="handleStatusChange"
                    @close-record="handleCloseRecord"
                    @select="openPanel"
                    @toggle-show-closed="toggleShowClosed"
                    @drag-active="dragActive = $event"
                    @set-view="view = $event"
                />
                <TimelineView
                    v-else-if="section === 'applications'"
                    key="timeline"
                    :applications="displayApplications"
                    :showClosed="showClosed"
                    :closedCount="closedCount"
                    @open-detail="openPanel"
                    @toggle-show-closed="toggleShowClosed"
                    @set-view="view = $event"
                />
                <PeopleView
                    v-else
                    key="people"
                    :contacts="contacts"
                    :readOnly="showAllUsers"
                    :pendingId="snoozingContactId"
                    @open-contact="openContact"
                    @snooze="handleSnooze"
                    @create="handleCreateContact"
                    @day-changed="refreshContacts"
                />
            </Transition>
        </main>

        <!-- Application panel -->
        <ApplicationPanel
            v-if="showPanel"
            :panelApp="panelApp"
            :totalApplications="pipelineCount"
            @close="closePanel"
            @saved="handlePanelSaved"
            @panel-app-updated="panelApp = $event"
            @open-contact="openContact"
        />
        <ContactPanel
            v-if="contactId"
            :key="contactId"
            :contactId="contactId"
            :readOnly="showAllUsers"
            @close="contactId = null"
            @saved="handleContactSaved"
        />
        <SettingsPanel
            v-if="showSettings"
            :show="showSettings"
            :currentUser="currentUser"
            :showAllUsers="showAllUsers"
            @close="closeSettings"
            @set-show-all="setShowAll"
        />
        <ToastContainer />
    </div>
</template>

<script setup>
import {
    ref,
    shallowRef,
    computed,
    onMounted,
    onUnmounted,
    watch,
    nextTick,
} from "vue";
import {
    fetchMe,
    fetchApplications,
    fetchApplication,
    fetchContacts,
    createContact,
    updateContact,
    updateStatus,
    updateApplication,
} from "./api";
import { isTerminal } from "./utils/timeline.js";
import { useToast } from "./composables/useToast";
import { storageGetBool, storageSet } from "./utils/storage.js";
import { getErrorMessage } from "./utils/error.js";
import { useLiveUpdates } from "./composables/useLiveUpdates.js";
import { useDayRollover } from "./composables/useDayRollover.js";
import {
    TIER_PENDING,
    TIER_LIVE,
    TIER_DEGRADED,
    TIER_STALE,
    TIER_TERMINAL,
    JUST_NOW_MS,
} from "./utils/freshness.js";
import {
    createRefetchQueue,
    requestRefetch,
    flushRefetch,
    hasContentChanged,
    shouldHoldJustNow,
} from "./utils/refetchQueue.js";
import LogoBuild from "./components/LogoBuild.vue";
import FreshnessSlot from "./components/FreshnessSlot.vue";
import FreshnessBar from "./components/FreshnessBar.vue";
import { defineAsyncComponent } from 'vue'
import KanbanBoard from "./components/KanbanBoard.vue";
import SectionNav from "./components/SectionNav.vue";
import PeopleView from "./components/PeopleView.vue";
import TimelineView from "./components/TimelineView.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import ToastContainer from "./components/ToastContainer.vue";

const ApplicationPanel = defineAsyncComponent(() =>
    import("./components/ApplicationPanel.vue")
);

const ContactPanel = defineAsyncComponent(() =>
    import("./components/ContactPanel.vue")
);

const toast = useToast();

const version = __APP_VERSION__;

const COMPACT_KEY = "jobtracker_compact_header";
const SHOW_CLOSED_KEY = "jobtracker_show_closed";



// Two tiers: the section is which entity you are looking at, the view is
// which lens the Applications section is under. People has no lens.
const section = ref("applications");
const view = ref("kanban");
const applications = ref([]);
const contacts = ref([]);
const panelApp = ref(null);
const showPanel = ref(false);
const currentUser = ref(null);
const showAllUsers = ref(false);
const showSettings = ref(false);
const contactId = ref(null);
const compactHeader = ref(false);
const logoTrigger = ref(0);
const statusVersion = ref(0);
const dragActive = ref(false);
const settingsBtn = ref(null);

const showClosed = ref(storageGetBool(SHOW_CLOSED_KEY, true));

const displayApplications = computed(() => {
    if (showClosed.value) return applications.value;
    return applications.value.filter((a) => !isTerminal(a));
});

const closedCount = computed(() => {
    let count = 0;
    for (const a of applications.value) {
        if (isTerminal(a)) count++;
    }
    return count;
});

// Leads are roles identified but never applied to. They are still records, but
// counting them as pipeline is what made every conversion rate wrong.
const pipelineCount = computed(
    () => applications.value.filter((a) => a.record_type !== "lead").length,
);

function toggleShowClosed() {
    if (dragActive.value) return;
    showClosed.value = !showClosed.value;
    storageSet(SHOW_CLOSED_KEY, String(showClosed.value));
}

function closeSettings() {
    showSettings.value = false;
    nextTick(() => {
        settingsBtn.value?.focus();
    });
}

watch(showClosed, (visible) => {
    if (
        !visible &&
        panelApp.value &&
        isTerminal(panelApp.value)
    ) {
        showPanel.value = false;
    }
});

// One watcher owns the body-scroll style. The contact drawer can now be
// opened without an application panel behind it, and two watchers writing the
// same property would race: closing the panel while the drawer is still open
// would unlock the page underneath it.
watch(
    [showPanel, contactId],
    ([panel, contact]) => {
        const lock = (panel || contact !== null) && window.innerWidth < 768;
        document.body.style.overflow = lock ? "hidden" : "";
    },
);

function toggleCompact() {
    compactHeader.value = !compactHeader.value;
    storageSet(COMPACT_KEY, String(compactHeader.value));
}

async function loadApplications() {
    applications.value = await fetchApplications(null, showAllUsers.value);
}

// The contact list is server-ordered (KTD1), so it is always replaced whole
// rather than patched in place -- a spliced row cannot reposition itself.
//
// Six triggers can call this, so it carries the same discipline the
// applications refetch already has: a token so a slow earlier response cannot
// overwrite a newer one, and a scope check so a response for the wrong set of
// users is dropped rather than rendered. It reports success instead of
// swallowing the error, because a caller that just wrote something needs to
// tell "the write failed" from "the write landed but the list is stale".
let contactsLoadSeq = 0;

async function loadContacts() {
    const seq = ++contactsLoadSeq;
    const scope = showAllUsers.value;
    try {
        const next = await fetchContacts(scope);
        // A newer load, or a scope toggle mid-flight, owns the list now.
        if (seq !== contactsLoadSeq || scope !== showAllUsers.value) return true;
        contacts.value = next;
        return true;
    } catch {
        return false;
    }
}

// The refresh triggers with no write of their own behind them.
async function refreshContacts() {
    if (!(await loadContacts())) {
        toast.error("Error loading contacts — the list may be out of date");
    }
}

// R23. The contact list is not on the change event stream (KTD8), so its
// freshness comes from refetching at the moments the user could have missed
// something: arriving at the section, returning to the tab, and a stream
// reconnect that proves the client was disconnected.
const SECTION_LABELS = { applications: "Applications", people: "People" };
const sectionAnnouncement = ref("");

let announcementTimer = null;

function setSection(next) {
    if (section.value === next) return;
    section.value = next;
    // Cleared once read: the region is shared with the freshness tiers, so a
    // message left standing gets re-announced when a tier later clears.
    sectionAnnouncement.value = `${SECTION_LABELS[next]} section`;
    if (announcementTimer !== null) clearTimeout(announcementTimer);
    announcementTimer = setTimeout(() => {
        sectionAnnouncement.value = "";
        announcementTimer = null;
    }, 1000);
    if (next === "people") refreshContacts();
}

// KTD3: the update endpoint, not the notes endpoint -- logging a note would
// advance last_contacted_at, and rescheduling a commitment is not contact.
// KTD4: the list is refetched rather than the row spliced, because ordering is
// the server's and a moved row cannot reposition itself. R24: nothing moves
// optimistically, and a row already in flight cannot be resubmitted.
const snoozingContactId = ref(null);

async function handleSnooze(id, date) {
    if (snoozingContactId.value !== null) return;
    snoozingContactId.value = id;
    let written = false;
    try {
        await updateContact(id, { next_action_at: date });
        written = true;
    } catch (err) {
        toast.error("Failed to reschedule — " + getErrorMessage(err));
    } finally {
        snoozingContactId.value = null;
    }
    if (!written) return;
    // The commitment moved. A failure from here is a stale list, not a failed
    // reschedule, and saying otherwise sends the user to redo a change that
    // already applied.
    if (!(await loadContacts())) {
        toast.error("Rescheduled, but the list did not refresh — reload to see it in place");
    }
}

// R16: a contact created here carries no application link -- that is the whole
// point of the affordance. Nothing scrolls to or highlights the new row; the
// next action it was given is what places it.
async function handleCreateContact(data, done) {
    try {
        await createContact(data);
    } catch (err) {
        toast.error("Failed to add person — " + getErrorMessage(err));
        done(false);
        return;
    }
    // The person exists now, so the form closes either way; only the list's
    // freshness is in question.
    if (!(await loadContacts())) {
        toast.error("Added, but the list did not refresh — reload to see them");
    }
    done(true);
}

function refreshOnFocus() {
    if (document.visibilityState === "visible" && section.value === "people") {
        refreshContacts();
    }
}

// The board holds list rows, which carry no linked contacts -- only the detail
// endpoint attaches them. Open on the row so the panel appears at once, then
// upgrade to the full record so the People section is not falsely empty.
async function openPanel(app = null) {
    panelApp.value = app ?? {};
    showPanel.value = true;
    if (!app?.id) return;
    try {
        const detail = await fetchApplication(app.id);
        if (panelApp.value?.id === app.id) panelApp.value = detail;
    } catch (err) {
        toast.error("Error loading application: " + getErrorMessage(err));
    }
}

function closePanel() {
    panelApp.value = null;
    showPanel.value = false;
    contactId.value = null;
}

// The contact drawer stacks over the application panel rather than replacing
// it, so closing it returns you to the record you came from.
function openContact(id) {
    contactId.value = id;
}

// The drawer is reachable from two places now. Saving from the application
// panel has to refresh that record; saving from People has no record behind it
// and must refresh the contact list instead.
async function handleContactSaved() {
    if (showPanel.value) {
        await handlePanelSaved();
        return;
    }
    await loadContacts();
}

async function handlePanelSaved() {
    if (panelApp.value?.id) {
        const exists = applications.value.some(
            (a) => a.id === panelApp.value.id,
        );
        if (exists) {
            await refreshApplication(panelApp.value.id);
        } else {
            applications.value = [...applications.value, panelApp.value];
        }
    }
}

async function refreshApplication(id) {
    try {
        const updated = await fetchApplication(id);
        const idx = applications.value.findIndex((a) => a.id === id);
        if (idx !== -1) {
            applications.value = [
                ...applications.value.slice(0, idx),
                updated,
                ...applications.value.slice(idx + 1),
            ];
        } else {
            applications.value = [...applications.value, updated];
        }
        if (panelApp.value?.id === id) {
            panelApp.value = updated;
        }
    } catch (err) {
        if (err.response?.status === 404) {
            applications.value = applications.value.filter((a) => a.id !== id);
            if (panelApp.value?.id === id) {
                panelApp.value = null;
            }
        } else {
            toast.error(
                "Error refreshing application: " +
                    getErrorMessage(err),
            );
        }
    }
}

// Close a record without claiming why. The drag gesture knows the record is
// over; it does not know whether that was a rejection.
async function handleCloseRecord(id, closeReason = "unresolved") {
    try {
        await updateApplication(id, {
            state: "closed",
            close_reason: closeReason,
        });
    } catch (err) {
        toast.error(
            "Failed to close record — " +
                (err.response?.data?.error || err.message),
        );
        await loadApplications();
        statusVersion.value++;
        return;
    }
    logoTrigger.value++;
    await refreshApplication(id);
    statusVersion.value++;
    toast.success("Closed — set a reason in the panel");
}

async function handleStatusChange(id, status) {
    const prevStatus = applications.value.find((a) => a.id === id)?.status;
    try {
        await updateStatus(id, status);
    } catch (err) {
        toast.error(
            "Failed to update status — " +
                (err.response?.data?.error || err.message),
        );
        await loadApplications();
        statusVersion.value++;
        return;
    }
    logoTrigger.value++;
    await refreshApplication(id);
    statusVersion.value++;
    if (prevStatus && prevStatus !== status) {
        const label = status.charAt(0).toUpperCase() + status.slice(1);
        toast.success(`Moved to ${label}`, {
            actionLabel: "Undo",
            action: async () => {
                try {
                    await updateStatus(id, prevStatus);
                } catch (undoErr) {
                    toast.error(
                        "Undo failed — " +
                            (undoErr.response?.data?.error || undoErr.message),
                    );
                    await loadApplications();
                    return;
                }
                logoTrigger.value++;
                await refreshApplication(id);
            },
        });
    }
}

function setShowAll(val) {
    if (showAllUsers.value === val) return;
    showAllUsers.value = val;
    loadApplications();
    if (section.value === "people") refreshContacts();
    connectLiveUpdates();
}

const liveUpdates = shallowRef(null);

const freshnessTier = computed(
    () => liveUpdates.value?.tier.value ?? TIER_PENDING,
);
// R11: a reconnect refetch that shifted the board holds the just-now state so
// the shift has a stated cause. The freshness machine only marks updates for
// events it saw itself, so the hold is owned here and expires on KTD5's
// JUST_NOW_MS.
const justNowHold = ref(false);
let justNowTimer = null;

// Handle for the day-rollover detector started in onMounted, stopped there.
let dayRollover = null;

function holdJustNow() {
    justNowHold.value = true;
    if (justNowTimer !== null) clearTimeout(justNowTimer);
    justNowTimer = setTimeout(() => {
        justNowHold.value = false;
        justNowTimer = null;
    }, JUST_NOW_MS);
}

const freshnessDisplay = computed(() => {
    if (justNowHold.value && freshnessTier.value === TIER_LIVE) {
        return "SYNCED JUST NOW";
    }
    return liveUpdates.value?.display.value ?? "";
});
const freshnessAbsolute = computed(
    () => liveUpdates.value?.absolute.value ?? "",
);

// R26 shares this region rather than adding a second one. A connection the
// user has to act on outranks a destination they just chose themselves, so the
// freshness tiers win while they are showing.
const politeAnnouncement = computed(() => {
    if (freshnessTier.value === TIER_DEGRADED) {
        return "Live updates are delayed.";
    }
    if (freshnessTier.value === TIER_STALE) {
        return "Live updates are not being received.";
    }
    return sectionAnnouncement.value;
});

const assertiveAnnouncement = computed(() =>
    freshnessTier.value === TIER_TERMINAL
        ? "Live updates have stopped. Reload the page to resume."
        : "",
);

// R9: the stream has no replay, so anything missed while disconnected is only
// recovered by refetching the whole list. R10: that refetch must never land
// under an active drag, so it is gated by the queue both when requested and
// again when the fetch resolves -- a drag can start while it is in flight.
let refetchQueue = createRefetchQueue();
let refetchInFlight = false;
let sawDegraded = false;

watch(freshnessTier, (tier) => {
    if (
        tier === TIER_DEGRADED ||
        tier === TIER_STALE ||
        tier === TIER_TERMINAL
    ) {
        sawDegraded = true;
    }
});

// A bulk refetch replaces the whole list, so an open detail panel has to be
// reconciled too -- otherwise a recovered edit or delete leaves the modal
// showing stale data and still offering actions against it. The per-event
// path already does this; the recovery path has to match it.
function syncOpenPanel(list) {
    const openId = panelApp.value?.id;
    if (!openId) return;

    const fresh = list.find((a) => a.id === openId);
    if (fresh) {
        panelApp.value = fresh;
        return;
    }
    panelApp.value = null;
    showPanel.value = false;
}

async function runRefetch() {
    refetchInFlight = true;
    try {
        const scope = showAllUsers.value;
        const next = await fetchApplications(null, scope);

        // Toggling scope mid-flight means this response is for the wrong set
        // of users. setShowAll already issued its own load, so drop this one
        // rather than letting the older request win the race.
        if (scope !== showAllUsers.value) return;

        // A drag can begin while the fetch is in flight. Re-gate directly
        // rather than through requestRefetch, which returns a fresh queue and
        // would discard a reconnect that queued behind this fetch.
        if (dragActive.value) {
            refetchQueue = { pending: true };
            return;
        }

        const changed = hasContentChanged(applications.value, next);
        applications.value = next;
        syncOpenPanel(next);
        if (shouldHoldJustNow(sawDegraded, changed)) holdJustNow();
        sawDegraded = false;
    } catch (err) {
        toast.error(
            "Error refreshing applications: " + getErrorMessage(err),
        );
    } finally {
        refetchInFlight = false;
        // A reconnect that arrived mid-flight was queued rather than started,
        // so release it now. Without this the second reconnect would be
        // dropped; without the queue it would race the first and could land
        // out of order, overwriting fresher data with staler.
        if (!dragActive.value) flushQueuedRefetch();
    }
}

function flushQueuedRefetch() {
    const gate = flushRefetch(refetchQueue);
    refetchQueue = gate.state;
    if (gate.apply) runRefetch();
}

function requestReconnectRefetch() {
    const gate = requestRefetch(
        refetchQueue,
        dragActive.value || refetchInFlight,
    );
    refetchQueue = gate.state;
    if (gate.apply) runRefetch();
    // Contacts have no drag gesture to land under, so they refetch straight
    // away rather than going through the applications queue.
    if (section.value === "people") refreshContacts();
}

watch(dragActive, (active) => {
    if (active || refetchInFlight) return;
    flushQueuedRefetch();
});

function connectLiveUpdates() {
    liveUpdates.value?.stop();
    liveUpdates.value = useLiveUpdates({
        all: showAllUsers.value,
        onChange: handleRemoteChange,
        onReconnect: requestReconnectRefetch,
    });
}

function retryLiveUpdates() {
    liveUpdates.value?.reconnect();
}

function handleRemoteChange(evt) {
    if (evt.type === "deleted") {
        applications.value = applications.value.filter((a) => a.id !== evt.id);
        if (panelApp.value?.id === evt.id) {
            panelApp.value = null;
            showPanel.value = false;
        }
        return;
    }
    refreshApplication(evt.id);
}

onMounted(async () => {
    const isMobile = window.innerWidth < 768;
    compactHeader.value = storageGetBool(COMPACT_KEY, isMobile);
    document.addEventListener("visibilitychange", refreshOnFocus);
    currentUser.value = await fetchMe();
    loadApplications();
    connectLiveUpdates();
    // Follow-up state is classified server-side against today, so a board
    // left open past midnight is showing yesterday's classification. Refetch
    // through the reconnect path so it waits out a drag, drops a response for
    // a stale scope, and reconciles an open panel.
    dayRollover = useDayRollover(requestReconnectRefetch);
});

onUnmounted(() => {
    document.removeEventListener("visibilitychange", refreshOnFocus);
    if (announcementTimer !== null) clearTimeout(announcementTimer);
    liveUpdates.value?.stop();
    dayRollover?.stop();
    if (justNowTimer !== null) {
        clearTimeout(justNowTimer);
        justNowTimer = null;
    }
});
</script>
