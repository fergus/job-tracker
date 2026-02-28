import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export function fetchMe() {
  return api.get('/me').then(r => r.data)
}

export function fetchApplications(status, all = false) {
  const params = {}
  if (status) params.status = status
  if (all) params.all = 'true'
  return api.get('/applications', { params }).then(r => r.data)
}

export function fetchApplication(id) {
  return api.get(`/applications/${id}`).then(r => r.data)
}

export function createApplication(formData) {
  return api.post('/applications', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export function updateApplication(id, data) {
  return api.put(`/applications/${id}`, data).then(r => r.data)
}

export function updateStatus(id, status) {
  return api.patch(`/applications/${id}/status`, { status }).then(r => r.data)
}

export function uploadCV(id, file) {
  const formData = new FormData()
  formData.append('cv', file)
  return api.post(`/applications/${id}/cv`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export function getCVUrl(id) {
  return `/api/applications/${id}/cv`
}

export function uploadCoverLetter(id, file) {
  const formData = new FormData()
  formData.append('cover_letter', file)
  return api.post(`/applications/${id}/cover-letter`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }).then(r => r.data)
}

export function getCoverLetterUrl(id) {
  return `/api/applications/${id}/cover-letter`
}

export function createNote(appId, { stage, content }) {
  return api.post(`/applications/${appId}/notes`, { stage, content }).then(r => r.data)
}

export function updateNote(appId, noteId, { content, stage }) {
  return api.put(`/applications/${appId}/notes/${noteId}`, { content, stage }).then(r => r.data)
}

export function deleteNote(appId, noteId) {
  return api.delete(`/applications/${appId}/notes/${noteId}`).then(r => r.data)
}

export function updateDates(id, dates) {
  return api.patch(`/applications/${id}/dates`, dates).then(r => r.data)
}

export function deleteApplication(id) {
  return api.delete(`/applications/${id}`).then(r => r.data)
}
