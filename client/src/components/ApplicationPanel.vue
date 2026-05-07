<template>
  <div
    class="fixed inset-0 z-50 outline-none"
    @keydown="handleKeydown"
    tabindex="-1"
    ref="panelRoot"
    role="dialog"
    aria-modal="true"
    :aria-label="isEdit ? `Edit application — ${form.company_name || 'Application'}` : 'Add application'"
  >
    <!-- Backdrop -->
    <div
      class="absolute inset-0 bg-black/40 transition-opacity duration-300"
      :class="visible ? 'opacity-100' : 'opacity-0'"
      @click="pendingDelete = false; pendingDeleteNoteId = null; close()"
    />

    <!-- Panel: right-side drawer on desktop, bottom sheet on mobile -->
    <div
      class="absolute flex flex-col bg-panel shadow-xl
             inset-x-0 bottom-0 h-[92vh] rounded-t-2xl
             md:inset-y-0 md:left-0 md:h-auto md:w-[640px] md:rounded-none
             transition-transform duration-300 ease-out-expo"
      :class="visible
        ? 'translate-y-0 md:translate-x-0 md:translate-y-0'
        : 'translate-y-full md:translate-y-0 md:-translate-x-full'"
    >
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div class="w-8 h-1 bg-line-2 rounded-full"></div>
      </div>

      <!-- Sticky header -->
      <div class="px-5 pt-5 pb-4 border-b border-line shrink-0">
        <div class="flex items-start gap-3">
          <div class="flex-1 min-w-0">
            <input
              v-model="form.company_name"
              placeholder="Company name"
              aria-label="Company name"
              class="w-full text-base font-semibold font-condensed text-ink bg-transparent border-b border-transparent focus:border-accent focus:outline-none py-0.5 placeholder:text-ink-3/50 transition-colors"
            />
            <input
              v-model="form.role_title"
              placeholder="Role title"
              aria-label="Role title"
              class="w-full text-sm text-ink-2 bg-transparent border-b border-transparent focus:border-accent focus:outline-none py-0.5 mt-0.5 placeholder:text-ink-3/50 transition-colors"
            />
          </div>
          <button
            @click="close"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken transition-colors shrink-0"
            aria-label="Close panel"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Sticky status bar -->
      <div class="px-5 py-2 border-b border-line shrink-0 relative">
        <div class="flex flex-wrap justify-between gap-1.5">
          <button
            v-for="s in statuses"
            :key="s"
            @click="onStatusClick(s)"
            :aria-pressed="form.status === s"
            :class="[
              form.status === s ? 'ring-2 ring-offset-1 opacity-100 py-1.5' : 'opacity-30 hover:opacity-60 py-1',
              stampingStatus === s ? 'stage-stamp' : ''
            ]"
            :style="statusPillStyle(s)"
            class="px-2.5 min-h-[44px] inline-flex items-center rounded-full text-xs font-medium capitalize transition-all duration-200"
          >{{ s }}</button>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        <div class="px-5 py-4">

          <!-- Edit mode: Notes first -->
          <template v-if="isEdit">
            <!-- Notes -->
            <div class="mt-2">
              <h3 class="text-xs font-medium text-ink-3 uppercase tracking-wide mb-4">Notes</h3>
              <div class="flex flex-col gap-3 mb-4">
                <div class="flex items-center gap-2">
                  <select
                    v-model="newNoteStage"
                    aria-label="Note stage"
                    class="border border-line bg-raised rounded-lg px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden capitalize"
                  >
                    <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                  </select>
                  <button
                    @click="addNote"
                    class="text-sm text-accent hover:text-accent-hover font-medium px-2 py-1.5 min-h-[44px] inline-flex items-center ml-auto"
                  >Add</button>
                </div>
                <textarea
                  v-model="newNoteContent"
                  @keydown.ctrl.enter="addNote"
                  @keydown.meta.enter="addNote"
                  placeholder="Add a note... (supports markdown, Ctrl+Enter to submit)"
                  rows="3"
                  class="w-full border border-line bg-raised rounded-lg px-2 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden resize-y"
                />
              </div>
              <div v-if="sortedNotes.length === 0 && !notesTipDismissed && totalApplications <= 1" class="flex items-start gap-2 mb-3 p-2.5 rounded-lg bg-accent-muted/20 border border-accent/10">
                <svg class="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p class="text-sm text-ink-2 flex-1">Tip: Add a note for every interaction — interviews, follow-ups, rejections. This builds your Journey timeline automatically.</p>
                <button
                  @click="dismissNotesTip"
                  class="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ink-3 hover:text-ink transition-colors"
                  aria-label="Dismiss tip"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div v-if="sortedNotes.length === 0" class="text-sm text-ink-3 py-2">No notes yet — add one for every interaction: calls, emails, follow-ups. Each note builds your Journey timeline.</div>
              <div v-for="note in sortedNotes" :key="note.id" class="bg-raised rounded-lg p-3 mb-2">
                <div v-if="editingNoteId === note.id" class="flex flex-col gap-2">
                  <div class="flex items-center gap-2">
                    <select
                      v-model="editingStage"
                      aria-label="Edit note stage"
                      class="border border-line bg-raised rounded-lg px-2 py-1 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden capitalize"
                    >
                      <option v-for="s in statuses" :key="s" :value="s">{{ s }}</option>
                    </select>
                    <div class="ml-auto flex gap-2">
                      <button
                        @click="saveEdit(note.id)"
                        class="text-xs text-accent-fg bg-accent hover:bg-accent-hover font-medium px-3 py-1.5 min-h-[44px] inline-flex items-center rounded"
                      >Save</button>
                      <button
                        @click="cancelEdit"
                        class="text-xs text-ink-2 hover:text-ink font-medium px-3 py-1.5 min-h-[44px] inline-flex items-center rounded bg-sunken hover:bg-line"
                      >Cancel</button>
                    </div>
                  </div>
                  <textarea
                    v-model="editingContent"
                    @keydown.escape="cancelEdit"
                    @keydown.ctrl.enter="saveEdit(note.id)"
                    @keydown.meta.enter="saveEdit(note.id)"
                    rows="4"
                    class="w-full text-sm text-ink border border-accent rounded px-1.5 py-0.5 focus:ring-2 focus:ring-accent outline-hidden resize-y bg-panel"
                    ref="editTextarea"
                  />
                </div>
                <div v-else class="flex items-start justify-between">
                  <div class="flex items-start gap-3 flex-1 min-w-0">
                    <span
                      :style="stageBadgeStyle(note.stage)"
                      class="px-2 py-0.5 rounded-full text-xs font-medium capitalize mt-0.5 shrink-0"
                    >{{ note.stage }}</span>
                    <div class="flex-1 min-w-0">
                      <div
                        class="text-sm text-ink-2 prose prose-sm max-w-none cursor-pointer hover:text-accent focus-visible:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1 -mx-1"
                        v-html="renderMarkdown(note.content)"
                        @click="startEdit(note)"
                        @keydown.enter="startEdit(note)"
                        @keydown.space.prevent="startEdit(note)"
                        tabindex="0"
                        aria-label="Edit note"
                      />
                      <div class="text-xs text-ink-3 mt-1 flex gap-2">
                        <span>{{ formatDateTime(note.created_at) }}</span>
                        <span v-if="note.updated_at && note.updated_at !== note.created_at">· Edited: {{ formatDateTime(note.updated_at) }}</span>
                      </div>
                    </div>
                  </div>
                  <div v-if="pendingDeleteNoteId === note.id" class="flex items-center gap-1 ml-1 shrink-0">
                    <button
                      @click="removeNote(note.id)"
                      class="text-xs font-medium text-danger hover:text-danger-hover px-2 py-1.5 min-h-[44px] inline-flex items-center rounded transition-colors"
                    >Delete</button>
                    <button
                      @click="pendingDeleteNoteId = null"
                      class="text-xs font-medium text-ink-3 hover:text-ink px-2 py-1.5 min-h-[44px] inline-flex items-center rounded transition-colors"
                    >Cancel</button>
                  </div>
                  <button
                    v-else
                    @click="removeNote(note.id)"
                    class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ink-3 hover:text-danger ml-1 shrink-0"
                    aria-label="Delete note"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>

          <!-- Primary fields: always visible, tightly grouped -->
          <div class="space-y-4" :class="isEdit ? 'mt-6 pt-5 border-t border-line' : ''">
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Job Posting URL</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="form.job_posting_url"
                  type="url"
                  placeholder="https://"
                  class="flex-1 min-w-0 border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
                />
                <a
                  v-if="form.job_posting_url"
                  :href="form.job_posting_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 p-1.5 text-ink-3 hover:text-accent transition-colors"
                  title="Open link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
              <div class="flex items-center gap-2 mt-1.5">
                <button
                  v-if="isEdit && form.job_posting_url && !form.job_description"
                  @click="onFetchJd"
                  :disabled="fetchingJd"
                  class="text-xs text-accent hover:text-accent-hover font-medium inline-flex items-center gap-1.5 min-h-[28px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <template v-if="fetchingJd">
                    <svg viewBox="0 0 64 64" class="w-4 h-4" aria-hidden="true">
                      <g fill="currentColor">
                        <path class="c c1" d="M 12 26 L 16 22 L 26 32 L 16 42 L 12 38 L 18 32 Z" />
                        <path class="c c2" d="M 22 22 L 26 18 L 40 32 L 26 46 L 22 42 L 32 32 Z" />
                        <path class="c c3" d="M 32 18 L 36 14 L 54 32 L 36 50 L 32 46 L 46 32 Z" />
                      </g>
                    </svg>
                    Fetching...
                  </template>
                  <template v-else>Fetch & Extract</template>
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Company Website</label>
              <div class="flex items-center gap-1">
                <input
                  v-model="form.company_website_url"
                  type="url"
                  placeholder="https://"
                  class="flex-1 min-w-0 border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
                />
                <a
                  v-if="form.company_website_url"
                  :href="form.company_website_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 p-1.5 text-ink-3 hover:text-accent transition-colors"
                  title="Open link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Min Salary</label>
              <input
                v-model="form.salary_min"
                type="number"
                placeholder="—"
                class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-ink-3 mb-1">Max Salary</label>
              <input
                v-model="form.salary_max"
                type="number"
                placeholder="—"
                class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-ink-3 mb-1">Location</label>
            <input
              v-model="form.job_location"
              placeholder="Remote, New York, etc."
              class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden"
            />
          </div>

          <!-- Fetch failure fallback banner -->
          <div
            v-if="fetchError"
            class="flex items-start gap-2 p-2.5 rounded-lg bg-accent-muted/20 border border-accent/10"
          >
            <svg class="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p class="text-sm text-ink-2 flex-1">{{ fetchError }} Paste the job description below and click Extract to analyze it.</p>
            <button
              @click="fetchError = ''"
              class="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ink-3 hover:text-ink transition-colors"
              aria-label="Dismiss"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="block text-xs font-medium text-ink-3">Job Description</label>
              <div class="flex items-center gap-2">
                <button
                  v-if="isEdit && form.job_description && !editingJobDesc"
                  @click="onExtractJd"
                  :disabled="fetchingJd"
                  class="text-xs text-accent hover:text-accent-hover min-h-[44px] inline-flex items-center gap-1.5 px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <template v-if="fetchingJd">
                    <svg viewBox="0 0 64 64" class="w-4 h-4" aria-hidden="true">
                      <g fill="currentColor">
                        <path class="c c1" d="M 12 26 L 16 22 L 26 32 L 16 42 L 12 38 L 18 32 Z" />
                        <path class="c c2" d="M 22 22 L 26 18 L 40 32 L 26 46 L 22 42 L 32 32 Z" />
                        <path class="c c3" d="M 32 18 L 36 14 L 54 32 L 36 50 L 32 46 L 46 32 Z" />
                      </g>
                    </svg>
                    Extracting...
                  </template>
                  <template v-else>Extract</template>
                </button>
                <button
                  v-if="isEdit && form.job_description && !editingJobDesc"
                  @click="editingJobDesc = true"
                  class="text-xs text-accent hover:text-accent-hover min-h-[44px] inline-flex items-center px-2 py-1"
                >Edit</button>
                <button
                  v-if="editingJobDesc"
                  @click="editingJobDesc = false"
                  class="text-xs text-accent hover:text-accent-hover min-h-[44px] inline-flex items-center px-2 py-1"
                >Done</button>
              </div>
            </div>
            <div
              v-if="isEdit && form.job_description && !editingJobDesc"
              class="prose prose-sm max-w-none text-sm text-ink-2 border border-line rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-line-2 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              v-html="renderMarkdown(form.job_description)"
              @click="editingJobDesc = true"
              @keydown.enter="editingJobDesc = true"
              @keydown.space.prevent="editingJobDesc = true"
              tabindex="0"
              aria-label="Edit job description"
            />
            <textarea
              v-else
              v-model="form.job_description"
              rows="2"
              placeholder="Paste the job description..."
              class="w-full border border-line bg-raised rounded-lg px-2.5 py-1.5 text-sm text-ink focus:ring-2 focus:ring-accent focus:border-accent outline-hidden resize-y"
            />
          </div>

          </div><!-- /primary fields -->

          <!-- Edit/view-only sections -->
          <template v-if="isEdit">

            <!-- Dates grid -->
            <details :open="datesOpen" @toggle="datesOpen = $event.target.open" class="group mt-6 pt-5 border-t border-line">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Dates</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3">
                <div class="grid grid-cols-2 gap-4">
                  <div v-for="d in dates" :key="d.key">
                    <p class="text-xs text-ink-3 uppercase tracking-wide">{{ d.label }}</p>
                    <p v-if="d.key === 'created_at'" class="text-sm text-ink">{{ formatDate(panelApp[d.key]) }}</p>
                    <div v-else-if="editingDateKey === d.key" class="flex items-center gap-1">
                      <input
                        type="date"
                        :value="toDateInputValue(panelApp[d.key])"
                        @change="onDateChange(d.key, $event)"
                        @blur="editingDateKey = null"
                        @keydown.escape="editingDateKey = null"
                        class="text-sm border border-accent rounded px-1 py-0.5 focus:ring-2 focus:ring-accent outline-hidden w-full bg-raised text-ink"
                      />
                      <button
                        v-if="panelApp[d.key]"
                        @mousedown.prevent="clearDate(d.key)"
                        class="p-1 rounded text-ink-3 hover:text-danger flex items-center justify-center shrink-0 min-h-[44px] min-w-[44px]"
                        title="Clear date"
                        aria-label="Clear date"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                    <p
                      v-else
                      @click="editingDateKey = d.key"
                      class="text-sm text-ink cursor-pointer hover:text-accent"
                    >{{ formatDate(panelApp[d.key]) }}</p>
                  </div>
                </div>
              </div>
            </details>

            <!-- Mini timeline -->
            <details v-if="miniSegments.length" :open="journeyOpen" @toggle="journeyOpen = $event.target.open" class="group mt-4 pt-4 border-t border-line">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Journey</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3">
                <div class="relative h-5 rounded overflow-hidden bg-sunken">
                  <div
                    v-for="seg in miniSegments"
                    :key="seg.stage"
                    class="absolute top-0 h-full rounded"
                    :style="miniSegmentStyle(seg)"
                    :title="`${seg.stage} · ${formatShortDate(seg.start)} – ${formatShortDate(seg.end)} · ${miniDays(seg)} day${miniDays(seg) === 1 ? '' : 's'}`"
                  ></div>
                </div>
                <div class="flex gap-3 mt-2 flex-wrap">
                  <div v-for="seg in miniSegments" :key="seg.stage" class="flex items-center gap-1">
                    <span class="inline-block w-2.5 h-2.5 rounded-sm shrink-0" :style="{ backgroundColor: stageColor(seg.stage) }"></span>
                    <span class="text-xs text-ink-3 capitalize">{{ seg.stage }}</span>
                  </div>
                </div>
              </div>
            </details>

            <!-- Structured JD -->
            <details
              v-if="panelApp?.extracted_jd"
              :open="extractedJdOpen"
              @toggle="extractedJdOpen = $event.target.open"
              class="group mt-4 pt-4 border-t border-line"
            >
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Extracted Details</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3 space-y-3">
                <div v-if="parsedExtractedJd.required_skills?.length">
                  <p class="text-xs text-ink-3 uppercase tracking-wide mb-1">Required Skills</p>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="skill in parsedExtractedJd.required_skills"
                      :key="skill"
                      class="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-muted/30 text-ink-2"
                    >{{ skill }}</span>
                  </div>
                </div>
                <div v-if="parsedExtractedJd.responsibilities?.length">
                  <p class="text-xs text-ink-3 uppercase tracking-wide mb-1">Responsibilities</p>
                  <ul class="list-disc list-inside text-sm text-ink-2 space-y-0.5">
                    <li v-for="r in parsedExtractedJd.responsibilities" :key="r">{{ r }}</li>
                  </ul>
                </div>
                <div v-if="parsedExtractedJd.experience_requirements?.length">
                  <p class="text-xs text-ink-3 uppercase tracking-wide mb-1">Experience</p>
                  <ul class="list-disc list-inside text-sm text-ink-2 space-y-0.5">
                    <li v-for="e in parsedExtractedJd.experience_requirements" :key="e">{{ e }}</li>
                  </ul>
                </div>
                <div v-if="parsedExtractedJd.salary_signals && (parsedExtractedJd.salary_signals.min || parsedExtractedJd.salary_signals.max)" class="flex items-center gap-2">
                  <p class="text-xs text-ink-3 uppercase tracking-wide">Salary</p>
                  <p class="text-sm text-ink-2">
                    <span v-if="parsedExtractedJd.salary_signals.min">{{ parsedExtractedJd.salary_signals.min.toLocaleString() }}</span>
                    <span v-if="parsedExtractedJd.salary_signals.min && parsedExtractedJd.salary_signals.max"> – </span>
                    <span v-if="parsedExtractedJd.salary_signals.max">{{ parsedExtractedJd.salary_signals.max.toLocaleString() }}</span>
                    <span v-if="parsedExtractedJd.salary_signals.currency" class="text-ink-3"> {{ parsedExtractedJd.salary_signals.currency }}</span>
                    <span v-if="parsedExtractedJd.salary_signals.period" class="text-ink-3"> / {{ parsedExtractedJd.salary_signals.period }}</span>
                  </p>
                </div>
                <div v-if="parsedExtractedJd.location" class="flex items-center gap-2">
                  <p class="text-xs text-ink-3 uppercase tracking-wide">Location</p>
                  <p class="text-sm text-ink-2">{{ parsedExtractedJd.location }}</p>
                </div>
                <div v-if="parsedExtractedJd.employment_type" class="flex items-center gap-2">
                  <p class="text-xs text-ink-3 uppercase tracking-wide">Type</p>
                  <p class="text-sm text-ink-2">{{ parsedExtractedJd.employment_type }}</p>
                </div>
                <div v-if="parsedExtractedJd.seniority_level" class="flex items-center gap-2">
                  <p class="text-xs text-ink-3 uppercase tracking-wide">Level</p>
                  <p class="text-sm text-ink-2">{{ parsedExtractedJd.seniority_level }}</p>
                </div>
              </div>
            </details>

            <!-- Generate Documents -->
            <details :open="generatedDocOpen" @toggle="generatedDocOpen = $event.target.open" class="group mt-4 pt-4 border-t border-line">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Generate</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3 space-y-3">
                <div class="flex items-center gap-2">
                  <select
                    v-model="selectedTask"
                    class="text-sm bg-panel border border-line rounded-lg px-2.5 py-1.5 text-ink focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <option value="cover_letter">Cover Letter</option>
                    <option value="resume_tailor">Resume Tips</option>
                    <option value="interview_prep">Interview Prep</option>
                  </select>
                  <button
                    @click="onGenerateDocument"
                    :disabled="generatingDoc"
                    class="text-xs text-accent hover:text-accent-hover min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-accent/20 hover:border-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <template v-if="generatingDoc">
                      <svg viewBox="0 0 64 64" class="w-4 h-4" aria-hidden="true">
                        <g fill="currentColor">
                          <path class="c c1" d="M 12 26 L 16 22 L 26 32 L 16 42 L 12 38 L 18 32 Z" />
                          <path class="c c2" d="M 22 22 L 26 18 L 40 32 L 26 46 L 22 42 L 32 32 Z" />
                          <path class="c c3" d="M 32 18 L 36 14 L 54 32 L 36 50 L 32 46 L 46 32 Z" />
                        </g>
                      </svg>
                      Generating...
                    </template>
                    <template v-else>Generate</template>
                  </button>
                </div>
                <div
                  v-if="generatedDocPreview"
                  class="border border-line rounded-lg overflow-hidden"
                >
                  <div class="flex items-center justify-between px-3 py-2 bg-sunken border-b border-line">
                    <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">
                      {{ generatedDocPreview.task === 'cover_letter' ? 'Cover Letter' : generatedDocPreview.task === 'resume_tailor' ? 'Resume Tips' : 'Interview Prep' }}
                    </span>
                    <button
                      @click="generatedDocPreview = null"
                      class="text-xs text-ink-3 hover:text-ink"
                    >Dismiss</button>
                  </div>
                  <div class="prose prose-sm max-w-none text-sm text-ink-2 px-3 py-2" v-html="renderMarkdown(generatedDocPreview.text)" />
                </div>
              </div>
            </details>

            <!-- Attachments -->
            <details :open="attachmentsOpen" @toggle="attachmentsOpen = $event.target.open" class="group mt-4 pt-4 border-t border-line">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Attachments</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3">
                <div v-if="attachmentsLoading" class="text-sm text-ink-3 mb-2">Loading...</div>
                <div v-else>
                  <!-- Bounded file list -->
                  <div v-if="attachments.length" class="bg-sunken rounded-lg p-2 mb-2 space-y-0.5">
                    <div
                      v-for="att in attachments"
                      :key="att.id"
                      class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-panel/60 transition-colors"
                    >
                      <div class="flex items-center gap-2 min-w-0">
                        <span
                          class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded bg-panel text-[9px] font-bold leading-none"
                          :class="fileTypeMeta(att.original_filename).color"
                          :style="fileTypeMeta(att.original_filename).style"
                        >{{ fileTypeMeta(att.original_filename).label }}</span>
                        <a
                          :href="getAttachmentUrl(panelApp.id, att.id)"
                          class="text-sm text-accent hover:underline truncate"
                          target="_blank"
                          rel="noopener noreferrer"
                        >{{ att.original_filename }}</a>
                        <span
                          v-if="att.generated_by === 'agent'"
                          class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-accent-muted/30 text-accent"
                        >AI</span>
                      </div>
                      <button
                        @click="removeAttachment(att.id)"
                        class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded text-ink-3 hover:text-danger ml-1 shrink-0"
                        title="Delete attachment"
                        aria-label="Delete attachment"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <!-- Activity -->
            <details :open="auditLogOpen" @toggle="auditLogOpen = $event.target.open" class="group mt-4 pt-4 border-t border-line">
              <summary class="flex items-center justify-between cursor-pointer list-none select-none">
                <span class="text-xs font-medium text-ink-3 uppercase tracking-wide">Activity</span>
                <svg class="w-4 h-4 text-ink-3 transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </summary>
              <div class="mt-3">
                <div v-if="auditLogLoading" class="text-sm text-ink-3 mb-2">Loading...</div>
                <div v-else-if="auditLog.length === 0" class="text-sm text-ink-3">No activity yet.</div>
                <div v-else class="space-y-2">
                  <div
                    v-for="entry in auditLog"
                    :key="entry.id"
                    class="bg-raised rounded-lg p-3"
                  >
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-sm font-medium text-ink">{{ humanizeAction(entry.action) }}</span>
                      <span
                        class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                        :class="entry.auth_method === 'api_key' ? 'bg-accent-muted/30 text-accent' : 'bg-sunken text-ink-2'"
                      >{{ entry.auth_method === 'api_key' ? 'Agent' : 'You' }}</span>
                      <span class="text-[9px] uppercase tracking-wide text-ink-3">{{ entry.source === 'mcp' ? 'MCP' : 'Web' }}</span>
                    </div>
                    <div class="text-xs text-ink-3 mt-1">{{ formatDateTime(entry.created_at) }}</div>
                    <div v-if="entry.details" class="mt-1.5">
                      <details class="text-xs">
                        <summary class="text-ink-3 cursor-pointer hover:text-ink-2">Details</summary>
                        <pre class="mt-1 p-2 bg-sunken rounded text-ink-2 overflow-x-auto">{{ JSON.stringify(entry.details, null, 2) }}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            </details>

          </template>

          <!-- Files -->
          <div class="mt-7 pt-5 border-t border-line">
            <!-- Onboarding tip -->
            <div v-if="!isEdit && !notesTipDismissed && totalApplications === 0" class="flex items-start gap-2 mb-4 p-2.5 rounded-lg bg-accent-muted/20 border border-accent/10">
              <svg class="w-4 h-4 text-accent shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p class="text-sm text-ink-2 flex-1">Track your progress through the pipeline by changing status in the bar above. Add details now, or come back later — nothing is set in stone.</p>
              <button
                @click="dismissNotesTip"
                class="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-ink-3 hover:text-ink transition-colors"
                aria-label="Dismiss tip"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <!-- Queued files preview -->
            <div v-if="queuedFiles.length" class="bg-sunken rounded-lg p-2 mb-2 space-y-0.5">
              <div
                v-for="(f, i) in queuedFiles"
                :key="i"
                class="flex items-center justify-between py-1.5 px-2 rounded hover:bg-panel/60 transition-colors"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <span
                    class="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded bg-panel text-[8px] font-bold leading-none"
                    :class="fileTypeMeta(f.name).color"
                    :style="fileTypeMeta(f.name).style"
                  >{{ fileTypeMeta(f.name).label }}</span>
                  <span class="text-sm text-ink-2 truncate">{{ f.name }}</span>
                </div>
                <button @click="queuedFiles.splice(i, 1)" class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded text-ink-3 hover:text-danger ml-1 shrink-0" aria-label="Remove file">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <!-- Drop zone -->
            <div
              class="border rounded-lg p-4 text-center cursor-pointer transition-all duration-200"
              :class="dropZoneClasses"
              @dragenter.prevent="onDragEnter"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
              @drop.prevent="onDrop"
              @click="triggerFileInput"
              role="button"
              tabindex="0"
              aria-label="Add files"
              @keydown.enter="triggerFileInput"
              @keydown.space.prevent="triggerFileInput"
            >
              <span class="text-sm text-ink-3 select-none">
                <span v-if="isDragOver" class="text-accent font-medium">Drop to attach</span>
                <span v-else>Drop files or click to add</span>
              </span>
              <input ref="fileInput" type="file" @change="onFileInput" accept=".pdf,.doc,.docx,.md,.txt" class="hidden" multiple />
            </div>
          </div>

        </div>
      </div>

      <!-- Sticky footer -->
      <div class="flex items-center justify-between px-5 py-4 border-t border-line shrink-0 min-h-[68px]">
        <!-- Unsaved changes prompt -->
        <template v-if="pendingClose">
          <p class="text-sm text-ink-2">Unsaved changes</p>
          <div class="flex gap-2">
            <button
              @click="pendingClose = false"
              class="px-3 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-ink-2 bg-sunken hover:bg-line rounded-lg transition-colors"
            >Keep editing</button>
            <button
              @click="doClose"
              class="px-3 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-danger hover:text-danger-hover"
            >Close anyway</button>
          </div>
        </template>
        <!-- Delete confirmation -->
        <template v-else-if="pendingDelete">
          <p class="text-sm text-ink-2">Delete this application?</p>
          <div class="flex gap-2">
            <button
              @click="pendingDelete = false"
              class="px-3 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-ink-2 bg-sunken hover:bg-line rounded-lg transition-colors"
            >Cancel</button>
            <button
              @click="confirmDelete"
              class="px-3 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-accent-fg bg-danger hover:bg-danger-hover rounded-lg transition-colors"
            >Delete</button>
          </div>
        </template>
        <!-- Normal footer -->
        <template v-else>
          <button
            v-if="isEdit"
            @click="confirmDelete"
            class="py-2 px-2 min-h-[44px] inline-flex items-center text-sm text-danger hover:text-danger-hover font-medium"
          >Delete</button>
          <div v-else></div>
          <div class="flex gap-2">
            <button
              v-if="!isEdit"
              @click="close"
              class="px-3 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-ink-2 bg-sunken hover:bg-line rounded-lg transition-colors"
            >Cancel</button>
            <button
              @click="save"
              :disabled="saving"
              class="px-4 py-2 min-h-[44px] inline-flex items-center text-sm font-medium text-accent-fg bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
            >{{ saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Application') }}</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  createApplication, updateApplication, updateStatus, deleteApplication,
  updateDates, createNote, updateNote, deleteNote,
  fetchAttachments, uploadAttachments, getAttachmentUrl, deleteAttachment,
  extractJd, fetchJd, generateDocument, fetchAuditLog,
} from '../api'
import { computeSegments, stageColor, durationDays } from '../utils/timeline'
import { useToast } from '../composables/useToast'
import { renderMarkdown } from '../utils/markdown.js'
import { storageGetBool, storageSet } from '../utils/storage.js'
import { formatDate, formatShortDate, formatDateTime } from '../utils/date.js'
import { getErrorMessage, getErrorType } from '../utils/error.js'

const toast = useToast()

const NOTES_TIP_KEY = 'jobtracker_notes_tip_dismissed'
const notesTipDismissed = ref(storageGetBool(NOTES_TIP_KEY, false))
function dismissNotesTip() {
  notesTipDismissed.value = true
  storageSet(NOTES_TIP_KEY, 'true')
}

const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
const datesOpen = ref(isDesktop)
const journeyOpen = ref(isDesktop)
const attachmentsOpen = ref(isDesktop)
const extractedJdOpen = ref(isDesktop)
const generatedDocOpen = ref(false)
const fetchingJd = ref(false)
const fetchError = ref('')
const generatingDoc = ref(false)
const generatedDocPreview = ref(null)
const selectedTask = ref('cover_letter')
const auditLog = ref([])
const auditLogLoading = ref(false)
const auditLogOpen = ref(false)

const props = defineProps({ panelApp: Object, totalApplications: { type: Number, default: 0 } })
const emit = defineEmits(['close', 'saved', 'panel-app-updated'])

const isEdit = computed(() => !!(props.panelApp?.id))

const statuses = ['interested', 'applied', 'responded', 'interview', 'offer', 'accepted', 'rejected']


const dates = [
  { key: 'created_at', label: 'Created' },
  { key: 'interested_at', label: 'Interested' },
  { key: 'applied_at', label: 'Applied' },
  { key: 'responded_at', label: 'Responded' },
  { key: 'interview_at', label: 'Interview' },
  { key: 'offer_at', label: 'Offer' },
  { key: 'closed_at', label: 'Closed' },
]

function statusPillStyle(s) {
  return {
    backgroundColor: `var(--stage-${s}-bg)`,
    color: `var(--stage-${s}-fg)`,
    '--tw-ring-color': `var(--stage-${s})`,
  }
}

function stageBadgeStyle(s) {
  return {
    backgroundColor: `var(--stage-${s}-bg)`,
    color: `var(--stage-${s}-fg)`,
  }
}

// Animation
const panelRoot = ref(null)
const visible = ref(false)
const stampingStatus = ref(null)



// All interactive element types that participate in the tab order
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Trap focus within the panel so Tab doesn't leak into obscured background content.
// Wraps forward (Tab) from last→first and backward (Shift+Tab) from first→last.
function handleKeydown(event) {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key === 'Tab') {
    const focusable = Array.from(panelRoot.value?.querySelectorAll(FOCUSABLE) ?? [])
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }
}

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => { visible.value = true })
  if (props.panelApp?.id) {
    loadAttachments()
    loadAuditLog()
    newNoteStage.value = props.panelApp.status
  }
})



