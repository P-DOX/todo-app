// Single, clean SQLite-backed server for todo-app
const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'tasks.db')

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function openDb(){
  ensureDataDir()
  const db = new sqlite3.Database(DB_FILE)
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      completed INTEGER,
      date TEXT,
      createdAt TEXT,
      lastModified TEXT
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

// list tasks, optional date filter
app.get('/api/tasks', async (req, res) => {
  const date = req.query.date
  const db = openDb()
  try{
    let rows
    if(date) rows = await allAsync(db, 'SELECT * FROM tasks WHERE date = ? ORDER BY createdAt DESC', [date])
    else rows = await allAsync(db, 'SELECT * FROM tasks ORDER BY createdAt DESC')
    rows = rows.map(r => ({ ...r, completed: !!r.completed }))
    res.json(rows)
  }catch(e){
    console.error(e)
    res.status(500).json({ error: 'read-failed' })
  }finally{ db.close() }
})

// create or replace task
app.post('/api/tasks', async (req, res) => {
  const t = req.body
  if(!t || !t.id) return res.status(400).json({ error: 'task with id required' })
  const db = openDb()
  try{
    await runAsync(db, 'INSERT OR REPLACE INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()])
    res.status(201).json(t)
  }catch(e){ console.error(e); res.status(500).json({ error: 'write-failed' }) } finally { db.close() }
})

// update task
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

// delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const id = req.params.id
  const db = openDb()
  try{
    await runAsync(db, 'DELETE FROM tasks WHERE id = ?', [id])
    res.json({ deleted: 1 })
  }catch(e){ console.error(e); res.status(500).json({ error: 'delete-failed' }) } finally { db.close() }
})

// sync: replace full list (used by client sync)
app.post('/api/sync', async (req, res) => {
  const arr = req.body
  if(!Array.isArray(arr)) return res.status(400).json({ error: 'expected array' })
  const db = openDb()
  try{
    await runAsync(db, 'BEGIN TRANSACTION')
    await runAsync(db, 'DELETE FROM tasks')
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ ok: true })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'sync-failed' }) } finally { db.close() }
})

// migration endpoint (optional): import existing JSON file into DB (one-time)
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
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ migrated: arr.length })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'migrate-failed' }) } finally { db.close() }
})

app.listen(PORT, () => console.log(`Server (SQLite) listening on http://localhost:${PORT}, DB: ${DB_FILE}`))
// Single, clean SQLite-backed server for todo-app
const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'tasks.db')

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function openDb(){
  ensureDataDir()
  const db = new sqlite3.Database(DB_FILE)
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      completed INTEGER,
      date TEXT,
      createdAt TEXT,
      lastModified TEXT
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

// list tasks, optional date filter
app.get('/api/tasks', async (req, res) => {
  const date = req.query.date
  const db = openDb()
  try{
    let rows
    if(date) rows = await allAsync(db, 'SELECT * FROM tasks WHERE date = ? ORDER BY createdAt DESC', [date])
    else rows = await allAsync(db, 'SELECT * FROM tasks ORDER BY createdAt DESC')
    rows = rows.map(r => ({ ...r, completed: !!r.completed }))
    res.json(rows)
  }catch(e){
    console.error(e)
    res.status(500).json({ error: 'read-failed' })
  }finally{ db.close() }
})

// create or replace task
app.post('/api/tasks', async (req, res) => {
  const t = req.body
  if(!t || !t.id) return res.status(400).json({ error: 'task with id required' })
  const db = openDb()
  try{
    await runAsync(db, 'INSERT OR REPLACE INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()])
    res.status(201).json(t)
  }catch(e){ console.error(e); res.status(500).json({ error: 'write-failed' }) } finally { db.close() }
})

// update task
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

// delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const id = req.params.id
  const db = openDb()
  try{
    await runAsync(db, 'DELETE FROM tasks WHERE id = ?', [id])
    res.json({ deleted: 1 })
  }catch(e){ console.error(e); res.status(500).json({ error: 'delete-failed' }) } finally { db.close() }
})

// sync: replace full list (used by client sync)
app.post('/api/sync', async (req, res) => {
  const arr = req.body
  if(!Array.isArray(arr)) return res.status(400).json({ error: 'expected array' })
  const db = openDb()
  try{
    await runAsync(db, 'BEGIN TRANSACTION')
    await runAsync(db, 'DELETE FROM tasks')
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ ok: true })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'sync-failed' }) } finally { db.close() }
})

// migration endpoint (optional): import existing JSON file into DB (one-time)
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
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ migrated: arr.length })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'migrate-failed' }) } finally { db.close() }
})

