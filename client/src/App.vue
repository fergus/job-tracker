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
                class="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between"
            >
                <div class="flex items-center gap-2.5">
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
                <div class="flex items-center gap-3">
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
                    v-if="view === 'kanban'"
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
                    v-else
                    key="timeline"
                    :applications="displayApplications"
                    :showClosed="showClosed"
                    :closedCount="closedCount"
                    @open-detail="openPanel"
                    @toggle-show-closed="toggleShowClosed"
                    @set-view="view = $event"
                />
            </Transition>
        </main>

        <!-- Application panel -->
        <ApplicationPanel
            v-if="showPanel"
            :panelApp="panelApp"
            :totalApplications="applications.length"
            @close="closePanel"
            @saved="handlePanelSaved"
            @panel-app-updated="panelApp = $event"
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
    updateStatus,
    updateApplication,
} from "./api";
import { isTerminal } from "./utils/timeline.js";
import { useToast } from "./composables/useToast";
import { storageGetBool, storageSet } from "./utils/storage.js";
import { getErrorMessage } from "./utils/error.js";
import { useLiveUpdates } from "./composables/useLiveUpdates.js";
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
import TimelineView from "./components/TimelineView.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import ToastContainer from "./components/ToastContainer.vue";

const ApplicationPanel = defineAsyncComponent(() =>
    import("./components/ApplicationPanel.vue")
);

const toast = useToast();

const version = __APP_VERSION__;

const COMPACT_KEY = "jobtracker_compact_header";
const SHOW_CLOSED_KEY = "jobtracker_show_closed";



const view = ref("kanban");
const applications = ref([]);
const panelApp = ref(null);
const showPanel = ref(false);
const currentUser = ref(null);
const showAllUsers = ref(false);
const showSettings = ref(false);
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

watch(showPanel, (panel) => {
    const lock = panel && window.innerWidth < 768;
    document.body.style.overflow = lock ? "hidden" : "";
});

function toggleCompact() {
    compactHeader.value = !compactHeader.value;
    storageSet(COMPACT_KEY, String(compactHeader.value));
}

async function loadApplications() {
    applications.value = await fetchApplications(null, showAllUsers.value);
}

function openPanel(app = null) {
    panelApp.value = app ?? {};
    showPanel.value = true;
}

function closePanel() {
    panelApp.value = null;
    showPanel.value = false;
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

const politeAnnouncement = computed(() => {
    if (freshnessTier.value === TIER_DEGRADED) {
        return "Live updates are delayed.";
    }
    if (freshnessTier.value === TIER_STALE) {
        return "Live updates are not being received.";
    }
    return "";
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
    view.value = isMobile ? "kanban" : "kanban";
    compactHeader.value = storageGetBool(COMPACT_KEY, isMobile);
    currentUser.value = await fetchMe();
    loadApplications();
    connectLiveUpdates();
});

onUnmounted(() => {
    liveUpdates.value?.stop();
    if (justNowTimer !== null) {
        clearTimeout(justNowTimer);
        justNowTimer = null;
    }
});
</script>
