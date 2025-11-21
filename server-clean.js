// Clean SQLite-backed server for todo-app (use this when server.js is problematic)
const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'tasks.db')
const AUTH_SECRET = process.env.AUTH_SECRET || 'change-this-secret'

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function openDb(){
  ensureDataDir()
  const db = new sqlite3.Database(DB_FILE)
  // Reduce contention: enable WAL and set a busy timeout so writers wait instead of failing immediately
  try{
    db.run('PRAGMA journal_mode = WAL')
    db.run('PRAGMA busy_timeout = 5000')
  }catch(e){ /* ignore if pragmas fail */ }
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      completed INTEGER,
      date TEXT,
      createdAt TEXT,
      lastModified TEXT
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE,
      passwordHash TEXT,
      createdAt TEXT
    )`)
  })
  return db
}

function runAsync(db, sql, params=[]){
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err){ if(err) reject(err); else resolve(this) })
  })
}

function allAsync(db, sql, params=[]){
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => { if(err) reject(err); else resolve(rows) })
  })
}

app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))

app.get('/api/ping', (req, res) => res.json({ ok: true }))

// DB info endpoint: returns DB path and whether file exists
app.get('/api/dbinfo', (req, res) => {
  ensureDataDir()
  res.json({ dbFile: DB_FILE, exists: fs.existsSync(DB_FILE) })
})

// Download DB file for backup (no auth) - careful when exposing on public hosts
app.get('/api/db/download', (req, res) => {
  ensureDataDir()
  if(!fs.existsSync(DB_FILE)) return res.status(404).json({ error: 'no-db' })
  res.download(DB_FILE, 'tasks.db')
})

app.get('/api/tasks', async (req, res) => {
  const date = req.query.date
  const db = openDb()
  try{
    let rows
    if(date) rows = await allAsync(db, 'SELECT * FROM tasks WHERE date = ? ORDER BY createdAt DESC', [date])
    else rows = await allAsync(db, 'SELECT * FROM tasks ORDER BY createdAt DESC')
    rows = rows.map(r => ({ ...r, completed: !!r.completed }))
    res.json(rows)
  }catch(e){ console.error(e); res.status(500).json({ error: 'read-failed' }) } finally { db.close() }
})

app.post('/api/tasks', async (req, res) => {
  const t = req.body
  if(!t || !t.id) return res.status(400).json({ error: 'task with id required' })
  const db = openDb()
  try{ await runAsync(db, 'INSERT OR REPLACE INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()]); res.status(201).json(t) }catch(e){ console.error(e); res.status(500).json({ error: 'write-failed' }) } finally { db.close() }
})

app.put('/api/tasks/:id', async (req, res) => {
  const id = req.params.id
  const body = req.body
  const db = openDb()
  try{
    const rows = await allAsync(db, 'SELECT * FROM tasks WHERE id = ?', [id])
    if(!rows || rows.length === 0) return res.status(404).json({ error: 'not found' })
    const existing = rows[0]
    const updated = Object.assign({}, existing, body)
    await runAsync(db, 'UPDATE tasks SET title=?, completed=?, date=?, createdAt=?, lastModified=? WHERE id=?', [updated.title || '', updated.completed ? 1 : 0, updated.date || '', updated.createdAt || existing.createdAt, updated.lastModified || new Date().toISOString(), id])
    res.json(updated)
  }catch(e){ console.error(e); res.status(500).json({ error: 'update-failed' }) } finally { db.close() }
})

app.delete('/api/tasks/:id', async (req, res) => { const id = req.params.id; const db = openDb(); try{ await runAsync(db, 'DELETE FROM tasks WHERE id = ?', [id]); res.json({ deleted: 1 }) }catch(e){ console.error(e); res.status(500).json({ error: 'delete-failed' }) } finally { db.close() } })

app.post('/api/sync', async (req, res) => {
  const arr = req.body
  if(!Array.isArray(arr)) return res.status(400).json({ error: 'expected array' })
  const db = openDb()
  try{
    await runAsync(db, 'BEGIN TRANSACTION')
    await runAsync(db, 'DELETE FROM tasks')
    // insert sequentially with awaited runs to avoid finalizing/prepared-statement races
    for(const t of arr){
      await runAsync(db, 'INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()])
    }
    await runAsync(db, 'COMMIT')
    res.json({ ok: true })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'sync-failed' }) } finally { db.close() }
})

// --- Authentication endpoints ---
function signToken(user){
  return jwt.sign({ userId: user.id, username: user.username }, AUTH_SECRET, { expiresIn: '7d' })
}

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {}
  if(!username || !password) return res.status(400).json({ error: 'username and password required' })
  const db = openDb()
  try{
    const id = Date.now().toString()
    const hash = bcrypt.hashSync(password, 8)
    await runAsync(db, 'INSERT INTO users (id, username, passwordHash, createdAt) VALUES (?,?,?,?)', [id, username, hash, new Date().toISOString()])
    const token = signToken({ id, username })
    res.json({ ok: true, token })
  }catch(e){ console.error(e); if(e && e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'user-exists' }); res.status(500).json({ error: 'register-failed' }) } finally { db.close() }
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  if(!username || !password) return res.status(400).json({ error: 'username and password required' })
  const db = openDb()
  try{
    const rows = await allAsync(db, 'SELECT * FROM users WHERE username = ?', [username])
    if(!rows || rows.length === 0) return res.status(401).json({ error: 'invalid' })
    const user = rows[0]
    const ok = bcrypt.compareSync(password, user.passwordHash)
    if(!ok) return res.status(401).json({ error: 'invalid' })
    const token = signToken({ id: user.id, username: user.username })
    res.json({ ok: true, token })
  }catch(e){ console.error(e); res.status(500).json({ error: 'login-failed' }) } finally { db.close() }
})

// public endpoint: are there any users registered?
app.get('/api/auth/exists', async (req, res) => {
  const db = openDb()
  try{
    const rows = await allAsync(db, 'SELECT COUNT(1) as c FROM users')
    const count = rows && rows[0] ? rows[0].c : 0
    res.json({ exists: !!count })
  }catch(e){ console.error(e); res.status(500).json({ error: 'failed' }) } finally { db.close() }
})

function requireAuth(req, res, next){
  const hdr = req.headers['authorization'] || ''
  const m = hdr.match(/^Bearer (.+)$/)
  if(!m) return res.status(401).json({ error: 'unauthenticated' })
  const token = m[1]
  try{
    const decoded = jwt.verify(token, AUTH_SECRET)
    req.user = decoded
    next()
  }catch(e){ return res.status(401).json({ error: 'invalid-token' }) }
}

// protect sensitive endpoints
app.post('/api/sync', requireAuth)
app.post('/api/migrate-json', requireAuth)
app.get('/api/dbinfo', requireAuth)
app.get('/api/db/download', requireAuth)

app.post('/api/migrate-json', async (req, res) => {
  const jsonFile = path.join(DATA_DIR, 'tasks.json')
  if(!fs.existsSync(jsonFile)) return res.status(404).json({ error: 'no json to migrate' })
  const raw = fs.readFileSync(jsonFile, 'utf8')
  let arr = []
  try{ arr = JSON.parse(raw) }catch(e){ return res.status(400).json({ error: 'invalid json' }) }
  const db = openDb()
  try{
    await runAsync(db, 'BEGIN TRANSACTION')
    await runAsync(db, 'DELETE FROM tasks')
    for(const t of arr){
      await runAsync(db, 'INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()])
    }
    await runAsync(db, 'COMMIT')
    res.json({ migrated: arr.length })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'migrate-failed' }) } finally { db.close() }
})

app.listen(PORT, () => console.log(`Server (SQLite) listening on http://localhost:${PORT}, DB: ${DB_FILE}`))
