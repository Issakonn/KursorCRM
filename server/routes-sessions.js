/* ============================================================
   KURSOR — Журнал занятий, посещаемость, домашние задания.
   /api/lesson-sessions, /api/attendance, /api/homework
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');
const { genId } = require('./util');
const { hasPermission } = require('./permissions');

const router = express.Router();
router.use(authRequired);

function canManageGroup(user, groupId) {
  if (user.role === 'admin') return true;
  if (!['teacher', 'assistant'].includes(user.role)) return false;
  const g = db.prepare('SELECT teacher_id, assistant_id FROM groups WHERE id = ?').get(groupId);
  return g && (g.teacher_id === user.id || g.assistant_id === user.id);
}

/* ============================================================
   ЗАНЯТИЯ /api/lesson-sessions
   ============================================================ */
router.get('/lesson-sessions', (req, res) => {
  const { group_id, from, to } = req.query;
  if (!group_id) return res.status(400).json({ error: 'group_id обязателен' });
  if (!canManageGroup(req.user, group_id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Это не ваша группа' });
  }
  const where = ['ls.group_id = ?']; const params = [group_id];
  if (from) { where.push('ls.date >= ?'); params.push(from); }
  if (to) { where.push('ls.date <= ?'); params.push(to); }
  const rows = db.prepare(`
    SELECT ls.*, u.name AS conductor_name,
      (SELECT COUNT(*) FROM attendance a WHERE a.lesson_session_id = ls.id AND a.status='present') AS present_count
    FROM lesson_sessions ls
    LEFT JOIN users u ON u.id = ls.conducted_by
    WHERE ${where.join(' AND ')}
    ORDER BY ls.date DESC, ls.created_at DESC
  `).all(...params);
  res.json(rows.map(r => ({
    id: r.id, groupId: r.group_id, date: r.date, topic: r.topic || '',
    conductedBy: r.conducted_by || null, conductorName: r.conductor_name || null,
    createdAt: r.created_at, presentCount: r.present_count || 0,
  })));
});

router.post('/lesson-sessions', (req, res) => {
  const { groupId, date, topic } = req.body || {};
  if (!groupId || !date) return res.status(400).json({ error: 'groupId, date обязательны' });
  if (!canManageGroup(req.user, groupId)) return res.status(403).json({ error: 'Это не ваша группа' });
  if (req.user.role !== 'admin' && !hasPermission(req.user, 'conduct_lessons')) {
    return res.status(403).json({ error: 'Нет права проводить занятия' });
  }
  const id = genId('ls');
  db.prepare('INSERT INTO lesson_sessions (id, group_id, date, topic, conducted_by, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, groupId, date, topic || null, req.user.id, Date.now());
  res.status(201).json({ id, groupId, date, topic: topic || '', conductedBy: req.user.id });
});

router.delete('/lesson-sessions/:id', (req, res) => {
  const ls = db.prepare('SELECT * FROM lesson_sessions WHERE id = ?').get(req.params.id);
  if (!ls) return res.status(404).json({ error: 'Не найдено' });
  if (!canManageGroup(req.user, ls.group_id)) return res.status(403).json({ error: 'Это не ваша группа' });
  // вернуть посещения, списанные за это занятие
  const present = db.prepare("SELECT student_id FROM attendance WHERE lesson_session_id = ? AND status='present'").all(req.params.id);
  const refund = db.prepare("UPDATE students_crm SET visits_left = visits_left + 1 WHERE user_id = ? AND status='active'");
  const txn = db.transaction(() => {
    for (const p of present) refund.run(p.student_id);
    db.prepare('DELETE FROM lesson_sessions WHERE id = ?').run(req.params.id);
  });
  txn();
  res.json({ ok: true });
});

// Детали занятия с посещаемостью
router.get('/lesson-sessions/:id/attendance', (req, res) => {
  const ls = db.prepare('SELECT * FROM lesson_sessions WHERE id = ?').get(req.params.id);
  if (!ls) return res.status(404).json({ error: 'Не найдено' });
  if (!canManageGroup(req.user, ls.group_id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Недоступно' });
  }
  const rows = db.prepare(`
    SELECT a.*, u.name FROM attendance a JOIN users u ON u.id = a.student_id
    WHERE a.lesson_session_id = ? ORDER BY u.name
  `).all(req.params.id);
  res.json(rows.map(r => ({ studentId: r.student_id, name: r.name, status: r.status, markedAt: r.marked_at })));
});

/* ============================================================
   ПОСЕЩАЕМОСТЬ /api/attendance (массовое сохранение)
   Тело: { lessonSessionId, records: [{studentId, status}] }
   Логика списания абонемента — см. ТЗ 3.2 / 3.4.
   ============================================================ */
router.post('/attendance', (req, res) => {
  const { lessonSessionId, records } = req.body || {};
  if (!lessonSessionId || !Array.isArray(records)) {
    return res.status(400).json({ error: 'lessonSessionId и массив records обязательны' });
  }
  const ls = db.prepare('SELECT * FROM lesson_sessions WHERE id = ?').get(lessonSessionId);
  if (!ls) return res.status(404).json({ error: 'Занятие не найдено' });
  if (!canManageGroup(req.user, ls.group_id)) return res.status(403).json({ error: 'Это не ваша группа' });
  if (req.user.role !== 'admin' && !hasPermission(req.user, 'conduct_lessons')) {
    return res.status(403).json({ error: 'Нет права отмечать посещаемость' });
  }

  const getPrev = db.prepare('SELECT status FROM attendance WHERE lesson_session_id = ? AND student_id = ?');
  const upsert = db.prepare(`
    INSERT INTO attendance (id, lesson_session_id, student_id, status, marked_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(lesson_session_id, student_id) DO UPDATE SET status=excluded.status, marked_at=excluded.marked_at
  `);
  const getCrm = db.prepare("SELECT status, visits_left FROM students_crm WHERE user_id = ?");
  const decVisit = db.prepare("UPDATE students_crm SET visits_left = MAX(0, visits_left - 1) WHERE user_id = ?");
  const incVisit = db.prepare("UPDATE students_crm SET visits_left = visits_left + 1 WHERE user_id = ?");

  const charged = [];
  const txn = db.transaction(() => {
    for (const rec of records) {
      const { studentId, status } = rec;
      if (!studentId || !['present', 'absent', 'excused'].includes(status)) continue;
      const prev = getPrev.get(lessonSessionId, studentId);
      const prevStatus = prev ? prev.status : null;
      upsert.run(genId('att'), lessonSessionId, studentId, status, Date.now());

      const crm = getCrm.get(studentId);
      if (!crm) continue; // нет CRM-карточки — не списываем
      // списание только для активных абонементов
      if (status === 'present' && prevStatus !== 'present') {
        if (crm.status === 'active') { decVisit.run(studentId); charged.push({ studentId, action: 'charged' }); }
      } else if (prevStatus === 'present' && status !== 'present') {
        // возврат посещения при исправлении
        if (crm.status === 'active') { incVisit.run(studentId); charged.push({ studentId, action: 'refunded' }); }
      }
    }
  });
  txn();
  res.json({ ok: true, charged });
});

/* ============================================================
   ДОМАШНИЕ ЗАДАНИЯ /api/homework
   ============================================================ */
function rowToHw(r) {
  let taskIds = [];
  try { taskIds = r.task_ids ? JSON.parse(r.task_ids) : []; } catch {}
  return {
    id: r.id, lessonSessionId: r.lesson_session_id, moduleId: r.module_id || null,
    taskIds, dueDate: r.due_date || null, createdAt: r.created_at,
    groupId: r.group_id || null, sessionDate: r.session_date || null,
    moduleTitle: r.module_title || null,
  };
}

router.post('/homework', (req, res) => {
  const { lessonSessionId, moduleId, taskIds, dueDate, studentIds } = req.body || {};
  if (!lessonSessionId) return res.status(400).json({ error: 'lessonSessionId обязателен' });
  const ls = db.prepare('SELECT * FROM lesson_sessions WHERE id = ?').get(lessonSessionId);
  if (!ls) return res.status(404).json({ error: 'Занятие не найдено' });
  if (!canManageGroup(req.user, ls.group_id)) return res.status(403).json({ error: 'Это не ваша группа' });

  const id = genId('hw');
  db.prepare('INSERT INTO homework (id, lesson_session_id, module_id, task_ids, due_date, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, lessonSessionId, moduleId || null, taskIds && taskIds.length ? JSON.stringify(taskIds) : null, dueDate || null, Date.now());

  // назначения: конкретным ученикам или всей группе (по составу)
  let targets = Array.isArray(studentIds) && studentIds.length
    ? studentIds
    : db.prepare('SELECT DISTINCT student_id FROM group_members WHERE group_id = ?').all(ls.group_id).map(r => r.student_id);
  const insA = db.prepare('INSERT INTO homework_assignments (id, homework_id, student_id) VALUES (?,?,?)');
  const txn = db.transaction(() => { for (const sid of targets) insA.run(genId('ha'), id, sid); });
  txn();

  // уведомления ученикам (фаза 6, мягко — если таблица есть)
  try {
    const insN = db.prepare('INSERT INTO notifications (id, user_id, type, text, link, channel, read, created_at) VALUES (?,?,?,?,?,?,0,?)');
    const txnN = db.transaction(() => {
      for (const sid of targets) insN.run(genId('ntf'), sid, 'homework', 'Назначено новое домашнее задание', '/pages/dashboard.html', 'in_app', Date.now());
    });
    txnN();
  } catch {}

  res.status(201).json({ id, lessonSessionId, moduleId: moduleId || null, taskIds: taskIds || [], dueDate: dueDate || null, assigned: targets.length });
});

router.get('/homework', (req, res) => {
  const { group_id, student_id } = req.query;
  if (group_id) {
    if (!canManageGroup(req.user, group_id) && req.user.role !== 'admin') return res.status(403).json({ error: 'Недоступно' });
    const rows = db.prepare(`
      SELECT h.*, ls.group_id, ls.date AS session_date, m.title AS module_title
      FROM homework h JOIN lesson_sessions ls ON ls.id = h.lesson_session_id
      LEFT JOIN modules m ON m.id = h.module_id
      WHERE ls.group_id = ? ORDER BY h.created_at DESC
    `).all(group_id);
    return res.json(rows.map(rowToHw));
  }
  if (student_id) {
    if (req.user.role === 'student' && req.user.id !== student_id) return res.status(403).json({ error: 'Недоступно' });
    const rows = db.prepare(`
      SELECT h.*, ls.group_id, ls.date AS session_date, m.title AS module_title
      FROM homework h
      JOIN homework_assignments ha ON ha.homework_id = h.id
      JOIN lesson_sessions ls ON ls.id = h.lesson_session_id
      LEFT JOIN modules m ON m.id = h.module_id
      WHERE ha.student_id = ? ORDER BY h.created_at DESC
    `).all(student_id);
    return res.json(rows.map(rowToHw));
  }
  res.status(400).json({ error: 'Нужен group_id или student_id' });
});

// ДЗ текущего ученика + статусы выполнения (из task_progress)
router.get('/homework/me', requireRole('student'), (req, res) => {
  const rows = db.prepare(`
    SELECT h.*, ls.date AS session_date, m.title AS module_title
    FROM homework h
    JOIN homework_assignments ha ON ha.homework_id = h.id
    JOIN lesson_sessions ls ON ls.id = h.lesson_session_id
    LEFT JOIN modules m ON m.id = h.module_id
    WHERE ha.student_id = ? ORDER BY h.created_at DESC
  `).all(req.user.id);

  const out = rows.map(r => {
    const hw = rowToHw(r);
    // статусы задач
    const ids = [...hw.taskIds];
    if (hw.moduleId) {
      const modTasks = db.prepare('SELECT id FROM tasks WHERE module_id = ?').all(hw.moduleId).map(t => t.id);
      for (const tid of modTasks) if (!ids.includes(tid)) ids.push(tid);
    }
    const statuses = {};
    for (const tid of ids) {
      const tp = db.prepare("SELECT status FROM task_progress WHERE user_id = ? AND task_id = ?").get(req.user.id, tid);
      statuses[tid] = tp ? tp.status : 'new';
    }
    const total = ids.length;
    const done = Object.values(statuses).filter(s => s === 'done').length;
    return { ...hw, taskList: ids, statuses, total, done, allDone: total > 0 && done === total };
  });
  res.json(out);
});

router.delete('/homework/:id', (req, res) => {
  const hw = db.prepare('SELECT h.*, ls.group_id FROM homework h JOIN lesson_sessions ls ON ls.id = h.lesson_session_id WHERE h.id = ?').get(req.params.id);
  if (!hw) return res.status(404).json({ error: 'Не найдено' });
  if (!canManageGroup(req.user, hw.group_id)) return res.status(403).json({ error: 'Это не ваша группа' });
  db.prepare('DELETE FROM homework WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
