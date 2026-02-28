'use strict';

// Must be set before any require so db.js uses an in-memory database
process.env.DB_PATH = ':memory:';

const { test, before, describe } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const app = require('../app');

const req = supertest(app);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createApp(overrides = {}) {
  const res = await req
    .post('/api/applications')
    .field('company_name', overrides.company_name ?? 'Acme Corp')
    .field('role_title', overrides.role_title ?? 'Engineer')
    .field('status', overrides.status ?? 'interested');
  assert.equal(res.status, 201);
  return res.body;
}

async function createNote(appId, overrides = {}) {
  const res = await req
    .post(`/api/applications/${appId}/notes`)
    .send({ stage: overrides.stage ?? 'interview', content: overrides.content ?? 'Initial note' });
  assert.equal(res.status, 201);
  return res.body;
}

// ---------------------------------------------------------------------------
// /api/me
// ---------------------------------------------------------------------------

describe('GET /api/me', () => {
  test('returns dev user when no auth header is present', async () => {
    const res = await req.get('/api/me');
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'dev@localhost');
    assert.equal(res.body.isAdmin, false);
  });

  test('returns email from X-Forwarded-Email header', async () => {
    const res = await req.get('/api/me').set('X-Forwarded-Email', 'alice@example.com');
    assert.equal(res.status, 200);
    assert.equal(res.body.email, 'alice@example.com');
  });
});

// ---------------------------------------------------------------------------
// Applications CRUD
// ---------------------------------------------------------------------------

