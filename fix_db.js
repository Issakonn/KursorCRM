/**
 * KURSOR — одноразовый скрипт для починки базы данных.
 * Запускай: node fix_db.js
 * или через Railway: RUN_DB_FIX=true (запускается автоматически при старте)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server', 'db', 'kursor.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ База не найдена по пути:', DB_PATH);
  process.exit(1);
}

console.log('[fix_db] 📂 База:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// ── универсальный хелпер: починить/восстановить таблицу из *_old ─────────────
function fixOrphanedOld(baseName, createSql, indexes = []) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const exists    = tables.includes(baseName);
  const existsOld = tables.includes(baseName + '_old');

  if (!exists && existsOld) {
    // Миграция упала после RENAME, до CREATE — восстанавливаем
    console.log(`[fix_db] ⚠️  ${baseName} отсутствует, есть ${baseName}_old — восстанавливаю...`);
    db.exec(`ALTER TABLE ${baseName}_old RENAME TO ${baseName}`);
    console.log(`[fix_db] ✅ ${baseName} восстановлена.`);
  } else if (exists && existsOld) {
    // Миграция упала после CREATE + INSERT, до DROP — удаляем мусор
    console.log(`[fix_db] ⚠️  Найдена ${baseName}_old при живой ${baseName} — удаляю мусор...`);
    db.exec(`DROP TABLE ${baseName}_old`);
    console.log(`[fix_db] ✅ ${baseName}_old удалена.`);
  } else {
    console.log(`[fix_db] ✅ ${baseName}_old не найдена.`);
  }

  // Создать таблицу если её нет вообще
  if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${baseName}'`).get()) {
    console.log(`[fix_db] ⚠️  ${baseName} не существует — создаю...`);
    db.exec(createSql);
    indexes.forEach(idx => db.exec(idx));
    console.log(`[fix_db] ✅ ${baseName} создана.`);
  }
}

// ── Чиним все таблицы которые участвуют в миграциях ──────────────────────────

fixOrphanedOld('users',
  `CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    login         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL,
    age           INTEGER DEFAULT 0,
    group_id      INTEGER DEFAULT 0,
    languages     TEXT DEFAULT '[]',
    teacher_id    TEXT,
    avatar_url    TEXT,
    created_at    INTEGER NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  ['CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role)',
   'CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id)']
);

fixOrphanedOld('tasks',
  `CREATE TABLE tasks (
    id              INTEGER PRIMARY KEY,
    module_id       TEXT NOT NULL,
    type            TEXT NOT NULL CHECK(type IN ('quiz','fill','order','code','project','scratch','blockly','htmlcss','java','cpp')),
    title           TEXT NOT NULL,
    description     TEXT,
    difficulty      INTEGER DEFAULT 1,
    explain         TEXT,
    options         TEXT,
    answer          TEXT,
    items           TEXT,
    expected_output TEXT,
    starter         TEXT,
    stdin           TEXT,
    scratch_project_id TEXT,
    FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
  )`,
  ['CREATE INDEX IF NOT EXISTS idx_tasks_module ON tasks(module_id)']
);

fixOrphanedOld('groups',
  `CREATE TABLE groups (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    course_id     TEXT,
    branch_id     TEXT NOT NULL,
    teacher_id    TEXT,
    assistant_id  TEXT,
    lesson_kind   TEXT NOT NULL DEFAULT 'main' CHECK(lesson_kind IN ('main','extra')),
    status        TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (teacher_id) REFERENCES users(id),
    FOREIGN KEY (assistant_id) REFERENCES users(id)
  )`,
  ['CREATE INDEX IF NOT EXISTS idx_groups_branch  ON groups(branch_id)',
   'CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id)']
);

// ── Доп. миграции ─────────────────────────────────────────────────────────────

// users: снять CHECK(role IN ...) если ещё есть
const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
if (usersSql && usersSql.sql.includes('CHECK(role IN')) {
  console.log('[fix_db] ⚠️  users имеет CHECK(role IN) — мигрирую...');
  const oldCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  const wantCols = ['id','login','password_hash','name','role','age','group_id','languages','teacher_id','avatar_url','created_at'];
  const copyCols = wantCols.filter(c => oldCols.includes(c)).join(',');
  db.exec('ALTER TABLE users RENAME TO users_old');
  db.exec(`CREATE TABLE users (
    id TEXT PRIMARY KEY, login TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    name TEXT NOT NULL, role TEXT NOT NULL, age INTEGER DEFAULT 0,
    group_id INTEGER DEFAULT 0, languages TEXT DEFAULT '[]',
    teacher_id TEXT, avatar_url TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
  )`);
  db.exec(`INSERT INTO users (${copyCols}) SELECT ${copyCols} FROM users_old`);
  db.exec('DROP TABLE users_old');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id)');
  console.log('[fix_db] ✅ users: CHECK(role) снят.');
}

// users: добавить avatar_url если нет
try {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    console.log('[fix_db] ✅ users: добавлена avatar_url.');
  }
} catch {}

// groups: снять NOT NULL с teacher_id если ещё есть
const grpSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='groups'").get();
if (grpSql && /teacher_id\s+TEXT\s+NOT\s+NULL/i.test(grpSql.sql)) {
  console.log('[fix_db] ⚠️  groups.teacher_id NOT NULL — мигрирую...');
  const oldCols = db.prepare('PRAGMA table_info(groups)').all().map(c => c.name);
  const copyCols = oldCols.join(',');
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
  db.exec(`INSERT INTO groups (${copyCols}) SELECT ${copyCols} FROM groups_old`);
  db.exec('DROP TABLE groups_old');
  db.exec('CREATE INDEX IF NOT EXISTS idx_groups_branch  ON groups(branch_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_groups_teacher ON groups(teacher_id)');
  console.log('[fix_db] ✅ groups: NOT NULL снят с teacher_id.');
}

// group_members / group_schedule — создать если нет
const ensure = (name, sql, idxs=[]) => {
  if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).get()) {
    db.exec(sql); idxs.forEach(i => db.exec(i));
    console.log(`[fix_db] ✅ Создана таблица ${name}.`);
  }
};
ensure('group_members',
  `CREATE TABLE group_members (
    id TEXT PRIMARY KEY, student_id TEXT NOT NULL, group_id TEXT NOT NULL,
    since INTEGER NOT NULL, until INTEGER,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  ['CREATE INDEX IF NOT EXISTS idx_gm_student ON group_members(student_id)',
   'CREATE INDEX IF NOT EXISTS idx_gm_group   ON group_members(group_id)']
);
ensure('group_schedule',
  `CREATE TABLE group_schedule (
    id TEXT PRIMARY KEY, group_id TEXT NOT NULL,
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    start_time TEXT NOT NULL, duration_min INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  ['CREATE INDEX IF NOT EXISTS idx_gs_group ON group_schedule(group_id)']
);

// ── Итог ──────────────────────────────────────────────────────────────────────
db.pragma('foreign_keys = ON');
const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('[fix_db] 📋 Таблицы:', tablesAfter.join(', '));
console.log('[fix_db] 🎉 Готово!');
db.close();
