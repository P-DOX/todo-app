// Todo app with per-date tasks and localStorage persistence
const STORAGE_KEY = 'todo.tasks.v1'
let useServer = false

// Tabs support: two independent lists (personal, work) - migrate legacy names
const savedTab = localStorage.getItem('todo.currentTab')
const DEFAULT_TAB = 'personal'
let currentTab = savedTab || DEFAULT_TAB
// migrate legacy saved tab names if user previously had 'gaurav'/'nishu'
if(currentTab === 'gaurav') currentTab = 'personal'
if(currentTab === 'nishu') currentTab = 'work'


const taskForm = document.getElementById('task-form')
const taskInput = document.getElementById('task-input')
const taskList = document.getElementById('task-list')
const filters = document.querySelectorAll('.filter')
const clearBtn = document.getElementById('clear-completed')
const daysContainer = document.getElementById('days')
const monthLabel = document.getElementById('month-label')
const prevMonthBtn = document.getElementById('prev-month')
const nextMonthBtn = document.getElementById('next-month')
const selectedDateLabel = document.getElementById('selected-date-label')
const tabButtons = document.querySelectorAll('.tab')
const weekTabsContainer = document.getElementById('week-tabs')
const prevWeekBtn = document.getElementById('prev-week')
const nextWeekBtn = document.getElementById('next-week')

// Admin defaults elements (admin UI moved to admin.html). We still
// load defaults from localStorage so applyDefaultsForDate() can use them.
const tasksPanel = document.querySelector('.tasks-panel')
const adminDefaultsEl = document.getElementById('admin-defaults')

let tasks = []
let filter = 'all'
// helpers that use local timezone (avoid UTC ISO pitfalls)
function pad(n){ return n.toString().padStart(2,'0') }
function localIso(d){ return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function parseIso(s){ const [y,m,day] = (s||'').split('-').map(Number); return new Date(y, (m||1)-1, day||1) }

let selectedDate = localIso(new Date()) // YYYY-MM-DD (local)
let viewYear = (new Date()).getFullYear()
let viewMonth = (new Date()).getMonth()

function loadTasks(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY)
    tasks = raw ? JSON.parse(raw) : []
  }catch(e){
    tasks = []
  }
  // Normalize legacy tasks (assign tab if missing) and migrate old tab names
  for(const t of tasks){
    if(!t.tab) t.tab = DEFAULT_TAB
    if(t.tab === 'gaurav') t.tab = 'personal'
    if(t.tab === 'nishu') t.tab = 'work'
  }
}

function saveTasks(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  if(useServer){
    // attempt to sync full state to server (best-effort)
    const token = (window.auth && window.auth.getToken && window.auth.getToken()) || localStorage.getItem('todo.auth.token')
    const headers = { 'Content-Type': 'application/json' }
    if(token) headers['Authorization'] = 'Bearer ' + token
    fetch('/api/sync', { method: 'POST', headers, body: JSON.stringify(tasks) })
      .catch(()=>{ /* ignore network errors, keep local copy */ })
  }
}

// Defaults: recurring weekly tasks stored separately
const DEFAULTS_KEY = 'todo.defaults.v1'
let defaults = []

// Default creation window: don't create defaults before Nov 1 of the current year
// and only create defaults up to this many days after today.
const DEFAULTS_MIN_MONTH = 10 // November (0-based month index)
const DEFAULTS_MAX_DAYS_AHEAD = 30 // create defaults up to 30 days ahead

function loadDefaults(){
  try{ const raw = localStorage.getItem(DEFAULTS_KEY); defaults = raw ? JSON.parse(raw) : [] }catch(e){ defaults = [] }
}

function saveDefaults(){
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults))
}

function weekdayName(n){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n] || n }

function renderDefaults(){
  // rendering of defaults is handled on the dedicated admin page
  return
}

// defaults form handling has moved to admin.html / js/admin.js

function checkServerAndSync(){
  // ping server; if available fetch authoritative state and merge carefully
  return fetch('/api/ping').then(r => r.json()).then(() => {
    useServer = true
    return fetch('/api/tasks').then(r => r.json()).then(serverTasks => {
      const localRaw = localStorage.getItem(STORAGE_KEY)
      const localTasks = localRaw ? JSON.parse(localRaw) : []
      // If server has tasks, adopt server as authoritative for now
      if(Array.isArray(serverTasks) && serverTasks.length){
        tasks = serverTasks
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
      } else if(localTasks.length){
        // server empty but local has data: push local to server
        fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(localTasks) }).catch(()=>{})
      } else {
        // both empty: nothing to do (avoid pushing empty array and wiping server)
      }
    })
  }).catch(()=>{ useServer = false })
}

