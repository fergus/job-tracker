<template>
  <div
    class="fixed inset-0 z-50 outline-none"
    @keydown="handleKeydown"
    tabindex="-1"
    ref="panelRoot"
    role="dialog"
    aria-modal="true"
    aria-label="Settings"
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
      <!-- Panel content (inert when modal is open) -->
      <div :inert="!!newKey" :aria-hidden="newKey ? 'true' : undefined" class="contents">
      <!-- Mobile drag handle -->
      <div class="md:hidden flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden="true">
        <div class="w-8 h-1 bg-line-2 rounded-full"></div>
      </div>

      <!-- Header -->
      <div class="px-5 pt-3 pb-3 border-b border-line shrink-0">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-bold font-condensed tracking-wide text-ink">Settings</h2>
          <button
            @click="requestClose"
            class="size-11 flex items-center justify-center rounded-lg text-ink-3 hover:text-ink hover:bg-sunken transition-colors"
            aria-label="Close settings"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Scrollable body -->
      <div class="flex-1 overflow-y-auto overflow-x-hidden">
        <div class="px-5 py-5 space-y-8">

          <!-- View section -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-3">View</h3>
            <div class="flex flex-col gap-1">
              <button
                v-for="{ id, label } in views"
                :key="id"
                @click="$emit('set-view', id)"
                :class="props.view === id ? 'bg-accent-muted text-ink font-medium' : 'text-ink-2 hover:bg-sunken'"
                class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors"
              >{{ label }}</button>
            </div>
          </section>

          <!-- Display section -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-3">Display</h3>
            <div class="flex items-start gap-3">
              <button
                role="switch"
                :aria-checked="String(props.compactHeader)"
                @click="$emit('toggle-compact')"
                class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
                :class="props.compactHeader ? 'bg-accent' : 'bg-sunken'"
              >
                <span
                  class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition duration-200 ease-in-out"
                  :class="props.compactHeader ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
              <div>
                <p class="text-sm font-medium text-ink">Always use settings</p>
                <p class="text-xs text-ink-3 mt-0.5">Keep header minimal — show controls in this panel</p>
              </div>
            </div>
          </section>

          <!-- Data Scope section (admins only) -->
          <section v-if="props.currentUser?.isAdmin">
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-3">Data Scope</h3>
            <div role="radiogroup" aria-label="Data scope" class="flex bg-sunken rounded-lg p-0.5">
              <button
                @click="$emit('set-show-all', false)"
                :class="!props.showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
                class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px]"
                role="radio"
                :aria-checked="!props.showAllUsers"
              >My Applications</button>
              <button
                @click="$emit('set-show-all', true)"
                :class="props.showAllUsers ? 'bg-panel shadow-xs text-ink' : 'text-ink-3 hover:text-ink-2'"
                class="flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px]"
                role="radio"
                :aria-checked="props.showAllUsers"
              >All Applications</button>
            </div>
          </section>

          <!-- Profile section -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-1">Profile</h3>
            <p id="profile-desc" class="text-xs text-ink-3 mb-4">
              Your candidate profile powers AI-generated documents and advice.
              Agents read this context to tailor resumes, cover letters, and interview prep.
            </p>

            <!-- Loading state -->
            <div v-if="profileLoading" class="space-y-3" aria-label="Loading profile">
              <div class="h-10 bg-sunken rounded-lg animate-pulse"></div>
              <div class="h-10 bg-sunken rounded-lg animate-pulse"></div>
              <div class="h-24 bg-sunken rounded-lg animate-pulse"></div>
            </div>

            <!-- Error state -->
            <div v-else-if="profileLoadError" class="text-sm text-danger py-2">
              {{ profileLoadError }}
            </div>

            <!-- Profile form -->
            <div v-else class="space-y-3">

              <!-- Personal -->
              <div class="border border-line rounded-lg overflow-hidden">
                <button
                  @click="toggleSection('personal')"
                  class="w-full flex items-center justify-between px-4 py-3 bg-sunken/40 hover:bg-sunken/70 transition-colors"
                  :aria-expanded="!collapsedSections.personal"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold font-condensed tracking-wide text-ink">Personal</span>
                    <span v-if="sectionFilled('personal')" class="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                  </div>
                  <svg class="w-4 h-4 text-ink-3 transition-transform duration-200" :class="collapsedSections.personal ? '-rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-opacity duration-200 ease-out"
                  leave-active-class="transition-opacity duration-200 ease-in"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <div v-show="!collapsedSections.personal" class="px-4 py-3 space-y-3">
                    <div>
                      <label for="profile-full-name" class="text-xs font-medium text-ink-2 mb-1 block">Full name</label>
                      <input
                        id="profile-full-name"
                        v-model="profile.full_name"
                        type="text"
                        placeholder="Jane Doe"
                        autocomplete="name"
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label for="profile-location-city" class="text-xs font-medium text-ink-2 mb-1 block">City</label>
                        <input
                          id="profile-location-city"
                          v-model="profile.location_city"
                          type="text"
                          placeholder="e.g. San Francisco"
                          autocomplete="address-level2"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label for="profile-location-country" class="text-xs font-medium text-ink-2 mb-1 block">Country</label>
                        <input
                          id="profile-location-country"
                          v-model="profile.location_country"
                          type="text"
                          placeholder="e.g. United States"
                          autocomplete="country-name"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Targets -->
              <div class="border border-line rounded-lg overflow-hidden">
                <button
                  @click="toggleSection('targets')"
                  class="w-full flex items-center justify-between px-4 py-3 bg-sunken/40 hover:bg-sunken/70 transition-colors"
                  :aria-expanded="!collapsedSections.targets"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold font-condensed tracking-wide text-ink">Targets</span>
                    <span v-if="sectionFilled('targets')" class="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                  </div>
                  <svg class="w-4 h-4 text-ink-3 transition-transform duration-200" :class="collapsedSections.targets ? '-rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-opacity duration-200 ease-out"
                  leave-active-class="transition-opacity duration-200 ease-in"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <div v-show="!collapsedSections.targets" class="px-4 py-3 space-y-3">
                    <div>
                      <label for="profile-target-roles" class="text-xs font-medium text-ink-2 mb-1 block">Target roles</label>
                      <input
                        id="profile-target-roles"
                        v-model="profile.target_roles"
                        type="text"
                        placeholder="e.g. Senior Engineer, Staff Engineer"
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label for="profile-compensation-currency" class="text-xs font-medium text-ink-2 mb-1 block">Currency</label>
                        <input
                          id="profile-compensation-currency"
                          v-model="profile.compensation_currency"
                          type="text"
                          placeholder="e.g. USD"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label for="profile-compensation-target-range" class="text-xs font-medium text-ink-2 mb-1 block">Target range</label>
                        <input
                          id="profile-compensation-target-range"
                          v-model="profile.compensation_target_range"
                          type="text"
                          placeholder="e.g. $150K–200K"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Links -->
              <div class="border border-line rounded-lg overflow-hidden">
                <button
                  @click="toggleSection('links')"
                  class="w-full flex items-center justify-between px-4 py-3 bg-sunken/40 hover:bg-sunken/70 transition-colors"
                  :aria-expanded="!collapsedSections.links"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold font-condensed tracking-wide text-ink">Links</span>
                    <span v-if="sectionFilled('links')" class="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                  </div>
                  <svg class="w-4 h-4 text-ink-3 transition-transform duration-200" :class="collapsedSections.links ? '-rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-opacity duration-200 ease-out"
                  leave-active-class="transition-opacity duration-200 ease-in"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <div v-show="!collapsedSections.links" class="px-4 py-3 space-y-3">
                    <div>
                      <label for="profile-linkedin-url" class="text-xs font-medium text-ink-2 mb-1 block">LinkedIn</label>
                      <input
                        id="profile-linkedin-url"
                        v-model="profile.linkedin_url"
                        type="url"
                        placeholder="https://linkedin.com/in/..."
                        autocomplete="url"
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label for="profile-portfolio-url" class="text-xs font-medium text-ink-2 mb-1 block">Portfolio</label>
                      <input
                        id="profile-portfolio-url"
                        v-model="profile.portfolio_url"
                        type="url"
                        placeholder="https://..."
                        autocomplete="url"
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Agent Tuning -->
              <div class="border border-line rounded-lg overflow-hidden">
                <button
                  @click="toggleSection('agent')"
                  class="w-full flex items-center justify-between px-4 py-3 bg-sunken/40 hover:bg-sunken/70 transition-colors"
                  :aria-expanded="!collapsedSections.agent"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold font-condensed tracking-wide text-ink">Agent Tuning</span>
                    <span v-if="sectionFilled('agent')" class="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                  </div>
                  <svg class="w-4 h-4 text-ink-3 transition-transform duration-200" :class="collapsedSections.agent ? '-rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-opacity duration-200 ease-out"
                  leave-active-class="transition-opacity duration-200 ease-in"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <div v-show="!collapsedSections.agent" class="px-4 py-3 space-y-3">
                    <p class="text-xs text-ink-3">
                      These instructions guide the AI when generating resumes and cover letters for your applications.
                    </p>
                    <div class="grid grid-cols-3 gap-3">
                      <div>
                        <label for="profile-agent-tone" class="text-xs font-medium text-ink-2 mb-1 block">Tone</label>
                        <input
                          id="profile-agent-tone"
                          v-model="profile.agent_tone"
                          type="text"
                          placeholder="e.g. formal"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label for="profile-agent-emphasize" class="text-xs font-medium text-ink-2 mb-1 block">Emphasize</label>
                        <input
                          id="profile-agent-emphasize"
                          v-model="profile.agent_emphasize"
                          type="text"
                          placeholder="e.g. leadership, scale"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label for="profile-agent-avoid" class="text-xs font-medium text-ink-2 mb-1 block">Avoid</label>
                        <input
                          id="profile-agent-avoid"
                          v-model="profile.agent_avoid"
                          type="text"
                          placeholder="e.g. buzzwords"
                          class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Documents -->
              <div class="border border-line rounded-lg overflow-hidden">
                <button
                  @click="toggleSection('documents')"
                  class="w-full flex items-center justify-between px-4 py-3 bg-sunken/40 hover:bg-sunken/70 transition-colors"
                  :aria-expanded="!collapsedSections.documents"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold font-condensed tracking-wide text-ink">Documents</span>
                    <span v-if="sectionFilled('documents')" class="w-1.5 h-1.5 rounded-full bg-success" aria-hidden="true"></span>
                  </div>
                  <svg class="w-4 h-4 text-ink-3 transition-transform duration-200" :class="collapsedSections.documents ? '-rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <Transition
                  enter-active-class="transition-opacity duration-200 ease-out"
                  leave-active-class="transition-opacity duration-200 ease-in"
                  enter-from-class="opacity-0"
                  leave-to-class="opacity-0"
                >
                  <div v-show="!collapsedSections.documents" class="px-4 py-3 space-y-3">
                    <div>
                      <label for="profile-cv-markdown" class="text-xs font-medium text-ink-2 mb-1 block">CV (markdown)</label>
                      <textarea
                        id="profile-cv-markdown"
                        v-model="profile.cv_markdown"
                        rows="6"
                        placeholder="# Your Name