// Form state
const form = reactive({
  company_name: '',
  role_title: '',
  status: 'interested',
  job_description: '',
  job_posting_url: '',
  company_website_url: '',
  salary_min: '',
  salary_max: '',
  job_location: '',
})

function initForm() {
  const a = props.panelApp || {}
  form.company_name = a.company_name || ''
  form.role_title = a.role_title || ''
  form.status = a.status || 'interested'
  form.job_description = a.job_description || ''
  form.job_posting_url = a.job_posting_url || ''
  form.company_website_url = a.company_website_url || ''
  form.salary_min = a.salary_min != null ? a.salary_min : ''
  form.salary_max = a.salary_max != null ? a.salary_max : ''
  form.job_location = a.job_location || ''
}

initForm()

watch(() => props.panelApp?.id, (newId) => {
  initForm()
  editingDateKey.value = null
  editingJobDesc.value = false
  fetchError.value = ''
  if (newId) {
    loadAttachments()
    loadAuditLog()
    newNoteStage.value = props.panelApp.status
  } else {
    attachments.value = []
    queuedFiles.value = []
    auditLog.value = []
  }
})

function isDirty() {
  if (queuedFiles.value.length > 0) return true
  const a = props.panelApp || {}
  if (!isEdit.value) {
    // Create mode: any filled field counts as dirty
    return !!(
      form.company_name ||
      form.role_title ||
      form.job_description ||
      form.job_posting_url ||
      form.company_website_url ||
      form.job_location ||
      form.salary_min ||
      form.salary_max
    )
  }
  // Status is excluded because onStatusClick() persists it immediately.
  return (
    form.company_name !== (a.company_name || '') ||
    form.role_title !== (a.role_title || '') ||
    form.job_description !== (a.job_description || '') ||
    form.job_posting_url !== (a.job_posting_url || '') ||
    form.company_website_url !== (a.company_website_url || '') ||
    form.job_location !== (a.job_location || '') ||
    form.salary_min !== (a.salary_min != null ? a.salary_min : '') ||
    form.salary_max !== (a.salary_max != null ? a.salary_max : '')
  )
}