describe('Applications', () => {
  test('GET /api/applications returns empty list initially', async () => {
    // Use a fresh user email so we don't see apps from other tests
    const res = await req.get('/api/applications').set('X-Forwarded-Email', 'empty@example.com');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, []);
  });

  test('POST /api/applications requires company_name and role_title', async () => {
    const res = await req.post('/api/applications').field('company_name', 'Acme');
    assert.equal(res.status, 400);
    assert.ok(res.body.error);
  });

  test('POST /api/applications creates an application with notes array', async () => {
    const res = await req
      .post('/api/applications')
      .field('company_name', 'Globex')
      .field('role_title', 'Developer');
    assert.equal(res.status, 201);
    assert.equal(res.body.company_name, 'Globex');
    assert.equal(res.body.role_title, 'Developer');
    assert.equal(res.body.status, 'interested');
    assert.equal(res.body.user_email, 'dev@localhost');
  });

  test('GET /api/applications/:id returns the application with notes', async () => {
    const created = await createApp({ company_name: 'Initech', role_title: 'Analyst' });
    const res = await req.get(`/api/applications/${created.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.company_name, 'Initech');
    assert.ok(Array.isArray(res.body.notes), 'notes should be an array');
  });

  test('GET /api/applications/:id returns 404 for unknown id', async () => {
    const res = await req.get('/api/applications/999999');
    assert.equal(res.status, 404);
  });

  test('PUT /api/applications/:id updates fields', async () => {
    const created = await createApp();
    const res = await req
      .put(`/api/applications/${created.id}`)
      .send({ role_title: 'Senior Engineer' });
    assert.equal(res.status, 200);
    assert.equal(res.body.role_title, 'Senior Engineer');
  });

  test('PUT /api/applications/:id with no fields returns 400', async () => {
    const created = await createApp();
    const res = await req.put(`/api/applications/${created.id}`).send({});
    assert.equal(res.status, 400);
  });

  test('DELETE /api/applications/:id removes the application', async () => {
    const created = await createApp();
    const del = await req.delete(`/api/applications/${created.id}`);
    assert.equal(del.status, 200);
    const get = await req.get(`/api/applications/${created.id}`);
    assert.equal(get.status, 404);
  });
});

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

describe('Status changes', () => {
  test('PATCH /api/applications/:id/status updates status and sets date field', async () => {
    const created = await createApp();
    const res = await req
      .patch(`/api/applications/${created.id}/status`)
      .send({ status: 'applied' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'applied');
    assert.ok(res.body.applied_at, 'applied_at should be set');
  });

  test('PATCH /api/applications/:id/status rejects invalid status', async () => {
    const created = await createApp();
    const res = await req
      .patch(`/api/applications/${created.id}/status`)
      .send({ status: 'nope' });
    assert.equal(res.status, 400);
  });

  test('status:interview sets interview_at', async () => {
    const created = await createApp();
    const res = await req
      .patch(`/api/applications/${created.id}/status`)
      .send({ status: 'interview' });
    assert.equal(res.status, 200);
    assert.ok(res.body.interview_at);
  });

  test('status:rejected sets closed_at', async () => {
    const created = await createApp();
    const res = await req
      .patch(`/api/applications/${created.id}/status`)
      .send({ status: 'rejected' });
    assert.equal(res.status, 200);
    assert.ok(res.body.closed_at);
  });
});

// ---------------------------------------------------------------------------
// Date editing
// ---------------------------------------------------------------------------

describe('Date editing', () => {
  test('PATCH /api/applications/:id/dates updates a single date field', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: '2025-06-15T12:00:00.000Z' });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied_at, '2025-06-15T12:00:00.000Z');
  });

  test('PATCH /api/applications/:id/dates updates multiple date fields', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({
        applied_at: '2025-06-10T12:00:00.000Z',
        screening_at: '2025-06-12T12:00:00.000Z',
        interview_at: '2025-06-14T12:00:00.000Z',
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied_at, '2025-06-10T12:00:00.000Z');
    assert.equal(res.body.screening_at, '2025-06-12T12:00:00.000Z');
    assert.equal(res.body.interview_at, '2025-06-14T12:00:00.000Z');
  });

  test('PATCH /api/applications/:id/dates clears a date with null', async () => {
    const app = await createApp();
    // Set a date first
    await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: '2025-06-15T12:00:00.000Z' });
    // Clear it
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied_at, null);
  });

  test('PATCH /api/applications/:id/dates sets updated_at', async () => {
    const app = await createApp();
    await new Promise(r => setTimeout(r, 10));
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ offer_at: '2025-07-01T12:00:00.000Z' });
    assert.equal(res.status, 200);
    assert.ok(res.body.updated_at > app.updated_at, 'updated_at should advance');
  });

  test('PATCH /api/applications/:id/dates rejects invalid date value', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: 'not-a-date' });
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Invalid date'));
  });

  test('PATCH /api/applications/:id/dates rejects non-string non-null value', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: 12345 });
    assert.equal(res.status, 400);
  });

  test('PATCH /api/applications/:id/dates returns 400 with no date fields', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({});
    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('No date fields'));
  });

  test('PATCH /api/applications/:id/dates ignores unknown fields', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: '2025-06-15T12:00:00.000Z', bogus_field: 'ignored' });
    assert.equal(res.status, 200);
    assert.equal(res.body.applied_at, '2025-06-15T12:00:00.000Z');
  });

  test('PATCH /api/applications/:id/dates returns 404 for unknown app', async () => {
    const res = await req
      .patch('/api/applications/999999/dates')
      .send({ applied_at: '2025-06-15T12:00:00.000Z' });
    assert.equal(res.status, 404);
  });

  test('PATCH /api/applications/:id/dates returns 404 for another user app', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .set('X-Forwarded-Email', 'other@example.com')
      .send({ applied_at: '2025-06-15T12:00:00.000Z' });
    assert.equal(res.status, 404);
  });

  test('PATCH /api/applications/:id/dates returns application with notes array', async () => {
    const app = await createApp();
    await createNote(app.id);
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ applied_at: '2025-06-15T12:00:00.000Z' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.notes), 'response should include notes array');
    assert.equal(res.body.notes.length, 1);
  });

  test('PATCH /api/applications/:id/dates supports closed_at', async () => {
    const app = await createApp();
    const res = await req
      .patch(`/api/applications/${app.id}/dates`)
      .send({ closed_at: '2025-08-01T12:00:00.000Z' });
    assert.equal(res.status, 200);
    assert.equal(res.body.closed_at, '2025-08-01T12:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Notes CRUD
// ---------------------------------------------------------------------------

describe('Notes', () => {
  test('POST /api/applications/:id/notes creates a note', async () => {
    const app = await createApp();
    const res = await req
      .post(`/api/applications/${app.id}/notes`)
      .send({ stage: 'interview', content: 'Great conversation' });
    assert.equal(res.status, 201);
    assert.equal(res.body.stage, 'interview');
    assert.equal(res.body.content, 'Great conversation');
    assert.ok(res.body.created_at);
    assert.ok(res.body.updated_at);
  });

  test('POST note sets updated_at equal to created_at', async () => {
    const app = await createApp();
    const note = await createNote(app.id);
    assert.equal(note.created_at, note.updated_at);
  });

  test('POST /api/applications/:id/notes requires stage and content', async () => {
    const app = await createApp();
    const res = await req
      .post(`/api/applications/${app.id}/notes`)
      .send({ stage: 'interview' });
    assert.equal(res.status, 400);
  });

  test('GET /api/applications includes notes array on each application', async () => {
    const email = 'notes-list@example.com';
    const appRes = await req
      .post('/api/applications')
      .set('X-Forwarded-Email', email)
      .field('company_name', 'NotesCo')
      .field('role_title', 'Tester');
    const appId = appRes.body.id;

    await req
      .post(`/api/applications/${appId}/notes`)
      .set('X-Forwarded-Email', email)
      .send({ stage: 'screening', content: '# Markdown heading\n- item 1' });

    const list = await req.get('/api/applications').set('X-Forwarded-Email', email);
    assert.equal(list.status, 200);
    const found = list.body.find(a => a.id === appId);
    assert.ok(found, 'application should be in list');
    assert.equal(found.notes.length, 1);
    assert.equal(found.notes[0].content, '# Markdown heading\n- item 1');
  });

  test('PUT /api/applications/:id/notes/:noteId updates content and stage', async () => {
    const app = await createApp();
    const note = await createNote(app.id, { stage: 'screening', content: 'Old content' });

    const res = await req
      .put(`/api/applications/${app.id}/notes/${note.id}`)
      .send({ content: 'Updated content', stage: 'interview' });
    assert.equal(res.status, 200);
    assert.equal(res.body.content, 'Updated content');
    assert.equal(res.body.stage, 'interview');
  });

  test('PUT note sets updated_at later than created_at', async () => {
    const app = await createApp();
    const note = await createNote(app.id);

    // Small delay to ensure updated_at is strictly later
    await new Promise(r => setTimeout(r, 10));

    const res = await req
      .put(`/api/applications/${app.id}/notes/${note.id}`)
      .send({ content: 'Changed content' });
    assert.equal(res.status, 200);
    assert.ok(res.body.updated_at >= note.created_at, 'updated_at should be >= created_at');
    assert.notEqual(res.body.updated_at, note.created_at);
  });

  test('PUT note requires content', async () => {
    const app = await createApp();
    const note = await createNote(app.id);
    const res = await req
      .put(`/api/applications/${app.id}/notes/${note.id}`)
      .send({ stage: 'offer' });
    assert.equal(res.status, 400);
  });

  test('DELETE /api/applications/:id/notes/:noteId removes the note', async () => {
    const app = await createApp();
    const note = await createNote(app.id);

    const del = await req.delete(`/api/applications/${app.id}/notes/${note.id}`);
    assert.equal(del.status, 200);

    const appRes = await req.get(`/api/applications/${app.id}`);
    assert.equal(appRes.body.notes.length, 0);
  });
});