## Experience
..."
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent font-mono"
                      />
                    </div>
                    <div>
                      <label for="profile-career-narrative" class="text-xs font-medium text-ink-2 mb-1 block">Career Narrative</label>
                      <textarea
                        id="profile-career-narrative"
                        v-model="profile.career_narrative"
                        rows="4"
                        placeholder="Your story, superpowers, and what you're looking for next..."
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label for="profile-agent-instructions" class="text-xs font-medium text-ink-2 mb-1 block">Additional Agent Instructions</label>
                      <textarea
                        id="profile-agent-instructions"
                        v-model="profile.agent_instructions"
                        rows="3"
                        placeholder="Always mention my open-source work. Never use the word 'passionate'."
                        class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                  </div>
                </Transition>
              </div>

            </div>
          </section>

          <!-- API Keys section -->
          <section>
            <h3 class="text-sm font-bold font-condensed tracking-wide text-ink-2 uppercase mb-1">API Keys</h3>
            <p class="text-xs text-ink-3 mb-4">
              Use API keys to access the REST API programmatically without the browser login flow.
              Keys are scoped to your account. The raw key is shown once at creation — save it immediately.
            </p>

            <!-- Generate form -->
            <div class="flex gap-2 mb-3">
              <div class="flex-1">
                <label for="key-label" class="sr-only">Key label</label>
                <input
                  id="key-label"
                  v-model="generateLabel"
                  type="text"
                  placeholder="Label (optional)"
                  maxlength="100"
                  autocomplete="off"
                  class="w-full text-sm border border-line bg-raised rounded-lg px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  @keydown.enter="generate"
                />
              </div>
              <button
                ref="generateBtn"
                @click="generate"
                :disabled="isGenerating"
                class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap min-h-[44px]"
              >{{ isGenerating ? 'Generating…' : 'Generate Key' }}</button>
            </div>
            <p v-if="generateError" role="alert" class="text-xs text-danger mb-3">{{ generateError }}</p>

            <!-- Key list states -->
            <div v-if="keysLoading" class="text-sm text-ink-3 py-2">
              Loading API keys…
            </div>
            <div v-else-if="keysLoadError" class="text-sm text-danger py-2">
              {{ keysLoadError }}
            </div>
            <div v-else-if="keys.length === 0" class="text-sm text-ink-3 italic py-2">
              No API keys yet. Generate one to access the API programmatically.
            </div>
            <ul v-else class="space-y-2">
              <li
                v-for="key in keys"
                :key="key.id"
                class="border border-line rounded-lg px-4 py-3"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-ink truncate">{{ key.label || 'Unnamed' }}</p>
                    <p class="text-xs text-ink-3 mt-0.5">
                      Created {{ relativeTime(key.created_at) }} ·
                      {{ key.last_used_at ? `Last used ${relativeTime(key.last_used_at)}` : 'Never used' }}
                    </p>
                  </div>
                  <div class="shrink-0 flex items-center">
                    <!-- Inline revoke confirmation -->
                    <template v-if="confirmRevokeId === key.id">
                      <span class="text-xs text-ink-3 mr-1">Revoke?</span>
                      <button
                        @click="confirmRevoke(key.id)"
                        class="text-xs text-danger hover:text-danger-hover font-medium mr-2 px-2 py-1 rounded"
                      >Yes</button>
                      <button
                        @click="confirmRevokeId = null"
                        class="text-xs text-ink-3 hover:text-ink-2 px-2 py-1 rounded"
                      >Cancel</button>
                    </template>
                    <button
                      v-else
                      @click="confirmRevokeId = key.id"
                      class="text-xs text-ink-3 hover:text-danger transition-colors px-2 py-1 rounded"
                    >Revoke</button>
                  </div>
                </div>
              </li>
            </ul>
          </section>

        </div>
      </div>

      <!-- Global dirty-state footer -->
      <div
        v-if="isDirty"
        class="shrink-0 px-5 py-3 border-t border-line bg-panel flex items-center gap-3"
      >
        <span class="text-xs text-ink-3">You have unsaved changes</span>
        <button
          @click="saveProfile"
          :disabled="isSavingProfile"
          :aria-busy="isSavingProfile"
          class="bg-accent hover:bg-accent-hover disabled:opacity-50 text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
        >{{ isSavingProfile ? 'Saving…' : 'Save Profile' }}</button>
        <span v-if="profileSaved" role="status" aria-live="polite" class="text-xs text-success">Saved</span>
        <span v-if="profileError" role="alert" class="text-xs text-danger">{{ profileError }}</span>
      </div>

      <!-- User footer -->
      <div class="shrink-0 px-5 py-3 border-t border-line">
        <p class="text-xs text-ink-3 truncate">{{ props.currentUser?.email }}</p>
      </div>
      </div>

      <!-- One-time key modal (fixed to viewport) -->
      <div
        v-if="newKey"
        ref="modalRoot"
        class="fixed inset-0 z-[60] bg-panel flex items-center justify-center p-6"
        role="dialog"
        aria-modal="true"
        aria-label="API key generated"
        aria-describedby="modal-desc"
        @keydown="handleModalKeydown"
        @click.stop
      >
        <div class="w-full max-w-sm">
          <div class="text-center mb-4">
            <div class="w-12 h-12 bg-accent-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 class="text-base font-semibold text-ink">API Key Generated</h3>
            <p id="modal-desc" class="text-sm text-ink-3 mt-1">Copy this key now — it won't be shown again.</p>
          </div>

          <div class="bg-raised border border-line rounded-lg p-3 mb-3">
            <code class="text-xs text-ink break-all font-mono">{{ newKey }}</code>
          </div>

          <div aria-live="polite" class="sr-only">{{ copyAnnouncement }}</div>
          <button
            ref="modalCopyBtn"
            @click="copyKey"
            class="w-full mb-2 border border-line hover:bg-raised text-ink-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] flex items-center justify-center gap-2"
          >
            <svg v-if="copied" class="w-4 h-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            {{ copied ? 'Copied' : 'Copy to clipboard' }}
          </button>

          <button
            @click="dismissModal"
            class="w-full bg-accent hover:bg-accent-hover text-accent-fg px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
          >I've saved this key</button>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick, onUnmounted } from 'vue'
