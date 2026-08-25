import axios from 'axios'

const api = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kb_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('kb_token')
      localStorage.removeItem('kb_user')
      // don't redirect if already on login
      if (!window.location.pathname.includes('/login')) {
        // window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api

// helpers
export const authApi = {
  signup: (data:any) => api.post('/api/auth/signup', data).then(r=>r.data),
  login: (data:any) => api.post('/api/auth/login', data).then(r=>r.data),
  google: (credential:string) => api.post('/api/auth/google', { credential }).then(r=>r.data),
  me: () => api.get('/api/auth/me').then(r=>r.data),
  logout: () => api.post('/api/auth/logout').then(r=>r.data),
}

export const usersApi = {
  search: (q:string) => api.get(`/api/users/search?q=${encodeURIComponent(q)}`).then(r=>r.data),
  getByUsername: (u:string) => api.get(`/api/users/${u}`).then(r=>r.data),
  updateMe: (data:any) => api.patch('/api/users/me', data).then(r=>r.data),
}

export const convApi = {
  list: (search?:string, opts?:{include_archived?:boolean, filter?:string}) => {
    const q=new URLSearchParams()
    if (search) q.set('search', search)
    if (opts?.include_archived) q.set('include_archived','true')
    if (opts?.filter) q.set('filter', opts.filter)
    const s=q.toString()
    return api.get(`/api/conversations${s?`?${s}`:''}`).then(r=>r.data)
  },
  create: (data:any) => api.post('/api/conversations', data).then(r=>r.data),
  get: (id:number) => api.get(`/api/conversations/${id}`).then(r=>r.data),
  delete: (id:number) => api.delete(`/api/conversations/${id}`).then(r=>r.data),
  markRead: (id:number, lastId?:number) => api.post(`/api/conversations/${id}/read`, { last_message_id: lastId }).then(r=>r.data),
  markUnread: (id:number) => api.post(`/api/conversations/${id}/unread`).then(r=>r.data),
  updateGroup: (id:number, data:any) => api.patch(`/api/conversations/groups/${id}`, data).then(r=>r.data),
  addMembers: (id:number, data:any) => api.post(`/api/conversations/groups/${id}/members`, data).then(r=>r.data),
  removeMember: (cid:number, uid:number) => api.delete(`/api/conversations/groups/${cid}/members/${uid}`).then(r=>r.data),
  pin: (id:number, pinned?:boolean) => api.post(`/api/conversations/${id}/pin`, {pinned}).then(r=>r.data),
  archive: (id:number, archived?:boolean) => api.post(`/api/conversations/${id}/archive`, {archived}).then(r=>r.data),
}

export const msgApi = {
  list: (cid:number, params:any={}) => {
    const q = new URLSearchParams()
    if (params.before) q.set('before', params.before)
    if (params.limit) q.set('limit', params.limit)
    if (params.search) q.set('search', params.search)
    return api.get(`/api/conversations/${cid}/messages?${q.toString()}`).then(r=>r.data)
  },
  send: (cid:number, data:any) => api.post(`/api/conversations/${cid}/messages`, data).then(r=>r.data),
  edit: (mid:number, content:string) => api.patch(`/api/messages/${mid}`, { content }).then(r=>r.data),
  delete: (mid:number) => api.delete(`/api/messages/${mid}`).then(r=>r.data),
  react: (mid:number, emoji:string) => api.post(`/api/messages/${mid}/reactions`, { emoji }).then(r=>r.data),
  removeReaction: (mid:number, emoji:string) => api.delete(`/api/messages/${mid}/reactions?emoji=${encodeURIComponent(emoji)}`).then(r=>r.data),
  search: (q:string, cid?:number) => api.get(`/api/messages/search?q=${encodeURIComponent(q)}${cid?`&conversation_id=${cid}`:''}`).then(r=>r.data),
}

export const uploadApi = {
  upload: (file:File, onProgress?:(p:number)=>void, signal?:AbortSignal) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/uploads', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      signal,
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
      }
    }).then(r=>r.data)
  },
  avatar: (file:File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/uploads/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r=>r.data)
  }
}

