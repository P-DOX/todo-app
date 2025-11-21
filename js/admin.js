// Admin page script to manage default weekly tasks (stored in localStorage)
const DEFAULTS_KEY = 'todo.defaults.v1'

const defaultForm = document.getElementById('default-form')
const defaultWeekday = document.getElementById('default-weekday')
const defaultTitle = document.getElementById('default-title')
const defaultTab = document.getElementById('default-tab')
const defaultsTableBody = document.querySelector('#defaults-table tbody')

let defaults = []

function loadDefaults(){
  try{ const raw = localStorage.getItem(DEFAULTS_KEY); defaults = raw ? JSON.parse(raw) : [] }catch(e){ defaults = [] }
}

function saveDefaults(){
  localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults))
}

function weekdayName(n){ return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][n] || n }

function renderDefaults(){
  defaultsTableBody.innerHTML = ''
  for(const d of defaults){
    const tr = document.createElement('tr')
    const tdDay = document.createElement('td')
    tdDay.textContent = weekdayName(d.weekday)
    const tdTitle = document.createElement('td')
    tdTitle.textContent = d.title
    const tdTab = document.createElement('td')
    tdTab.textContent = d.tab
    const tdAct = document.createElement('td')
    tdAct.className = 'defaults-actions'
    const del = document.createElement('button')
    del.textContent = 'Delete'
    del.addEventListener('click', () => { defaults = defaults.filter(x => x.id !== d.id); saveDefaults(); renderDefaults(); })
    tdAct.appendChild(del)
    tr.appendChild(tdDay); tr.appendChild(tdTitle); tr.appendChild(tdTab); tr.appendChild(tdAct)
    defaultsTableBody.appendChild(tr)
  }
}

if(defaultForm){
  defaultForm.addEventListener('submit', (e) => {
    e.preventDefault()
    const w = Number(defaultWeekday.value)
    const t = defaultTitle.value.trim()
    const tab = defaultTab.value || 'personal'
    if(!t) return
    const id = Date.now().toString()
    defaults.push({ id, weekday: w, title: t, tab })
    saveDefaults()
    renderDefaults()
    defaultTitle.value = ''
  })
}

loadDefaults()
renderDefaults()