import { generateApiKey, listApiKeys, revokeApiKey, fetchProfile, updateProfile } from '../api'

const props = defineProps({
  show: Boolean,
  currentUser: Object,
  showAllUsers: Boolean,
  view: String,
  compactHeader: Boolean,
})
const emit = defineEmits(['close', 'set-show-all', 'set-view', 'toggle-compact'])

const views = [
  { id: 'kanban', label: 'Board' },
  { id: 'timeline', label: 'Timeline' },
]

const panelRoot = ref(null)
const modalRoot = ref(null)
const modalCopyBtn = ref(null)
const generateBtn = ref(null)
const visible = ref(false)

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// ── Dirty state & close guard ───────────────────────────────────────

const isDirty = ref(false)
const originalProfile = ref(null)
let saveTimeout = null

function requestClose() {
  if (isDirty.value) {
    if (confirm('You have unsaved profile changes. Press OK to save and close, or Cancel to keep editing.')) {
      saveProfile().then((saved) => {
        if (saved) emit('close')
      })
    }
  } else {
    emit('close')
  }
}

function handleKeydown(event) {
  // If modal is open, let the modal handler deal with Escape/Tab
  if (newKey.value) return

  if (event.key === 'Escape') {
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

function handleModalKeydown(event) {
  if (event.key === 'Escape') {
    event.stopPropagation()
    dismissModal()
    return
  }
  if (event.key === 'Tab') {
    const focusable = Array.from(modalRoot.value?.querySelectorAll(FOCUSABLE) ?? [])
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

// ── Collapsible sections ────────────────────────────────────────────

const collapsedSections = ref({
  personal: false,
  targets: true,
  links: true,
  agent: true,
  documents: true,
})

const sectionFields = {
  personal: ['full_name', 'location_city', 'location_country'],
  targets: ['target_roles', 'compensation_currency', 'compensation_target_range'],
  links: ['linkedin_url', 'portfolio_url'],
  agent: ['agent_tone', 'agent_emphasize', 'agent_avoid'],
  documents: ['cv_markdown', 'career_narrative', 'agent_instructions'],
}

function toggleSection(key) {
  collapsedSections.value[key] = !collapsedSections.value[key]
}

function sectionFilled(key) {
  return sectionFields[key].some(field => {
    const val = profile.value[field]
    return val && String(val).trim().length > 0
  })
}

// ── API Keys ────────────────────────────────────────────────────────

const keys = ref([])
const newKey = ref(null)
const generateLabel = ref('')
const generateError = ref(null)
const isGenerating = ref(false)
const confirmRevokeId = ref(null)
const copied = ref(false)
const copyAnnouncement = ref('')
const keysLoading = ref(false)
const keysLoadError = ref(null)

// ── Profile ─────────────────────────────────────────────────────────

const profile = ref({
  full_name: '',
  location_city: '',
  location_country: '',
  target_roles: '',
  compensation_currency: '',
  compensation_target_range: '',
  linkedin_url: '',
  portfolio_url: '',
  agent_tone: '',
  agent_emphasize: '',
  agent_avoid: '',
  cv_markdown: '',
  career_narrative: '',
  agent_instructions: '',
})
const isSavingProfile = ref(false)
const profileSaved = ref(false)
const profileError = ref(null)
const profileLoading = ref(false)
const profileLoadError = ref(null)

watch(profile, () => {
  if (originalProfile.value) {
    isDirty.value = Object.keys(profile.value).some(key => {
      return profile.value[key] !== originalProfile.value[key]
    })
  }
}, { deep: true, flush: 'post' })

onMounted(() => {
  panelRoot.value?.focus()
  requestAnimationFrame(() => {
    visible.value = true
  })
  loadKeys()
  loadProfile()
})

onUnmounted(() => {
  if (saveTimeout) clearTimeout(saveTimeout)
})

watch(newKey, (val) => {
  if (val) {
    nextTick(() => {
      modalCopyBtn.value?.focus()
    })
  }
})

async function loadKeys() {
  keysLoading.value = true
  keysLoadError.value = null
  try {
    keys.value = await listApiKeys()
  } catch (err) {
    keysLoadError.value = 'Failed to load API keys. Please try again.'
    keys.value = []
  } finally {
    keysLoading.value = false
  }
}

async function generate() {
  if (isGenerating.value) return
  generateError.value = null
  isGenerating.value = true
  try {
    const res = await generateApiKey(generateLabel.value.trim() || null)
    newKey.value = res.key
    generateLabel.value = ''
    await loadKeys()
  } catch (err) {
    const msg = err?.response?.data?.error
    generateError.value = msg || 'Failed to generate key. Please try again.'
  } finally {
    isGenerating.value = false
  }
}

async function confirmRevoke(id) {
  try {
    await revokeApiKey(id)
    confirmRevokeId.value = null
    await loadKeys()
  } catch (err) {
    generateError.value = 'Failed to revoke key. Please try again.'
    confirmRevokeId.value = null
  }
}

async function copyKey() {
  try {
    await navigator.clipboard.writeText(newKey.value)
    copied.value = true
    copyAnnouncement.value = 'Key copied to clipboard'
  } catch {
    copyAnnouncement.value = 'Copy failed. Select the key and press Ctrl+C.'
  }
}

function dismissModal() {
  newKey.value = null
  copied.value = false
  copyAnnouncement.value = ''
  nextTick(() => {
    generateBtn.value?.focus()
  })
}

async function loadProfile() {
  profileLoading.value = true
  profileLoadError.value = null
  try {
    const data = await fetchProfile()
    Object.keys(profile.value).forEach(key => {
      profile.value[key] = data[key] || ''
    })
    originalProfile.value = JSON.parse(JSON.stringify(profile.value))
    isDirty.value = false
  } catch (err) {
    profileLoadError.value = 'Failed to load profile. Please try again.'
  } finally {
    profileLoading.value = false
  }
}

async function saveProfile() {
  if (isSavingProfile.value) return false
  profileError.value = null
  profileSaved.value = false
  isSavingProfile.value = true
  try {
    const payload = {}
    Object.keys(profile.value).forEach(key => {
      const val = profile.value[key]
      if (val !== '' && val !== null && val !== undefined) {
        payload[key] = val
      } else {
        payload[key] = null
      }
    })
    await updateProfile(payload)
    profileSaved.value = true
    originalProfile.value = JSON.parse(JSON.stringify(profile.value))
    isDirty.value = false
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => { profileSaved.value = false }, 4000)
    return true
  } catch (err) {
    const msg = err?.response?.data?.error
    profileError.value = msg || 'Failed to save profile. Please try again.'
    return false
  } finally {
    isSavingProfile.value = false
  }
}

function relativeTime(isoString) {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
</script>
