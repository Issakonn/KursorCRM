/**
 * KURSOR — починка базы данных.
 * Запускается автоматически при RUN_DB_FIX=true
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server', 'db', 'kursor.sqlite');
if (!fs.existsSync(DB_PATH)) { console.error('[fix_db] ❌ База не найдена:', DB_PATH); process.exit(1); }

console.log('[fix_db] 📂 База:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

const allTables = () => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const tableExists = (n) => !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${n}'`).get();
const tableSql    = (n) => { const r = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${n}'`).get(); return r ? r.sql : ''; };

console.log('[fix_db] 📋 Таблицы до:', allTables().join(', '));

// ── 1. Почистить все *_old мусорные таблицы ───────────────────────────────────
for (const t of allTables()) {
  if (t.endsWith('_old')) {
    console.log(`[fix_db] 🗑  Удаляю мусор: ${t}`);
    db.exec(`DROP TABLE IF EXISTS ${t}`);
  }
}

// ── 2. Пересоздать users без CHECK(role IN) ───────────────────────────────────
if (tableSql('users').includes('CHECK(role IN')) {
  console.log('[fix_db] ⚠️  users: снимаю CHECK(role)...');
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  const want = ['id','login','password_hash','name','role','age','group_id','languages','teacher_id','avatar_url','created_at'];
  const copy = want.filter(c => cols.includes(c)).join(',');
  db.exec('ALTER TABLE users RENAME TO users_old');
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL, age INTEGER DEFAULT 0,
    group_id INTEGER DEFAULT 0, languages TEXT DEFAULT '[]',
    teacher_id TEXT, avatar_url TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
  )`);
  db.exec(`INSERT INTO users (${copy}) SELECT ${copy} FROM users_old`);
  db.exec('DROP TABLE users_old');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id)');
  console.log('[fix_db] ✅ users: CHECK(role) снят.');
}
try {
  if (!db.prepare('PRAGMA table_info(users)').all().map(c=>c.name).includes('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    console.log('[fix_db] ✅ users: добавлена avatar_url.');
  }
} catch {}

// ── 3. Пересоздать groups без NOT NULL на teacher_id ─────────────────────────
if (/teacher_id\s+TEXT\s+NOT\s+NULL/i.test(tableSql('groups'))) {
  console.log('[fix_db] ⚠️  groups: снимаю NOT NULL с teacher_id...');
  const cols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
  db.exec('ALTER TABLE groups RENAME TO groups_old');
  db.exec(`CREATE TABLE groups (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, course_id TEXT,
    branch_id TEXT NOT NULL, teacher_id TEXT, assistant_id TEXT,
    lesson_kind TEXT NOT NULL DEFAULT 'main' CHECK(lesson_kind IN ('main','extra')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (assistant_id) REFERENCES users(id)
  )`);
  db.exec(`INSERT INTO groups (${cols.join(',')}) SELECT ${cols.join(',')} FROM groups_old`);
  db.exec('DROP TABLE groups_old');
  db.exec('CREATE INDEX IF NOT EXISTS idx_groups_branch  ON groups(branch_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id)');
  console.log('[fix_db] ✅ groups: NOT NULL снят.');
}

// ── 4. КЛЮЧЕВОЙ ФИХ: пересоздать group_members и group_schedule ───────────────
// Когда groups переименовывалась в groups_old, SQLite обновил FK в дочерних
// таблицах — теперь они ссылаются на groups_old (которой нет). 
// Единственный способ починить — пересоздать эти таблицы.

if (tableExists('group_members')) {
  const fkBroken = tableSql('group_members').includes('groups_old');
  if (fkBroken) {
    console.log('[fix_db] ⚠️  group_members: FK сломан (ссылается на groups_old) — пересоздаю...');
  } else {
    console.log('[fix_db] ℹ️  group_members: пересоздаю для надёжности...');
  }
  // Сохраняем данные
  const rows = db.prepare('SELECT * FROM group_members').all();
  db.exec('DROP TABLE group_members');
  db.exec(`CREATE TABLE group_members (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, group_id TEXT NOT NULL,
    since INTEGER NOT NULL, until INTEGER,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gm_student ON group_members(student_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gm_group   ON group_members(group_id)');
  if (rows.length) {
    const ins = db.prepare('INSERT INTO group_members (id,student_id,group_id,since,until) VALUES (?,?,?,?,?)');
    rows.forEach(r => ins.run(r.id, r.student_id, r.group_id, r.since, r.until));
    console.log(`[fix_db] ✅ group_members пересоздана, данные сохранены (${rows.length} строк).`);
  } else {
    console.log('[fix_db] ✅ group_members пересоздана (пустая).');
  }
}

if (tableExists('group_schedule')) {
  const fkBroken = tableSql('group_schedule').includes('groups_old');
  if (fkBroken) {
    console.log('[fix_db] ⚠️  group_schedule: FK сломан (ссылается на groups_old) — пересоздаю...');
  } else {
    console.log('[fix_db] ℹ️  group_schedule: пересоздаю для надёжности...');
  }
  const rows = db.prepare('SELECT * FROM group_schedule').all();
  db.exec('DROP TABLE group_schedule');
  db.exec(`CREATE TABLE group_schedule (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL, duration_min INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gs_group ON group_schedule(group_id)');
  if (rows.length) {
    const ins = db.prepare('INSERT INTO group_schedule (id,group_id,weekday,start_time,duration_min) VALUES (?,?,?,?,?)');
    rows.forEach(r => ins.run(r.id, r.group_id, r.weekday, r.start_time, r.duration_min));
    console.log(`[fix_db] ✅ group_schedule пересоздана, данные сохранены (${rows.length} строк).`);
  } else {
    console.log('[fix_db] ✅ group_schedule пересоздана (пустая).');
  }
}

// ── 5. Создать таблицы если вообще нет ───────────────────────────────────────
if (!tableExists('group_members')) {
  db.exec(`CREATE TABLE group_members (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, group_id TEXT NOT NULL,
    since INTEGER NOT NULL, until INTEGER,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id)   REFERENCES groups(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gm_student ON group_members(student_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gm_group   ON group_members(group_id)');
  console.log('[fix_db] ✅ group_members создана.');
}
if (!tableExists('group_schedule')) {
  db.exec(`CREATE TABLE group_schedule (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL, duration_min INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_gs_group ON group_schedule(group_id)');
  console.log('[fix_db] ✅ group_schedule создана.');
}

db.pragma('foreign_keys = ON');
console.log('[fix_db] 📋 Таблицы после:', allTables().join(', '));
console.log('[fix_db] 🎉 Готово!');
db.close();