function createTaskElement(task){
  const li = document.createElement('li')
  li.className = 'task-item'
  li.dataset.id = task.id

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = !!task.completed
  checkbox.addEventListener('change', () => toggleCompleted(task.id))

  const label = document.createElement('div')
  label.className = 'task-label'

  const title = document.createElement('span')
  title.className = 'task-title'
  if(task.completed) title.classList.add('completed')
  title.textContent = task.title
  title.tabIndex = 0

  title.addEventListener('dblclick', () => startEdit(task.id, li))
  title.addEventListener('keydown', (e) => { if(e.key === 'Enter') startEdit(task.id, li) })

  label.appendChild(checkbox)
  label.appendChild(title)

  const actions = document.createElement('div')
  actions.className = 'task-actions'

  const editBtn = document.createElement('button')
  editBtn.className = 'icon-btn'
  editBtn.title = 'Edit'
  editBtn.textContent = '✏️'
  editBtn.addEventListener('click', () => startEdit(task.id, li))

  const delBtn = document.createElement('button')
  delBtn.className = 'icon-btn'
  delBtn.title = 'Delete'
  delBtn.textContent = '🗑️'
  delBtn.addEventListener('click', () => deleteTask(task.id))

  actions.appendChild(editBtn)
  actions.appendChild(delBtn)

  li.appendChild(label)
  li.appendChild(actions)
  return li
}

function renderTasks(){
  // reload tasks from storage to avoid stale in-memory state (other tabs or recent sync)
  loadTasks()
  taskList.innerHTML = ''
  const visible = tasks.filter(t => t.tab === currentTab).filter(t => t.date === selectedDate).filter(t => {
    if(filter === 'active') return !t.completed
    if(filter === 'completed') return t.completed
    return true
  })
  visible.forEach(task => taskList.appendChild(createTaskElement(task)))
}

function addTask(title){
  const trimmed = title.trim()
  if(!trimmed) return
  const nowIso = new Date().toISOString()
  const task = { id: Date.now().toString(), title: trimmed, completed: false, date: selectedDate, createdAt: nowIso, lastModified: nowIso, tab: currentTab }
  tasks.unshift(task)
  saveTasks()
  renderTasks()
  renderCalendar(viewYear, viewMonth)
  if(typeof renderWeekTabs === 'function') renderWeekTabs()
}

function toggleCompleted(id){
  const t = tasks.find(x => x.id === id)
  if(!t) return
  t.completed = !t.completed
  t.lastModified = new Date().toISOString()
  saveTasks()
  renderTasks()
  renderCalendar(viewYear, viewMonth)
  if(typeof renderWeekTabs === 'function') renderWeekTabs()
}

function deleteTask(id){
  tasks = tasks.filter(x => x.id !== id)
  saveTasks()
  renderTasks()
  renderCalendar(viewYear, viewMonth)
  if(typeof renderWeekTabs === 'function') renderWeekTabs()
}

function startEdit(id, li){
  const t = tasks.find(x => x.id === id)
  if(!t) return
  li.innerHTML = ''

  const input = document.createElement('input')
  input.className = 'edit-input'
  input.value = t.title
  li.appendChild(input)

  input.focus()
  input.select()

  function commit(){
    const val = input.value.trim()
    if(val) t.title = val
    else tasks = tasks.filter(x => x.id !== id)
    t.lastModified = new Date().toISOString()
    saveTasks()
    renderTasks()
    renderCalendar(viewYear, viewMonth)
    if(typeof renderWeekTabs === 'function') renderWeekTabs()
  }

  input.addEventListener('blur', commit)
  input.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') commit()
    if(e.key === 'Escape') renderTasks()
  })
}

function clearCompleted(){
  // clear completed for selected date only
  tasks = tasks.filter(x => !(x.date === selectedDate && x.completed))
  saveTasks()
  renderTasks()
  renderCalendar(viewYear, viewMonth)
  if(typeof renderWeekTabs === 'function') renderWeekTabs()
}

// Remove tasks older than retentionDays (rolling window)
const RETENTION_DAYS = 365
function cleanupOldTasks(){
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS)
  const before = tasks.length
  tasks = tasks.filter(t => {
    try{
      const d = parseIso(t.date)
      if(isNaN(d)) return true
      return d >= cutoff
    }catch(e){
      return true
    }
  })
  return tasks.length !== before
}

