/**
 * KURSOR — одноразовый скрипт для починки базы данных.
 * Запускай: node fix_db.js
 * 
 * Что делает:
 * 1. Удаляет осиротевшую таблицу users_old (если есть)
 * 2. Удаляет tasks_old (если есть)  
 * 3. Проверяет что users существует и корректна
 * 4. Убирает CHECK constraint на role (чтобы assistant/parent работали)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'server', 'db', 'kursor.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ База не найдена по пути:', DB_PATH);
  console.error('   Укажи путь через переменную DB_PATH=путь/к/kursor.sqlite node fix_db.js');
  process.exit(1);
}

console.log('📂 База данных:', DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Показать все таблицы
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('📋 Таблицы в базе:', tables.join(', '));

// ── Шаг 1: удалить tasks_old ─────────────────────────────────────────────────
if (tables.includes('tasks_old')) {
  console.log('\n⚠️  Найдена tasks_old — удаляю...');
  db.pragma('foreign_keys = OFF');
  db.exec('DROP TABLE tasks_old');
  db.pragma('foreign_keys = ON');
  console.log('✅ tasks_old удалена.');
} else {
  console.log('\n✅ tasks_old не найдена (хорошо).');
}

// ── Шаг 2: починить users / users_old ────────────────────────────────────────
const usersExists    = tables.includes('users');
const usersOldExists = tables.includes('users_old');

if (!usersExists && usersOldExists) {
  console.log('\n⚠️  users отсутствует, но есть users_old — восстанавливаю...');
  db.pragma('foreign_keys = OFF');
  db.exec('ALTER TABLE users_old RENAME TO users');
  db.pragma('foreign_keys = ON');
  console.log('✅ users восстановлена из users_old.');
} else if (usersOldExists) {
  console.log('\n⚠️  Найдена users_old при живой users — удаляю мусор...');
  db.pragma('foreign_keys = OFF');
  db.exec('DROP TABLE users_old');
  db.pragma('foreign_keys = ON');
  console.log('✅ users_old удалена.');
} else {
  console.log('✅ users_old не найдена (хорошо).');
}

// ── Шаг 3: снять CHECK(role IN ...) если он ещё есть ─────────────────────────
const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
if (!usersSql) {
  console.error('\n❌ Таблица users всё ещё не существует! База повреждена.');
  process.exit(1);
}

const needsRoleMigration = usersSql.sql.includes("CHECK(role IN");
if (needsRoleMigration) {
  console.log('\n⚠️  users имеет CHECK(role IN ...) — мигрирую (добавляю assistant/parent)...');
  const oldCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const wantCols = ['id','login','password_hash','name','role','age','group_id',
                    'languages','teacher_id','avatar_url','created_at'];
  const copyCols = wantCols.filter(c => oldCols.includes(c)).join(',');

  db.pragma('foreign_keys = OFF');
  db.exec('ALTER TABLE users RENAME TO users_old');
  db.exec(`CREATE TABLE users (
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
  )`);
  db.exec(`INSERT INTO users (${copyCols}) SELECT ${copyCols} FROM users_old`);
  db.exec('DROP TABLE users_old');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_role    ON users(role)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_teacher ON users(teacher_id)');
  db.pragma('foreign_keys = ON');
  console.log('✅ Миграция users завершена. Роли assistant и parent теперь доступны.');
} else {
  console.log('\n✅ users уже без CHECK constraint (хорошо).');
}

// ── Шаг 4: добавить avatar_url если нет ──────────────────────────────────────
try {
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!cols.includes('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
    console.log('✅ Добавлена колонка avatar_url в users.');
  }
} catch {}

// ── Шаг 5: починить tasks CHECK если нужно ───────────────────────────────────
const tasksSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
if (tasksSql && !tasksSql.sql.includes("'java'")) {
  console.log('\n⚠️  tasks имеет старый CHECK — мигрирую (добавляю java/cpp/etc)...');
  const oldCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
  const newCols = ['id','module_id','type','title','description','difficulty','explain',
                   'options','answer','items','expected_output','starter'];
  if (oldCols.includes('scratch_project_id')) newCols.push('scratch_project_id');
  if (oldCols.includes('stdin')) newCols.push('stdin');
  const copyCols = newCols.filter(c => oldCols.includes(c)).join(',');

  db.pragma('foreign_keys = OFF');
  const to = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks_old'").get();
  if (to) db.exec('DROP TABLE tasks_old');
  db.exec('ALTER TABLE tasks RENAME TO tasks_old');
  db.exec(`CREATE TABLE tasks (
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
  )`);
  db.exec(`INSERT INTO tasks (${copyCols}) SELECT ${copyCols} FROM tasks_old`);
  db.exec('DROP TABLE tasks_old');
  db.pragma('foreign_keys = ON');
  console.log('✅ Миграция tasks завершена.');
} else if (tasksSql) {
  console.log('✅ tasks уже актуальна.');
}

// ── Итог ──────────────────────────────────────────────────────────────────────
const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
console.log('\n📋 Таблицы после починки:', tablesAfter.join(', '));
const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
console.log(`👤 Пользователей в базе: ${userCount}`);
console.log('\n🎉 Готово! Перезапускай сервер (node server/index.js или npm start).');
db.close();
