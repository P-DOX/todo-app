// auth helper for login/register and storing token
const loginForm = document.getElementById('login-form')
const registerForm = document.getElementById('register-form')

function saveToken(tok){ localStorage.setItem('todo.auth.token', tok) }
function getToken(){ return localStorage.getItem('todo.auth.token') }
function clearToken(){ localStorage.removeItem('todo.auth.token') }

async function postJson(url, body){
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
  return res
}

if(loginForm){
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('login-username').value.trim()
    const password = document.getElementById('login-password').value
    if(!username || !password) return
    try{
      const r = await postJson('/api/auth/login', { username, password })
      const body = await r.json()
      if(r.ok && body.token){ saveToken(body.token); const params = new URLSearchParams(window.location.search); const rt = params.get('returnTo'); window.location.href = rt ? rt : 'index.html'; }
      else alert('Login failed: ' + (body.error || 'unknown'))
    }catch(e){ alert('Network error') }
  })
}

if(registerForm){
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const username = document.getElementById('reg-username').value.trim()
    const password = document.getElementById('reg-password').value
    if(!username || !password) return
    try{
      const r = await postJson('/api/auth/register', { username, password })
      const body = await r.json()
      if(r.ok && body.token){ saveToken(body.token); const params = new URLSearchParams(window.location.search); const rt = params.get('returnTo'); window.location.href = rt ? rt : 'index.html'; }
      else alert('Register failed: ' + (body.error || 'unknown'))
    }catch(e){ alert('Network error') }
  })
}

// Expose helpers for other scripts
function b64UrlDecode(str){
  // convert from base64url to base64
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  // pad with = to multiple of 4
  while(str.length % 4) str += '='
  try{ return atob(str) }catch(e){ return null }
}

function parseJwt(token){
  try{
    const parts = (token || '').split('.')
    if(parts.length < 2) return null
    const payload = b64UrlDecode(parts[1])
    if(!payload) return null
    // payload is a JSON string
    return JSON.parse(payload)
  }catch(e){ return null }
}

function getUser(){
  const t = getToken()
  if(!t) return null
  const p = parseJwt(t)
  if(!p) return null
  return { username: p.username, userId: p.userId }
}

window.auth = { getToken, saveToken, clearToken, parseJwt, getUser }