// Event handlers
taskForm.addEventListener('submit', (e) => {
  e.preventDefault()
  addTask(taskInput.value)
  taskInput.value = ''
  taskInput.focus()
})

filters.forEach(btn => btn.addEventListener('click', () => {
  filters.forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  filter = btn.dataset.filter
  renderTasks()
}))

clearBtn.addEventListener('click', clearCompleted)

// init
// Calendar and date logic
function formatMonthLabel(year, month){
  const d = new Date(year, month, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

function startOfMonth(year, month){ return new Date(year, month, 1) }

function renderCalendar(year, month){
  // ensure we have the latest tasks before computing heatmap/counts
  loadTasks()
  monthLabel.textContent = formatMonthLabel(year, month)
  daysContainer.innerHTML = ''
  const first = startOfMonth(year, month)
  const startDay = first.getDay() // 0..6
  const daysInMonth = new Date(year, month+1, 0).getDate()

  // Ensure defaults are applied for the visible calendar grid (pre-create default tasks)
  // Compute the grid start (beginning Sunday) and end (end Saturday) for the month view
  const gridStart = new Date(year, month, 1)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())
  const last = new Date(year, month, daysInMonth)
  const gridEnd = new Date(last)
  gridEnd.setDate(gridEnd.getDate() + (6 - last.getDay()))
  // iterate days and apply defaults for each date in visible grid
  for(let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)){
    try{ applyDefaultsForDate(isoDate(d)) }catch(e){ /* ignore */ }
  }

  // previous month's tail
  const prevMonthLastDate = new Date(year, month, 0).getDate()
  for(let i = startDay - 1; i >= 0; i--){
    const d = prevMonthLastDate - i
    const date = new Date(year, month-1, d)
    const el = renderDayCell(date, true)
    daysContainer.appendChild(el)
  }

  // current month days
  for(let d=1; d<=daysInMonth; d++){
    const date = new Date(year, month, d)
    const el = renderDayCell(date, false)
    daysContainer.appendChild(el)
  }

  // fill to complete grid (optional)
  while(daysContainer.children.length % 7 !== 0){
    const day = new Date(year, month+1, 1).getDate() // placeholder
    const el = document.createElement('div')
    el.className = 'day other-month'
    el.textContent = ''
    daysContainer.appendChild(el)
  }
}

// Weekly tabs rendering and navigation
let weekStartDate = (function(){
  // start of the week (Sunday) for currently selectedDate (use local parse)
  const d = parseIso(selectedDate)
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  start.setHours(0,0,0,0)
  return start
})()

// week tabs interaction helpers: init pointer-drag scrolling and centering
let _weekTabsInit = false
function initWeekTabsInteractions(){
  if(_weekTabsInit) return
  _weekTabsInit = true
  if(!weekTabsContainer) return
  // pointer drag to scroll (desktop + touch)
  let isDown = false, startX = 0, scrollLeft = 0, activePointerId = null
  weekTabsContainer.addEventListener('pointerdown', (e) => {
    isDown = true
    activePointerId = e.pointerId
    weekTabsContainer.setPointerCapture(activePointerId)
    startX = e.clientX
    scrollLeft = weekTabsContainer.scrollLeft
    weekTabsContainer.classList.add('dragging')
  })
  weekTabsContainer.addEventListener('pointermove', (e) => {
    if(!isDown) return
    if(e.pointerId !== activePointerId) return
    const dx = startX - e.clientX
    weekTabsContainer.scrollLeft = scrollLeft + dx
  })
  function release(e){
    if(!isDown) return
    isDown = false
    try{ if(activePointerId != null) weekTabsContainer.releasePointerCapture(activePointerId) }catch(err){}
    activePointerId = null
    weekTabsContainer.classList.remove('dragging')
  }
  weekTabsContainer.addEventListener('pointerup', release)
  weekTabsContainer.addEventListener('pointercancel', release)
  weekTabsContainer.addEventListener('pointerleave', release)

  // ensure keyboard focusable and smooth scroll on focus
  weekTabsContainer.addEventListener('focusin', (e) => {
    if(e.target && e.target.classList && e.target.classList.contains('week-tab')){
      e.target.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'})
    }
  })
}