export const savedApi = {
  list: () => api.get('/api/saved-messages').then(r=>r.data),
  save: (mid:number) => api.post(`/api/saved-messages/${mid}`).then(r=>r.data),
  unsave: (mid:number) => api.delete(`/api/saved-messages/${mid}`).then(r=>r.data),
}

export const callsApi = {
  history: () => api.get('/api/calls/history').then(r=>r.data),
  start: (data:any) => api.post('/api/calls/start', data).then(r=>r.data),
  end: (id:number, status?:string) => api.post(`/api/calls/${id}/end`, {status}).then(r=>r.data),
  accept: (id:number) => api.post(`/api/calls/${id}/accept`).then(r=>r.data),
  reject: (id:number) => api.post(`/api/calls/${id}/reject`).then(r=>r.data),
  turn: () => api.get('/api/calls/turn').then(r=>r.data),
}

export const settingsApi = {
  get: () => api.get('/api/settings').then(r=>r.data),
  update: (data:any) => api.patch('/api/settings', data).then(r=>r.data),
  sessions: () => api.get('/api/settings/sessions').then(r=>r.data),
}

export const extendedApi = {
  forward: (mid:number, cids:number[]) => api.post(`/api/messages/${mid}/forward`, { conversation_ids: cids }).then(r=>r.data),
  clear: (cid:number) => api.post(`/api/conversations/${cid}/clear`).then(r=>r.data),
  exportChat: (cid:number, format:'json'|'txt'='json') => {
    if (format==='txt') return api.get(`/api/conversations/${cid}/export?format=txt`, { responseType: 'blob' }).then(r=>r.data)
    return api.get(`/api/conversations/${cid}/export?format=json`).then(r=>r.data)
  },
  mute: (cid:number, muted:boolean) => api.post(`/api/conversations/${cid}/mute`, { muted }).then(r=>r.data),
  contacts: () => api.get('/api/contacts').then(r=>r.data),
  markNotificationsRead: () => api.post('/api/notifications/mark-read').then(r=>r.data),
  changePassword: (current:string, next:string) => api.patch('/api/users/me/password', { current_password: current, new_password: next }).then(r=>r.data),
}

export const statusApi = {
  feed: () => api.get('/api/status/feed').then(r=>r.data),
  my: () => api.get('/api/status/my').then(r=>r.data),
  create: (data:FormData) => api.post('/api/status', data, { headers: {'Content-Type':'multipart/form-data'}}).then(r=>r.data),
  createMedia: (data:FormData) => api.post('/api/status/with-media', data, { headers: {'Content-Type':'multipart/form-data'}}).then(r=>r.data),
  del: (id:number) => api.delete(`/api/status/${id}`).then(r=>r.data),
  view: (id:number) => api.post(`/api/status/${id}/view`).then(r=>r.data),
  viewers: (id:number) => api.get(`/api/status/${id}/viewers`).then(r=>r.data),
  highlights: {
    list: () => api.get('/api/status/highlights').then(r=>r.data),
    create: (title:string) => api.post('/api/status/highlights', {title}).then(r=>r.data),
    addItem: (hid:number, sid:number) => api.post(`/api/status/highlights/${hid}/items`, {status_id:sid}).then(r=>r.data),
    removeItem: (hid:number, sid:number) => api.delete(`/api/status/highlights/${hid}/items/${sid}`).then(r=>r.data),
    delete: (hid:number) => api.delete(`/api/status/highlights/${hid}`).then(r=>r.data),
  },
}

export const pollApi = {
  list: (cid:number) => api.get(`/api/conversations/${cid}/polls`).then(r=>r.data),
  create: (cid:number, data:any) => api.post(`/api/conversations/${cid}/polls`, data).then(r=>r.data),
  vote: (pid:number, optionIds:number[]) => api.post(`/api/polls/${pid}/vote`, {option_ids:optionIds}).then(r=>r.data),
  delete: (pid:number) => api.delete(`/api/polls/${pid}`).then(r=>r.data),
}

export const msgPinApi = {
  pin: (mid:number) => api.post(`/api/messages/${mid}/pin`).then(r=>r.data),
  unpin: (mid:number) => api.post(`/api/messages/${mid}/unpin`).then(r=>r.data),
  list: (cid:number) => api.get(`/api/conversations/${cid}/pinned`).then(r=>r.data),
}

