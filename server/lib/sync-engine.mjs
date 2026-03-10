import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { watch } from 'chokidar';
import matter from 'gray-matter';
import yaml from 'js-yaml';

const VALID_STATUSES = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'];

const DATE_FIELDS = ['interested_at', 'applied_at', 'screening_at', 'interview_at', 'offer_at', 'closed_at'];
const READONLY_FIELDS = ['id', 'created_at', 'updated_at'];
const EDITABLE_FRONTMATTER_FIELDS = [
  'company_name', 'role_title', 'job_posting_url', 'company_website_url',
  'salary_min', 'salary_max', 'job_location',
  ...DATE_FIELDS,
];
const TEXT_FILE_MAP = {
  'job-description.md': 'job_description',
  'interview-notes.md': 'interview_notes',
  'prep-work.md': 'prep_work',
};

// Status display names for notes.md headers
const STATUS_DISPLAY = {
  interested: 'Interested', applied: 'Applied', screening: 'Screening',
  interview: 'Interview', offer: 'Offer', accepted: 'Accepted', rejected: 'Rejected',
};
const DISPLAY_TO_STATUS = Object.fromEntries(
  Object.entries(STATUS_DISPLAY).map(([k, v]) => [v.toLowerCase(), k])
);

function sha256(content) {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

function sanitizeDirName(str) {
  return str.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, '-').toLowerCase();
}

function parseDirName(dirName) {
  const idx = dirName.indexOf('--');
  if (idx === -1) return null;
  return { company: dirName.slice(0, idx), role: dirName.slice(idx + 2) };
}

function safeMatter(content) {
  return matter(content, {
    engines: {
      yaml: {
        parse: (str) => yaml.load(str, { schema: yaml.JSON_SCHEMA }) || {},
        stringify: (obj) => yaml.dump(obj, { schema: yaml.JSON_SCHEMA, lineWidth: -1 }),
      },
    },
  });
}

function readFileNoFollow(filePath) {
  const fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const buf = fs.readFileSync(fd);
    return buf.toString('utf-8');
  } finally {
    fs.closeSync(fd);
  }
}

export class SyncEngine {
  constructor({ apiBase, userEmail, syncDir, authToken }) {
    this.apiBase = apiBase.replace(/\/$/, '');
    this.userEmail = userEmail;
    this.syncDir = path.resolve(syncDir);
    this.authToken = authToken;

    // State
    this.appIdByDir = new Map();   // dirPath -> appId
    this.dirByAppId = new Map();   // appId -> dirPath
    this.lastWrittenHashes = new Map(); // filePath -> sha256
    this.lastKnownFrontmatter = new Map(); // dirPath -> parsed frontmatter object
    this.pendingChanges = new Map(); // filePath -> timeout
    this.watcher = null;
    this.pollTimer = null;
    this.syncing = false;
    this.debounceMs = 500;
    this.pollIntervalMs = 30000;
  }

  // --- HTTP helpers ---

  headers() {
    return {
      'X-Forwarded-Email': this.userEmail,
      'X-Internal-Auth-Token': this.authToken,
      'Content-Type': 'application/json',
    };
  }