function formatDayName(date){
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

function formatDayLabel(date){
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function renderWeekTabs(){
  // ensure we have latest tasks (in case of recent save or sync)
  loadTasks()
  weekTabsContainer.innerHTML = ''
  for(let i=0;i<7;i++){
    const d = new Date(weekStartDate)
    d.setDate(weekStartDate.getDate() + i)
    const iso = isoDate(d)
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('role', 'tab')
    btn.tabIndex = 0
    btn.className = 'week-tab' + (iso === selectedDate ? ' active' : '')
    btn.dataset.date = iso
    const dayName = document.createElement('span')
    dayName.className = 'day-name'
    dayName.textContent = formatDayName(d)
    const dayDate = document.createElement('span')
    dayDate.className = 'day-date'
    dayDate.textContent = formatDayLabel(d)
    // show count for current tab
    const count = countTasksForDate(iso)
    if(count){
      const c = document.createElement('div')
      c.className = 'badge'
      c.textContent = `${count}`
      c.title = `${count} task${count>1?'s':''}`
      c.style.marginTop = '6px'
      c.style.fontSize = '0.8rem'
      btn.appendChild(c)
    }
    // apply heat level class
    const lvl = getHeatLevel(iso)
    for(let h=0; h<=4; h++) btn.classList.remove('heat-'+h)
    if(lvl > 0) btn.classList.add('heat-'+lvl)
    btn.appendChild(dayName)
    btn.appendChild(dayDate)
    btn.addEventListener('click', () => {
      selectedDate = iso
      updateSelectedDateLabel()
      // apply defaults for this date and active tab before rendering
      applyDefaultsForDate(selectedDate)
      renderWeekTabs()
      renderCalendar(viewYear, viewMonth)
      renderTasks()
    })
    // also handle keyboard activation for accessibility
    btn.addEventListener('keydown', (e) => {
      if(e.key === 'Enter' || e.key === ' ') btn.click()
    })
    weekTabsContainer.appendChild(btn)
  }
  // init interactions (drag-to-scroll) once and try to center active
  initWeekTabsInteractions()
  // center active tab into view on render (if present)
  const active = weekTabsContainer.querySelector('.week-tab.active')
  if(active){
    try{ active.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'}) }catch(e){}
  }
}

function shiftWeek(days){
  weekStartDate.setDate(weekStartDate.getDate() + days)
  renderWeekTabs()
}

prevWeekBtn.addEventListener('click', () => { shiftWeek(-7) })
nextWeekBtn.addEventListener('click', () => { shiftWeek(7) })


// isoDate now returns local YYYY-MM-DD for a Date object
function isoDate(d){ return localIso(d) }

function countTasksForDate(dateStr){
  return tasks.filter(t => t.tab === currentTab && t.date === dateStr).length
}

function countCompletedForDate(dateStr){
  return tasks.filter(t => t.tab === currentTab && t.date === dateStr && t.completed).length
}

// map completion ratio to a heat level 0..4
function getHeatLevel(dateStr){
  const total = countTasksForDate(dateStr)
  if(total === 0) return 0
  const completed = countCompletedForDate(dateStr)
  const ratio = completed / total
  if(ratio === 0) return 1
  if(ratio <= 0.25) return 1
  if(ratio <= 0.5) return 2
  if(ratio <= 0.75) return 3
  return 4
}

function applyDefaultsForDate(dateStr){
  const d = parseIso(dateStr)
  if(isNaN(d)) return false
  // enforce min date: Nov 1 of the current year
  const now = new Date()
  const minDate = new Date(now.getFullYear(), DEFAULTS_MIN_MONTH, 1)
  // if today is before Nov 1 and the date is in the previous year November, allow it
  // (keep it simple: only allow defaults for dates on/after Nov 1 of the current year)
  if(d < minDate) return false
  // enforce max ahead window
  const maxDate = new Date()
  maxDate.setDate(maxDate.getDate() + DEFAULTS_MAX_DAYS_AHEAD)
  if(d > maxDate) return false
  const wd = d.getDay()
  let added = false
  for(const def of defaults){
    if(def.weekday !== wd) continue
    if(def.tab !== currentTab) continue
    const exists = tasks.some(t => t.tab === currentTab && t.date === dateStr && t.title === def.title)
    if(!exists){
      const nowIso = new Date().toISOString()
      tasks.unshift({ id: Date.now().toString() + Math.random().toString(36).slice(2,6), title: def.title, completed: false, date: dateStr, createdAt: nowIso, lastModified: nowIso, tab: currentTab })
      added = true
    }
  }
  if(added) saveTasks()
  return added
}

function renderDayCell(date, otherMonth){
  const el = document.createElement('div')
  el.className = 'day' + (otherMonth ? ' other-month' : '')
  const dateStr = isoDate(date)
  el.textContent = date.getDate()
  // apply heat level class
  for(let h=0; h<=4; h++) el.classList.remove('heat-'+h)
  const heat = getHeatLevel(dateStr)
  if(heat > 0) el.classList.add('heat-'+heat)
  if(dateStr === selectedDate) el.classList.add('selected')
  if(isoDate(new Date()) === dateStr) el.classList.add('today')
  const count = countTasksForDate(dateStr)
  if(count) {
    const badge = document.createElement('span')
    badge.className = 'badge'
    // compact numeric badge to avoid expanding calendar cells
    badge.textContent = `${count}`
    badge.title = `${count} task${count>1?'s':''}`
    el.appendChild(badge)
  }
  el.addEventListener('click', () => {
    if(otherMonth){
      // navigate to that month
      viewYear = date.getFullYear(); viewMonth = date.getMonth();
      renderCalendar(viewYear, viewMonth)
    }
    selectedDate = dateStr
    updateSelectedDateLabel()
    // ensure defaults exist for this date before rendering
    applyDefaultsForDate(selectedDate)
    renderCalendar(viewYear, viewMonth)
    renderTasks()
  })
  return el
}

function updateSelectedDateLabel(){
  const d = parseIso(selectedDate)
  selectedDateLabel.textContent = `Selected: ${d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} — ${currentTab.charAt(0).toUpperCase() + currentTab.slice(1)}`
}

prevMonthBtn.addEventListener('click', () => { viewMonth--; if(viewMonth<0){ viewMonth=11; viewYear--; } renderCalendar(viewYear, viewMonth) })
nextMonthBtn.addEventListener('click', () => { viewMonth++; if(viewMonth>11){ viewMonth=0; viewYear++; } renderCalendar(viewYear, viewMonth) })

loadTasks()
loadDefaults()
// try enabling server storage if available; best-effort
checkServerAndSync().then(() => {
  // normalize tasks after server sync in case server data lacks tab metadata and migrate legacy names
  for(const t of tasks){
    if(!t.tab) t.tab = DEFAULT_TAB
    if(t.tab === 'gaurav') t.tab = 'personal'
    if(t.tab === 'nishu') t.tab = 'work'
  }
  // after server check, re-run cleanup and render
  if(cleanupOldTasks()) saveTasks()
  renderCalendar(viewYear, viewMonth)
  if(typeof renderWeekTabs === 'function') renderWeekTabs()
  renderTasks()
})

// Listen for changes to defaults made in other tabs (admin page)
window.addEventListener('storage', (e) => {
  if(!e) return
  if(e.key === DEFAULTS_KEY){
    // reload defaults and ensure they are applied for the currently selected date/tab
    loadDefaults()
    // apply defaults for the visible selected date and re-render
    const added = applyDefaultsForDate(selectedDate)
    if(added) renderTasks()
    renderCalendar(viewYear, viewMonth)
    if(typeof renderWeekTabs === 'function') renderWeekTabs()
  }
})
// migrate legacy tasks without date to today
const todayIso = localIso(new Date())
let migrated = false
for(const t of tasks){
  if(!t.date){
    t.date = todayIso
    t.createdAt = t.createdAt || new Date().toISOString()
    t.lastModified = t.lastModified || t.createdAt
    if(!t.tab) t.tab = DEFAULT_TAB
    if(t.tab === 'gaurav') t.tab = 'personal'
    if(t.tab === 'nishu') t.tab = 'work'
    migrated = true
  }
}
if(migrated) saveTasks()

// cleanup tasks older than retention window
if(cleanupOldTasks()) saveTasks()

// seed an example task if none exist for today
if(tasks.filter(t => t.tab === currentTab && t.date === todayIso).length === 0){
  const nowIso = new Date().toISOString()
  tasks.push({ id: Date.now().toString(), title: 'Sample task for today', completed: false, date: todayIso, createdAt: nowIso, lastModified: nowIso, tab: currentTab })
  saveTasks()
}

updateSelectedDateLabel()
renderCalendar(viewYear, viewMonth)
// ensure defaults are applied for the selected date before final render
applyDefaultsForDate(selectedDate)
if(typeof renderWeekTabs === 'function') renderWeekTabs()
renderTasks()

// Tab switching logic
function switchTab(tabId){
  if(!tabId) return
  currentTab = tabId
  localStorage.setItem('todo.currentTab', currentTab)
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab))
  // re-render calendar (counts) and tasks for the selected tab
  // show admin UI if admin tab selected
    // Removed admin UI handling as admin is on a separate page now
  renderCalendar(viewYear, viewMonth)
  renderTasks()
  updateSelectedDateLabel()
}

tabButtons.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)))