export const linkPreviewApi = {
  fetch: (url:string) => api.post('/api/link-preview', {url}).then(r=>r.data),
}

export const profileStatusApi = {
  set: (status_message:string, expires_in?:string) => api.post('/api/users/me/status', {status_message, expires_in}).then(r=>r.data),
}

export const favoriteApi = {
  toggle: (userId:number) => api.post(`/api/contacts/${userId}/favorite`).then(r=>r.data),
  list: () => api.get('/api/contacts/favorites').then(r=>r.data),
}

export const eventApi = {
  list: (cid:number) => api.get(`/api/conversations/${cid}/events`).then(r=>r.data),
  create: (cid:number, data:any) => api.post(`/api/conversations/${cid}/events`, data).then(r=>r.data),
  respond: (eid:number, response:string) => api.post(`/api/events/${eid}/respond`, {response}).then(r=>r.data),
  delete: (eid:number) => api.delete(`/api/events/${eid}`).then(r=>r.data),
}

export const scheduledApi = {
  list: (cid:number) => api.get(`/api/conversations/${cid}/scheduled`).then(r=>r.data),
  create: (cid:number, data:any) => api.post(`/api/conversations/${cid}/scheduled`, data).then(r=>r.data),
  update: (id:number, data:any) => api.patch(`/api/scheduled/${id}`, data).then(r=>r.data),
  cancel: (id:number) => api.delete(`/api/scheduled/${id}`).then(r=>r.data),
}

export const notifSettingsApi = {
  get: () => api.get('/api/notification-settings').then(r=>r.data),
  update: (data:any) => api.post('/api/notification-settings', data).then(r=>r.data),
  delete: (id:number) => api.delete(`/api/notification-settings/${id}`).then(r=>r.data),
}

export const sessionsApi = {
  list: () => api.get('/api/sessions').then(r=>r.data),
  markCurrent: (data:any) => api.post('/api/sessions/current', data).then(r=>r.data),
  logoutOthers: () => api.post('/api/sessions/logout-others').then(r=>r.data),
  remove: (id:number) => api.delete(`/api/sessions/${id}`).then(r=>r.data),
}

export const stickerApi = {
  packs: () => api.get('/api/sticker-packs').then(r=>r.data),
  recent: () => api.get('/api/stickers/recent').then(r=>r.data),
  use: (id:number) => api.post(`/api/stickers/${id}/use`).then(r=>r.data),
  toggleFavorite: (id:number) => api.post(`/api/stickers/${id}/favorite`).then(r=>r.data),
}

export const insightsApi = {
  chat: (cid:number) => api.get(`/api/conversations/${cid}/insights`).then(r=>r.data),
}

export const storageApi = {
  dashboard: () => api.get('/api/storage').then(r=>r.data),
}

export const privacyApi = {
  get: () => api.get('/api/privacy').then(r=>r.data),
  update: (data:any) => api.patch('/api/privacy', data).then(r=>r.data),
}

export const recentlyContactedApi = {
  list: () => api.get('/api/recently-contacted').then(r=>r.data),
}

export const aiApi = {
  chat: (message: string, history?: {role:string;content:string}[]) =>
    api.post('/api/ai/chat', { message, history }).then(r=>r.data),
  action: (code: string, language: string, action: string, instruction?: string) =>
    api.post('/api/ai/action', { code, language, action, instruction }).then(r=>r.data),
  summarize: (text: string) =>
    api.post('/api/ai/summarize', { message: text }).then(r=>r.data),
  translate: (text: string) =>
    api.post('/api/ai/translate', { message: text }).then(r=>r.data),
  analyzeFile: (file: File, question?: string) => {
    const fd = new FormData()
    fd.append('file', file)
    if (question) fd.append('question', question)
    return api.post('/api/ai/analyze', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r=>r.data)
  },
  transcribe: (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/api/ai/transcribe', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r=>r.data)
  },
  smartSearch: (query: string) =>
    api.post('/api/ai/smart-search', { message: query }).then(r=>r.data),
}