async function close() {
  if (newNoteContent.value?.trim() && isEdit.value) {
    await addNote()
  }
  if (isDirty()) {
    pendingClose.value = true
    return
  }
  doClose()
}

function doClose() {
  pendingClose.value = false
  pendingDelete.value = false
  visible.value = false
  setTimeout(() => emit('close'), 300)
}

async function onStatusClick(s) {
  const prevStatus = form.status
  const appId = props.panelApp?.id
  if (s !== prevStatus) {
    stampingStatus.value = s
    setTimeout(() => { stampingStatus.value = null }, 420)
  }
  form.status = s
  if (isEdit.value) {
    try {
      await updateStatus(appId, s)
      emit('saved')
      if (s !== prevStatus) {
        const label = s.charAt(0).toUpperCase() + s.slice(1)
        toast.success(`Moved to ${label}`, {
          actionLabel: 'Undo',
          action: async () => {
            try {
              form.status = prevStatus
              await updateStatus(appId, prevStatus)
              emit('saved')
            } catch { form.status = s }
          },
        })
      }
    } catch (err) {
      form.status = prevStatus
      toast.error('Error updating status: ' + getErrorMessage(err))
    }
  }
}

const saving = ref(false)
const pendingDelete = ref(false)
const pendingClose = ref(false)
const pendingDeleteNoteId = ref(null)