  async apiFetch(urlPath, opts = {}) {
    const url = `${this.apiBase}${urlPath}`;
    const res = await fetch(url, { ...opts, headers: { ...this.headers(), ...opts.headers } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API ${opts.method || 'GET'} ${urlPath} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  async apiUpload(urlPath, filePath, originalFilename) {
    const { FormData, File } = await import('node:buffer').then(() => import('undici')).catch(() => {
      // Node 18+ has global fetch but FormData/File might need undici
      return { FormData: globalThis.FormData, File: globalThis.File };
    });
    const fileData = fs.readFileSync(filePath);
    const formData = new FormData();
    const file = new File([fileData], originalFilename);
    formData.append('files', file);
    const url = `${this.apiBase}${urlPath}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Forwarded-Email': this.userEmail,
        'X-Internal-Auth-Token': this.authToken,
      },
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`API upload ${urlPath} failed (${res.status}): ${text}`);
    }
    return res.json();
  }

  // --- Lifecycle ---

  async start() {
    console.log('[sync] Starting sync engine...');
    console.log(`[sync] Sync dir: ${this.syncDir}`);
    console.log(`[sync] API base: ${this.apiBase}`);
    console.log(`[sync] User: ${this.userEmail}`);

    // Ensure status directories exist
    fs.mkdirSync(this.syncDir, { recursive: true });
    for (const status of VALID_STATUSES) {
      fs.mkdirSync(path.join(this.syncDir, status), { recursive: true });
    }

    // Full sync before starting watcher
    await this.fullSync();

    // Write _README.md
    this.writeReadme();

    // Start watching
    this.startWatcher();

    // Start polling
    this.pollTimer = setInterval(() => this.pollForChanges(), this.pollIntervalMs);

    console.log('[sync] Sync engine started');
  }

  stop() {
    console.log('[sync] Stopping sync engine...');
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    for (const timer of this.pendingChanges.values()) {
      clearTimeout(timer);
    }
    this.pendingChanges.clear();
    console.log('[sync] Sync engine stopped');
  }

  // --- API → Files ---

  async fullSync() {
    this.syncing = true;
    try {
      console.log('[sync] Running full sync (API → files)...');
      const apps = await this.apiFetch('/applications');
      const attachmentsByApp = new Map();

      // Fetch attachments for each app
      await Promise.all(apps.map(async (app) => {
        try {
          const attachments = await this.apiFetch(`/applications/${app.id}/attachments`);
          attachmentsByApp.set(app.id, attachments);
        } catch (e) {
          console.warn(`[sync] Failed to fetch attachments for app ${app.id}: ${e.message}`);
          attachmentsByApp.set(app.id, []);
        }
      }));

      const apiAppIds = new Set(apps.map(a => a.id));

      // Build/update directory tree
      for (const app of apps) {
        const attachments = attachmentsByApp.get(app.id) || [];
        this.writeAppToDir(app, attachments);
      }

      // Remove directories for apps no longer in API
      this.removeStaleDirectories(apiAppIds);

      console.log(`[sync] Full sync complete: ${apps.length} applications`);
    } finally {
      this.syncing = false;
    }
  }

  async pollForChanges() {
    if (this.syncing) return;
    try {
      await this.fullSync();
    } catch (e) {
      console.error(`[sync] Poll error: ${e.message}`);
    }
  }

  writeAppToDir(app, attachments) {
    const company = sanitizeDirName(app.company_name);
    const role = sanitizeDirName(app.role_title);
    const dirName = `${company}--${role}`;
    const dirPath = path.join(this.syncDir, app.status, dirName);

    // If app moved status, remove old directory
    const oldDir = this.dirByAppId.get(app.id);
    if (oldDir && oldDir !== dirPath) {
      if (fs.existsSync(oldDir)) {
        fs.rmSync(oldDir, { recursive: true, force: true });
      }
      this.appIdByDir.delete(oldDir);
      // Clean hashes for old dir
      for (const key of this.lastWrittenHashes.keys()) {
        if (key.startsWith(oldDir)) this.lastWrittenHashes.delete(key);
      }
      this.lastKnownFrontmatter.delete(oldDir);
    }

    fs.mkdirSync(dirPath, { recursive: true });
    fs.mkdirSync(path.join(dirPath, 'files'), { recursive: true });

    // Update mappings
    this.appIdByDir.set(dirPath, app.id);
    this.dirByAppId.set(app.id, dirPath);

    // Write details.md
    const frontmatter = {
      id: app.id,
      company_name: app.company_name,
      role_title: app.role_title,
      job_posting_url: app.job_posting_url || null,
      company_website_url: app.company_website_url || null,
      salary_min: app.salary_min || null,
      salary_max: app.salary_max || null,
      job_location: app.job_location || null,
    };
    for (const df of DATE_FIELDS) {
      frontmatter[df] = app[df] || null;
    }
    frontmatter.created_at = app.created_at;
    frontmatter.updated_at = app.updated_at;

    const detailsContent = matter.stringify('', frontmatter);
    this.writeFromApi(path.join(dirPath, 'details.md'), detailsContent);
    this.lastKnownFrontmatter.set(dirPath, { ...frontmatter });

    // Write text field files
    for (const [filename, field] of Object.entries(TEXT_FILE_MAP)) {
      const content = app[field] || '';
      this.writeFromApi(path.join(dirPath, filename), content);
    }

    // Write notes.md
    const notesContent = this.buildNotesContent(app.notes || []);
    this.writeFromApi(path.join(dirPath, 'notes.md'), notesContent);

    // Sync attachments in files/
    this.syncAttachmentFiles(dirPath, app.id, attachments);
  }

  buildNotesContent(notes) {
    if (!notes || notes.length === 0) return '';
    const byStage = {};
    for (const note of notes) {
      const display = STATUS_DISPLAY[note.stage] || note.stage;
      (byStage[display] ||= []).push(note.content);
    }
    const sections = [];
    for (const [stage, contents] of Object.entries(byStage)) {
      sections.push(`## ${stage}\n\n${contents.join('\n\n')}`);
    }
    return sections.join('\n\n') + '\n';
  }

  syncAttachmentFiles(dirPath, appId, attachments) {
    const filesDir = path.join(dirPath, 'files');
    const expectedFiles = new Set();

    for (const att of attachments) {
      expectedFiles.add(att.original_filename);
      const filePath = path.join(filesDir, att.original_filename);
      // Download attachment if not present
      if (!fs.existsSync(filePath)) {
        this.downloadAttachment(appId, att.id, filePath).catch(e => {
          console.warn(`[sync] Failed to download attachment ${att.original_filename}: ${e.message}`);
        });
      }
    }

    // Remove files not in API (but don't remove files that are being uploaded)
    if (fs.existsSync(filesDir)) {
      for (const filename of fs.readdirSync(filesDir)) {
        if (!expectedFiles.has(filename)) {
          const filePath = path.join(filesDir, filename);
          fs.unlinkSync(filePath);
          this.lastWrittenHashes.delete(filePath);
        }
      }
    }
  }

  async downloadAttachment(appId, attachmentId, destPath) {
    const url = `${this.apiBase}/applications/${appId}/attachments/${attachmentId}`;
    const res = await fetch(url, {
      headers: {
        'X-Forwarded-Email': this.userEmail,
        'X-Internal-Auth-Token': this.authToken,
      },
    });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    this.lastWrittenHashes.set(destPath, sha256(buf.toString('utf-8')));
  }

  writeFromApi(filePath, content) {
    const hash = sha256(content);
    // Skip write if content hasn't changed
    if (fs.existsSync(filePath)) {
      try {
        const existing = readFileNoFollow(filePath);
        if (sha256(existing) === hash) {
          this.lastWrittenHashes.set(filePath, hash);
          return;
        }
      } catch {}
    }
    fs.writeFileSync(filePath, content);
    this.lastWrittenHashes.set(filePath, hash);
  }

  removeStaleDirectories(apiAppIds) {
    for (const status of VALID_STATUSES) {
      const statusDir = path.join(this.syncDir, status);
      if (!fs.existsSync(statusDir)) continue;
      for (const entry of fs.readdirSync(statusDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dirPath = path.join(statusDir, entry.name);
        const detailsPath = path.join(dirPath, 'details.md');
        if (!fs.existsSync(detailsPath)) continue; // new dir, let watcher handle
        try {
          const content = readFileNoFollow(detailsPath);
          const { data } = safeMatter(content);
          if (data.id && !apiAppIds.has(data.id)) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            this.appIdByDir.delete(dirPath);
            this.dirByAppId.delete(data.id);
            console.log(`[sync] Removed stale directory: ${entry.name} (id: ${data.id})`);
          }
        } catch {}
      }
    }
  }

  writeReadme() {
    const content = `# Job Tracker - SMB Share

This directory is managed by the Job Tracker sync engine.
Applications are organized by status: ${VALID_STATUSES.join(', ')}.

## Directory Structure

Each application is a folder named \`company--role\` inside a status folder.

\`\`\`
interested/google--senior-swe/
  details.md          - YAML frontmatter with structured fields
  job-description.md  - Job description text
  interview-notes.md  - Interview notes
  prep-work.md        - Preparation work
  notes.md            - Stage notes (## headers per stage)
  files/              - File attachments
\`\`\`

## Editing

- Edit any .md file and changes sync to the web UI within seconds.
- Create a new application: \`mkdir interested/company--role\`
- Add attachments: copy files into the \`files/\` folder
- Moving or deleting folders is ignored (use the web UI for status changes).

## details.md Fields

Editable: company_name, role_title, job_posting_url, company_website_url,
salary_min, salary_max, job_location, and all date fields.

Read-only: id, created_at, updated_at (changes ignored).
`;
    this.writeFromApi(path.join(this.syncDir, '_README.md'), content);
  }

  // --- Files → API (chokidar) ---

  startWatcher() {
    this.watcher = watch(this.syncDir, {
      persistent: true,
      ignoreInitial: true,
      depth: 4,
      followSymlinks: false,
      ignored: [
        /(^|[/\\])\./,
        /~$/,
        /\.tmp$/,
        /~\$.*/,
        /Thumbs\.db$/,
        /desktop\.ini$/,
        /\.swp$/,
        /\.~lock\..*/,
        /_README\.md$/,
      ],
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 300,
      },
    });

    this.watcher.on('change', (filePath) => this.debouncedHandle('change', filePath));
    this.watcher.on('add', (filePath) => this.debouncedHandle('add', filePath));
    this.watcher.on('addDir', (dirPath) => this.debouncedHandle('addDir', dirPath));
    this.watcher.on('unlink', (filePath) => this.debouncedHandle('unlink', filePath));
    this.watcher.on('error', (err) => console.error('[sync] Watcher error:', err));

    console.log('[sync] File watcher started');
  }

  debouncedHandle(event, filePath) {
    if (this.syncing) return;
    const key = `${event}:${filePath}`;
    if (this.pendingChanges.has(key)) {
      clearTimeout(this.pendingChanges.get(key));
    }
    this.pendingChanges.set(key, setTimeout(() => {
      this.pendingChanges.delete(key);
      this.handleFileChange(event, filePath).catch(e => {
        console.error(`[sync] Error handling ${event} ${filePath}: ${e.message}`);
      });
    }, this.debounceMs));
  }

  async handleFileChange(event, filePath) {
    // Path canonicalization
    let realPath;
    try {
      if (event === 'unlink' || event === 'unlinkDir') {
        realPath = filePath; // file is gone, can't realpath
      } else {
        realPath = fs.realpathSync(filePath);
        const syncRoot = fs.realpathSync(this.syncDir);
        if (!realPath.startsWith(syncRoot + path.sep) && realPath !== syncRoot) {
          console.warn(`[sync] Path traversal blocked: ${filePath}`);
          return;
        }
      }
    } catch (e) {
      console.warn(`[sync] Could not resolve path ${filePath}: ${e.message}`);
      return;
    }

    const relPath = path.relative(this.syncDir, realPath || filePath);
    const parts = relPath.split(path.sep);

    // Handle mkdir in status folder → create new application
    if (event === 'addDir' && parts.length === 2 && VALID_STATUSES.includes(parts[0])) {
      await this.handleNewAppDir(parts[0], parts[1], path.join(this.syncDir, relPath));
      return;
    }

    // Only process file events from here
    if (event === 'addDir') return;

    // Need at least status/company--role/filename
    if (parts.length < 3) return;

    const status = parts[0];
    if (!VALID_STATUSES.includes(status)) return;

    const appDirName = parts[1];
    const appDir = path.join(this.syncDir, status, appDirName);
    const appId = this.appIdByDir.get(appDir);
    const filename = parts[parts.length - 1];
    const subdir = parts.length > 3 ? parts[2] : null;

    // Handle file in files/ subdirectory
    if (subdir === 'files') {
      if (event === 'add') {
        if (!appId) return;
        if (this.shouldSkipSync(realPath)) return;
        await this.handleAttachmentAdd(appId, realPath, filename);
      } else if (event === 'unlink') {
        if (!appId) return;
        await this.handleAttachmentDelete(appId, filename);
      }
      return;
    }

    // Handle file changes in app directory
    if (event === 'unlink') return; // ignore file deletes (except in files/)

    if (!appId) {
      // If details.md appears in a dir we don't know about yet, it might be a new app
      if (filename === 'details.md') {
        // Wait for mkdir handler or next poll
      }
      return;
    }

    if (this.shouldSkipSync(realPath)) return;

    if (filename === 'details.md') {
      await this.handleDetailsChange(appId, appDir, realPath);
    } else if (TEXT_FILE_MAP[filename]) {
      await this.handleTextFileChange(appId, TEXT_FILE_MAP[filename], realPath);
    } else if (filename === 'notes.md') {
      await this.handleNotesChange(appId, realPath);
    }
  }

  shouldSkipSync(filePath) {
    try {
      const content = readFileNoFollow(filePath);
      const hash = sha256(content);
      return this.lastWrittenHashes.get(filePath) === hash;
    } catch {
      return false;
    }
  }

  async handleNewAppDir(status, dirName, dirPath) {
    // Check if this directory is already tracked
    if (this.appIdByDir.has(dirPath)) return;

    const parsed = parseDirName(dirName);
    if (!parsed) {
      console.warn(`[sync] Invalid directory name (need company--role): ${dirName}`);
      return;
    }

    console.log(`[sync] New application directory: ${status}/${dirName}`);
    try {
      const app = await this.apiFetch('/applications', {
        method: 'POST',
        body: JSON.stringify({
          company_name: parsed.company,
          role_title: parsed.role,
          status,
        }),
      });
      this.appIdByDir.set(dirPath, app.id);
      this.dirByAppId.set(app.id, dirPath);

      // Write initial files
      this.writeAppToDir(app, []);
      console.log(`[sync] Created application ${app.id}: ${parsed.company} -- ${parsed.role}`);
    } catch (e) {
      console.error(`[sync] Failed to create application from mkdir: ${e.message}`);
    }
  }

  async handleDetailsChange(appId, appDir, filePath) {
    try {
      const content = readFileNoFollow(filePath);
      const { data } = safeMatter(content);

      const lastKnown = this.lastKnownFrontmatter.get(appDir) || {};

      // Split changes into regular fields and date fields
      const updates = {};
      const dateUpdates = {};

      for (const field of EDITABLE_FRONTMATTER_FIELDS) {
        if (data[field] === undefined) continue;
        const newVal = data[field];
        const oldVal = lastKnown[field];
        if (JSON.stringify(newVal) === JSON.stringify(oldVal)) continue;

        if (DATE_FIELDS.includes(field)) {
          dateUpdates[field] = newVal;
        } else {
          updates[field] = newVal;
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.apiFetch(`/applications/${appId}`, {
          method: 'PUT',
          body: JSON.stringify(updates),
        });
        console.log(`[sync] Updated app ${appId} fields: ${Object.keys(updates).join(', ')}`);
      }

      if (Object.keys(dateUpdates).length > 0) {
        await this.apiFetch(`/applications/${appId}/dates`, {
          method: 'PATCH',
          body: JSON.stringify(dateUpdates),
        });
        console.log(`[sync] Updated app ${appId} dates: ${Object.keys(dateUpdates).join(', ')}`);
      }

      // Update last known state
      this.lastKnownFrontmatter.set(appDir, { ...lastKnown, ...data });
      this.lastWrittenHashes.set(filePath, sha256(content));
    } catch (e) {
      console.error(`[sync] Failed to sync details.md for app ${appId}: ${e.message}`);
    }
  }

  async handleTextFileChange(appId, field, filePath) {
    try {
      const content = readFileNoFollow(filePath);
      await this.apiFetch(`/applications/${appId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: content }),
      });
      this.lastWrittenHashes.set(filePath, sha256(content));
      console.log(`[sync] Updated app ${appId} field: ${field}`);
    } catch (e) {
      console.error(`[sync] Failed to sync ${field} for app ${appId}: ${e.message}`);
    }
  }

  async handleNotesChange(appId, filePath) {
    try {
      const content = readFileNoFollow(filePath);
      const sections = this.parseNotesContent(content);

      // Get current notes from API
      const app = await this.apiFetch(`/applications/${appId}`);
      const existingNotes = app.notes || [];

      // Group existing notes by stage (take first note per stage for flat model)
      const noteByStage = {};
      for (const note of existingNotes) {
        if (!noteByStage[note.stage]) noteByStage[note.stage] = note;
      }

      // Sync each section
      for (const [stage, sectionContent] of Object.entries(sections)) {
        const trimmed = sectionContent.trim();
        const existing = noteByStage[stage];

        if (existing) {
          if (existing.content.trim() !== trimmed && trimmed) {
            await this.apiFetch(`/applications/${appId}/notes/${existing.id}`, {
              method: 'PUT',
              body: JSON.stringify({ content: trimmed, stage }),
            });
            console.log(`[sync] Updated note for app ${appId}, stage: ${stage}`);
          } else if (!trimmed) {
            await this.apiFetch(`/applications/${appId}/notes/${existing.id}`, {
              method: 'DELETE',
            });
            console.log(`[sync] Deleted empty note for app ${appId}, stage: ${stage}`);
          }
          delete noteByStage[stage];
        } else if (trimmed) {
          await this.apiFetch(`/applications/${appId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ stage, content: trimmed }),
          });
          console.log(`[sync] Created note for app ${appId}, stage: ${stage}`);
        }
      }