// initialize tabs UI state
tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === currentTab))

// show admin UI if current tab is admin

// Helper to show/hide admin UI

// If URL hash is #admin, switch to admin tab on load

// View toggles: hide calendar by default; show when user selects Calendar view
const viewTasksBtn = document.getElementById('view-tasks')
const viewCalendarBtn = document.getElementById('view-calendar')
const appLayout = document.querySelector('.app-layout')
const calendarEl = document.querySelector('.calendar')
const savedView = localStorage.getItem('todo.view') || 'tasks'

function setView(v){
  if(v === 'calendar'){
    viewCalendarBtn.classList.add('active')
    viewTasksBtn.classList.remove('active')
    appLayout.classList.add('show-calendar')
    calendarEl.classList.add('visible')
    // render calendar on demand
    renderCalendar(viewYear, viewMonth)
    if(typeof renderWeekTabs === 'function') renderWeekTabs()
    // on small screens, scroll calendar into view so user sees it immediately
    if(window.innerWidth <= 880){
      setTimeout(()=>{ try{ calendarEl.scrollIntoView({behavior:'smooth', block:'start'}) }catch(e){} }, 60)
    }
  } else {
    viewTasksBtn.classList.add('active')
    viewCalendarBtn.classList.remove('active')
    appLayout.classList.remove('show-calendar')
    calendarEl.classList.remove('visible')
  }
  localStorage.setItem('todo.view', v)
}