app.listen(PORT, () => console.log(`Server (SQLite) listening on http://localhost:${PORT}, DB: ${DB_FILE}`))
const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'tasks.db')

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function openDb(){
  ensureDataDir()
  const db = new sqlite3.Database(DB_FILE)
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT,
      completed INTEGER,
      date TEXT,
      createdAt TEXT,
      lastModified TEXT
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

// list tasks, optional date filter
app.get('/api/tasks', async (req, res) => {
  const date = req.query.date
  const db = openDb()
  try{
    let rows
    if(date) rows = await allAsync(db, 'SELECT * FROM tasks WHERE date = ? ORDER BY createdAt DESC', [date])
    else rows = await allAsync(db, 'SELECT * FROM tasks ORDER BY createdAt DESC')
    // convert completed int to boolean
    rows = rows.map(r => ({ ...r, completed: !!r.completed }))
    res.json(rows)
  }catch(e){
    console.error(e)
    res.status(500).json({ error: 'read-failed' })
  }finally{ db.close() }
})

// create task
app.post('/api/tasks', async (req, res) => {
  const t = req.body
  if(!t || !t.id) return res.status(400).json({ error: 'task with id required' })
  const db = openDb()
  try{
    await runAsync(db, 'INSERT OR REPLACE INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)', [t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString()])
    res.status(201).json(t)
  }catch(e){ console.error(e); res.status(500).json({ error: 'write-failed' }) } finally { db.close() }
})

// update task
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

// delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const id = req.params.id
  const db = openDb()
  try{
    await runAsync(db, 'DELETE FROM tasks WHERE id = ?', [id])
    res.json({ deleted: 1 })
  }catch(e){ console.error(e); res.status(500).json({ error: 'delete-failed' }) } finally { db.close() }
})

// sync: replace full list (used by client sync)
app.post('/api/sync', async (req, res) => {
  const arr = req.body
  if(!Array.isArray(arr)) return res.status(400).json({ error: 'expected array' })
  const db = openDb()
  try{
    await runAsync(db, 'BEGIN TRANSACTION')
    await runAsync(db, 'DELETE FROM tasks')
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ ok: true })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'sync-failed' }) } finally { db.close() }
})

// migration endpoint (optional): import existing JSON file into DB (one-time)
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
    const stmt = db.prepare('INSERT INTO tasks (id,title,completed,date,createdAt,lastModified) VALUES (?,?,?,?,?,?)')
    for(const t of arr){
      stmt.run(t.id, t.title || '', t.completed ? 1 : 0, t.date || '', t.createdAt || new Date().toISOString(), t.lastModified || new Date().toISOString())
    }
    stmt.finalize()
    await runAsync(db, 'COMMIT')
    res.json({ migrated: arr.length })
  }catch(e){ console.error(e); await runAsync(db, 'ROLLBACK'); res.status(500).json({ error: 'migrate-failed' }) } finally { db.close() }
})

app.listen(PORT, () => console.log(`Server (SQLite) listening on http://localhost:${PORT}, DB: ${DB_FILE}`))
const express = require('express')
const fs = require('fs')
const path = require('path')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 3000
const DATA_DIR = path.join(__dirname, 'data')
const DATA_FILE = path.join(DATA_DIR, 'tasks.json')

function ensureDataDir(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if(!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8')
}

function readData(){
  ensureDataDir()
  try{
    const raw = fs.readFileSync(DATA_FILE, 'utf8')
    return JSON.parse(raw || '[]')
  }catch(e){
    console.error('Failed to read data file', e)
    return []
  }
}

function writeData(arr){
  ensureDataDir()
  try{
    fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2), 'utf8')
    return true
  }catch(e){
    console.error('Failed to write data file', e)
    return false
  }
}

app.use(cors())
app.use(express.json())

// Serve static site from project root
app.use(express.static(path.join(__dirname)))

app.get('/api/ping', (req, res) => res.json({ ok: true }))

// get tasks (optionally filter by date)
app.get('/api/tasks', (req, res) => {
  const date = req.query.date
  const all = readData()
  if(date) return res.json(all.filter(t => t.date === date))
  res.json(all)
})

// sync: replace full list (convenient for simple clients)
app.post('/api/sync', (req, res) => {
  const payload = req.body
  if(!Array.isArray(payload)) return res.status(400).json({ error: 'expected array' })
  const ok = writeData(payload)
  if(!ok) return res.status(500).json({ error: 'failed to write' })
  res.json({ ok: true })
})

// create a task
app.post('/api/tasks', (req, res) => {
  const t = req.body
  if(!t || !t.id) return res.status(400).json({ error: 'task with id required' })
  const all = readData()
  all.unshift(t)
  writeData(all)
  res.status(201).json(t)
})

// update task
app.put('/api/tasks/:id', (req, res) => {
  const id = req.params.id
  const all = readData()
  const idx = all.findIndex(x => x.id === id)
  if(idx === -1) return res.status(404).json({ error: 'not found' })
  all[idx] = Object.assign(all[idx], req.body)
  writeData(all)
  res.json(all[idx])
})

// delete task
app.delete('/api/tasks/:id', (req, res) => {
  const id = req.params.id
  let all = readData()
  const before = all.length
  all = all.filter(x => x.id !== id)
  writeData(all)
  res.json({ deleted: before - all.length })
})

app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`))