async function save() {
  if (!form.company_name.trim() || !form.role_title.trim()) {
    toast.error('Company name and role title are required.')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) {
      await updateApplication(props.panelApp.id, {
        company_name: form.company_name,
        role_title: form.role_title,
        job_description: form.job_description,
        job_posting_url: form.job_posting_url,
        company_website_url: form.company_website_url,
        job_location: form.job_location,
      })
      if (queuedFiles.value.length > 0) {
        await uploadAttachments(props.panelApp.id, queuedFiles.value)
        queuedFiles.value = []
        await loadAttachments()
      }
      emit('saved')
      toast.success('Changes saved')
    } else {
      const formData = new FormData()
      formData.append('company_name', form.company_name)
      formData.append('role_title', form.role_title)
      formData.append('status', form.status)
      if (form.job_description) formData.append('job_description', form.job_description)
      if (form.job_posting_url) formData.append('job_posting_url', form.job_posting_url)
      if (form.company_website_url) formData.append('company_website_url', form.company_website_url)
      if (form.job_location) formData.append('job_location', form.job_location)
      formData.append('salary_min', form.salary_min !== '' ? form.salary_min : '')
      formData.append('salary_max', form.salary_max !== '' ? form.salary_max : '')

      const newApp = await createApplication(formData)

      if (queuedFiles.value.length > 0) {
        await uploadAttachments(newApp.id, queuedFiles.value)
        queuedFiles.value = []
      }

      emit('panel-app-updated', newApp)
      emit('saved')
      toast.success('Application created')
    }
  } catch (err) {
    toast.error('Error saving: ' + getErrorMessage(err))
  } finally {
    saving.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) {
    pendingDelete.value = true
    return
  }
  try {
    await deleteApplication(props.panelApp.id)
    pendingDelete.value = false
    visible.value = false
    setTimeout(() => { emit('saved'); emit('close') }, 300)
  } catch (err) {
    pendingDelete.value = false
    toast.error('Error deleting: ' + getErrorMessage(err))
  }
}