      this.lastWrittenHashes.set(filePath, sha256(content));
    } catch (e) {
      console.error(`[sync] Failed to sync notes for app ${appId}: ${e.message}`);
    }
  }

  parseNotesContent(content) {
    const sections = {};
    let currentStage = null;
    let currentContent = [];

    for (const line of content.split('\n')) {
      const headerMatch = line.match(/^## (.+)$/);
      if (headerMatch) {
        if (currentStage) {
          sections[currentStage] = currentContent.join('\n');
        }
        const stageName = headerMatch[1].trim().toLowerCase();
        currentStage = DISPLAY_TO_STATUS[stageName] || null;
        currentContent = [];
      } else if (currentStage) {
        currentContent.push(line);
      }
    }
    if (currentStage) {
      sections[currentStage] = currentContent.join('\n');
    }

    return sections;
  }

  async handleAttachmentAdd(appId, filePath, filename) {
    try {
      await this.apiUpload(`/applications/${appId}/attachments`, filePath, filename);
      this.lastWrittenHashes.set(filePath, sha256(fs.readFileSync(filePath, 'utf-8').toString()));
      console.log(`[sync] Uploaded attachment ${filename} for app ${appId}`);
    } catch (e) {
      console.error(`[sync] Failed to upload attachment ${filename}: ${e.message}`);
    }
  }

  async handleAttachmentDelete(appId, filename) {
    try {
      const attachments = await this.apiFetch(`/applications/${appId}/attachments`);
      const match = attachments.find(a => a.original_filename === filename);
      if (match) {
        await this.apiFetch(`/applications/${appId}/attachments/${match.id}`, {
          method: 'DELETE',
        });
        console.log(`[sync] Deleted attachment ${filename} for app ${appId}`);
      }
    } catch (e) {
      console.error(`[sync] Failed to delete attachment ${filename}: ${e.message}`);
    }
  }
}
