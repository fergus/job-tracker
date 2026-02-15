import axios from 'axios'

const api = axios.create({
  baseURL: '/api'
})

export function fetchApplications(status) {
  const params = status ? { status } : {}
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

export function deleteApplication(id) {
  return api.delete(`/applications/${id}`).then(r => r.data)
}