viewTasksBtn.addEventListener('click', () => setView('tasks'))
viewCalendarBtn.addEventListener('click', () => setView('calendar'))

// initialize view
setView(savedView)

// Auth UI: show login/register or username + logout; control Admin link visibility
const authArea = document.getElementById('auth-area')
const adminLink = document.getElementById('admin-link')

function updateAuthUI(){
  const user = (window.auth && window.auth.getUser && window.auth.getUser()) || null
    if(user){
    authArea.innerHTML = `<span class="who">${user.username}</span> <button class="logout" id="btn-logout">Logout</button>`
    const btn = document.getElementById('btn-logout')
    if(btn) btn.addEventListener('click', () => {
      window.auth.clearToken();
      updateAuthUI();
      // After logout, redirect to login so the app enforces authentication
      window.location.href = 'login.html'
    })
    if(adminLink) adminLink.classList.remove('hidden')
  } else {
    authArea.innerHTML = `<a href="login.html" id="link-login">Login</a> <a href="register.html" id="link-register">Register</a>`
    if(adminLink) adminLink.classList.add('hidden')
  }
}

updateAuthUI()

// Ensure Admin link prompts login if unauthenticated
const adminLinkEl = document.getElementById('admin-link')
if(adminLinkEl){
  adminLinkEl.addEventListener('click', (e) => {
    const token = (window.auth && window.auth.getToken && window.auth.getToken()) || localStorage.getItem('todo.auth.token')
    if(!token){
      e.preventDefault()
      // send user to login and return to admin after login
      window.location.href = 'login.html?returnTo=admin.html'
    }
  })
}

// Initial auth flow: if no users exist, force registration; else if users exist and no token, force login
async function initialAuthRedirect(){
  try{
    // avoid redirecting when already on login/register pages
    const path = window.location.pathname || ''
    const isLoginPage = path.endsWith('login.html')
    const isRegisterPage = path.endsWith('register.html')
    // query server to see if users exist
    const r = await fetch('/api/auth/exists')
    if(!r.ok) return
    const body = await r.json()
    const usersExist = !!body.exists
    const token = (window.auth && window.auth.getToken && window.auth.getToken()) || localStorage.getItem('todo.auth.token')
    if(!usersExist){
      // no users: send to register unless already there
      if(!isRegisterPage) window.location.href = 'register.html'
      return
    }
    // users exist: require login if not authenticated
    if(usersExist && !token){
      if(!isLoginPage) window.location.href = 'login.html'
      return
    }
  }catch(e){
    // if server unreachable, don't redirect
    return
  }
}

// run initial auth redirect check (non-blocking)
initialAuthRedirect()