const editingDateKey = ref(null)
const editingJobDesc = ref(false)

async function onFetchJd() {
  if (!form.job_posting_url || fetchingJd.value) return
  fetchingJd.value = true
  fetchError.value = ''
  try {
    const result = await fetchJd(props.panelApp.id)
    form.job_description = result.job_description || ''
    toast.success('Job description fetched and extracted')
    emit('saved')
  } catch (err) {
    const message = getErrorMessage(err, 'Could not fetch the job description.')
    const type = getErrorType(err)
    fetchError.value = message
    // Auto-expand job description textarea so user can paste manually
    editingJobDesc.value = true
    // Toast with contextual copy based on error type
    if (type === 'anti_bot') {
      toast.error('This site blocks automatic fetching. Paste the description below and click Extract.')
    } else if (type === 'timeout') {
      toast.error('The page took too long to respond. Try again or paste manually.')
    } else if (type === 'not_found') {
      toast.error('Could not reach this page. Check the URL or paste the description manually.')
    } else {
      toast.error(message)
    }
  } finally {
    fetchingJd.value = false
  }
}

async function onExtractJd() {
  if (!form.job_description || fetchingJd.value) return
  fetchingJd.value = true
  fetchError.value = ''
  try {
    const result = await extractJd(props.panelApp.id)
    toast.success('Details extracted from job description')
    emit('saved')
  } catch (err) {
    const message = getErrorMessage(err, 'Extraction failed.')
    toast.error(message)
  } finally {
    fetchingJd.value = false
  }
}

async function onGenerateDocument() {
  if (!props.panelApp?.id || generatingDoc.value) return
  generatingDoc.value = true
  generatedDocPreview.value = null
  try {
    const result = await generateDocument(props.panelApp.id, selectedTask.value)
    generatedDocPreview.value = { task: selectedTask.value, text: result.text }
    toast.success('Document generated')
    await loadAttachments()
  } catch (err) {
    const message = getErrorMessage(err, 'Document generation failed.')
    toast.error(message)
  } finally {
    generatingDoc.value = false
  }
}

function toDateInputValue(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

async function onDateChange(key, event) {
  const val = event.target.value
  editingDateKey.value = null
  if (!val) return
  const isoValue = new Date(val + 'T12:00:00').toISOString()
  try {
    await updateDates(props.panelApp.id, { [key]: isoValue })
    emit('saved')
  } catch (err) {
    toast.error('Error updating date: ' + getErrorMessage(err))
  }
}

async function clearDate(key) {
  editingDateKey.value = null
  try {
    await updateDates(props.panelApp.id, { [key]: null })
    emit('saved')
  } catch (err) {
    toast.error('Error clearing date: ' + getErrorMessage(err))
  }
}

const miniSegments = computed(() => {
  if (!isEdit.value) return []
  return computeSegments(props.panelApp, new Date().toISOString())
})

const parsedExtractedJd = computed(() => {
  if (!props.panelApp?.extracted_jd) return {}
  try {
    return JSON.parse(props.panelApp.extracted_jd)
  } catch {
    return {}
  }
})

const miniTotalMs = computed(() => {
  if (!isEdit.value) return 1
  const start = new Date(props.panelApp.created_at)
  const end = props.panelApp.closed_at ? new Date(props.panelApp.closed_at) : new Date()
  return Math.max(end - start, 1)
})

function miniPct(isoDate) {
  return ((new Date(isoDate) - new Date(props.panelApp.created_at)) / miniTotalMs.value) * 100
}

function miniSegmentStyle(seg) {
  const colorVar = `var(--stage-${seg.stage}, oklch(57% 0.04 240))`
  const left = Math.max(0, miniPct(seg.start))
  const right = Math.min(100, miniPct(seg.end))
  const width = Math.max(right - left, 0.5)
  if (seg.isTrailing) {
    const colorAlpha = `color-mix(in oklch, ${colorVar} 80%, transparent)`
    return {
      left: left + '%',
      width: width + '%',
      backgroundImage: `repeating-linear-gradient(90deg, ${colorAlpha} 0px, ${colorAlpha} 6px, transparent 6px, transparent 10px)`,
    }
  }
  return {
    left: left + '%',
    width: width + '%',
    backgroundColor: colorVar,
  }
}

function miniDays(seg) {
  return durationDays(seg.start, seg.end)
}

const attachments = ref([])
const attachmentsLoading = ref(false)
const queuedFiles = ref([])
const fileInput = ref(null)
const isDragOver = ref(false)
const dragDepth = ref(0)

const dropZoneClasses = computed(() => {
  if (isDragOver.value) {
    return 'border-accent bg-accent-muted/10'
  }
  return 'border-line hover:border-line-2'
})

async function loadAttachments() {
  if (!props.panelApp?.id) return
  attachmentsLoading.value = true
  try {
    attachments.value = await fetchAttachments(props.panelApp.id)
  } catch {
    attachments.value = []
  } finally {
    attachmentsLoading.value = false
  }
}

async function loadAuditLog() {
  if (!props.panelApp?.id) return
  auditLogLoading.value = true
  try {
    auditLog.value = await fetchAuditLog(props.panelApp.id)
  } catch {
    auditLog.value = []
  } finally {
    auditLogLoading.value = false
  }
}

function humanizeAction(action) {
  const map = {
    create_application: 'Created application',
    update_application: 'Updated application',
    update_status: 'Changed status',
    upload_cv: 'Uploaded CV',
    upload_cover_letter: 'Uploaded cover letter',
    upload_attachment: 'Uploaded attachment',
    delete_attachment: 'Deleted attachment',
    update_dates: 'Updated dates',
    delete_application: 'Deleted application',
    add_note: 'Added note',
    update_note: 'Updated note',
    delete_note: 'Deleted note',
    extract_job_description: 'Extracted job description',
    fetch_job_description: 'Fetched job description',
    generate_document: 'Generated document',
  }
  return map[action] || action.replace(/_/g, ' ')
}

function onDragEnter(event) {
  dragDepth.value++
  if (dragDepth.value === 1) {
    isDragOver.value = true
  }
}

function onDragOver(event) {
  event.preventDefault()
}

function onDragLeave(event) {
  dragDepth.value--
  if (dragDepth.value <= 0) {
    dragDepth.value = 0
    isDragOver.value = false
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.md', '.txt']

function validateFiles(files) {
  const valid = []
  const invalid = []
  for (const file of files) {
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      valid.push(file)
    } else {
      invalid.push(file.name)
    }
  }
  if (invalid.length) {
    toast.error(`Skipped ${invalid.length} file${invalid.length > 1 ? 's' : ''} with unsupported type: ${invalid.join(', ')}`)
  }
  return valid
}

function queueFiles(files) {
  const valid = validateFiles(files)
  if (!valid.length) return
  queuedFiles.value.push(...valid)
}

function onFileInput(e) {
  const files = Array.from(e.target.files)
  e.target.value = ''
  queueFiles(files)
}

function onDrop(event) {
  dragDepth.value = 0
  isDragOver.value = false
  const files = Array.from(event.dataTransfer.files)
  queueFiles(files)
}

async function removeAttachment(attachmentId) {
  try {
    await deleteAttachment(props.panelApp.id, attachmentId)
    attachments.value = attachments.value.filter(a => a.id !== attachmentId)
  } catch (err) {
    toast.error('Error deleting attachment: ' + getErrorMessage(err))
  }
}

const newNoteStage = ref('interested')
const newNoteContent = ref('')
const editingNoteId = ref(null)
const editingContent = ref('')
const editingStage = ref('')
const editTextarea = ref(null)

const sortedNotes = computed(() => {
  return [...(props.panelApp?.notes || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))
})

async function addNote() {
  const content = newNoteContent.value?.trim()
  if (!content) return
  try {
    await createNote(props.panelApp.id, { stage: newNoteStage.value, content })
    newNoteContent.value = ''
    emit('saved')
  } catch (err) {
    toast.error('Error adding note: ' + getErrorMessage(err))
  }
}

async function removeNote(noteId) {
  if (pendingDeleteNoteId.value !== noteId) {
    pendingDeleteNoteId.value = noteId
    return
  }
  pendingDeleteNoteId.value = null
  try {
    await deleteNote(props.panelApp.id, noteId)
    emit('saved')
  } catch (err) {
    toast.error('Error deleting note: ' + getErrorMessage(err))
  }
}

function startEdit(note) {
  editingNoteId.value = note.id
  editingContent.value = note.content
  editingStage.value = note.stage
  nextTick(() => { editTextarea.value?.focus() })
}

async function saveEdit(noteId) {
  const content = editingContent.value?.trim()
  if (!content || editingNoteId.value !== noteId) return
  const note = props.panelApp?.notes?.find(n => n.id === noteId)
  if (note && content === note.content && editingStage.value === note.stage) {
    cancelEdit()
    return
  }
  editingNoteId.value = null
  try {
    await updateNote(props.panelApp.id, noteId, { content, stage: editingStage.value })
    emit('saved')
  } catch (err) {
    toast.error('Error updating note: ' + getErrorMessage(err))
  }
}

function cancelEdit() {
  editingNoteId.value = null
  editingContent.value = ''
  editingStage.value = ''
}



function fileTypeMeta(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'pdf') return { color: 'text-danger', label: 'PDF' }
  if (['doc', 'docx'].includes(ext)) return { style: 'color: var(--stage-applied)', label: 'DOC' }
  if (ext === 'txt') return { color: 'text-ink-3', label: 'TXT' }
  if (ext === 'md') return { color: 'text-ink-3', label: 'MD' }
  return { color: 'text-ink-3', label: ext ? ext.toUpperCase().slice(0, 4) : 'FILE' }
}
</script>

<style scoped>
.prose :deep(p) { margin: 0 0 0.25rem; }
.prose :deep(p:last-child) { margin-bottom: 0; }
.prose :deep(ul), .prose :deep(ol) { margin: 0.25rem 0 0.25rem 1.25rem; padding: 0; }
.prose :deep(li) { margin: 0; }
.prose :deep(h1), .prose :deep(h2), .prose :deep(h3) { font-weight: 600; margin: 0.25rem 0; }
.prose :deep(code) { background: var(--sunken); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.85em; }
.prose :deep(pre) { background: var(--sunken); padding: 0.5rem; border-radius: 6px; overflow-x: auto; margin: 0.25rem 0; }
.prose :deep(pre code) { background: none; padding: 0; }
.prose :deep(blockquote) { background: var(--sunken); border-radius: 4px; margin: 0.25rem 0; padding: 0.35rem 0.75rem; color: var(--ink-2); font-style: italic; }
.prose :deep(a) { color: var(--accent); text-decoration: underline; }
.prose :deep(strong) { font-weight: 600; }
.prose :deep(em) { font-style: italic; }
.prose :deep(table) { width: 100%; border-collapse: collapse; margin: 0.25rem 0; font-size: 0.85em; }
.prose :deep(th), .prose :deep(td) { border: 1px solid var(--line); padding: 0.25rem 0.5rem; text-align: left; }
.prose :deep(th) { background: var(--sunken); font-weight: 600; color: var(--ink); }
.prose :deep(td) { color: var(--ink-2); }
.prose :deep(tr:nth-child(even) td) { background: var(--sunken); }
details > summary::-webkit-details-marker { display: none; }
</style>
