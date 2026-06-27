/* ============================================================
   KURSOR — WhatsApp-напоминания (Green API)
   GET    /api/whatsapp/settings       — текущие настройки
   PUT    /api/whatsapp/settings       — сохранить настройки
   GET    /api/whatsapp/templates      — шаблоны сообщений
   POST   /api/whatsapp/templates      — создать шаблон
   PUT    /api/whatsapp/templates/:id  — обновить шаблон
   DELETE /api/whatsapp/templates/:id  — удалить шаблон
   POST   /api/whatsapp/test           — тест-отправка на номер
   POST   /api/whatsapp/send-now       — ручной запуск рассылки
   GET    /api/whatsapp/log            — история отправок
   ============================================================ */
const express = require('express');
const db = require('./db');
const { authRequired, requireRole } = require('./auth');
const { genId } = require('./util');
const { sendWhatsAppReminders, sendTestMessage } = require('./whatsapp');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('admin'));

/* ---------- SETTINGS ---------- */
router.get('/settings', (req, res) => {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'whatsapp'").get();
  res.json(row ? JSON.parse(row.value) : {
    enabled: false, instanceId: '', apiToken: '', sendHour: 18, sendMinute: 0,
    daysAhead: 1, sendOnlyActive: true,
  });
});

router.put('/settings', (req, res) => {
  const s = req.body || {};
  const val = JSON.stringify({
    enabled:        !!s.enabled,
    instanceId:     String(s.instanceId || '').trim(),
    apiToken:       String(s.apiToken || '').trim(),
    sendHour:       Math.max(0, Math.min(23, parseInt(s.sendHour) || 18)),
    sendMinute:     Math.max(0, Math.min(59, parseInt(s.sendMinute) || 0)),
    daysAhead:      Math.max(0, Math.min(7, parseInt(s.daysAhead) || 1)),
    sendOnlyActive: s.sendOnlyActive !== false,
  });
  const exists = db.prepare("SELECT 1 FROM app_settings WHERE key='whatsapp'").get();
  if (exists) db.prepare("UPDATE app_settings SET value=? WHERE key='whatsapp'").run(val);
  else db.prepare("INSERT INTO app_settings (key,value) VALUES ('whatsapp',?)").run(val);
  res.json({ ok: true });
});

/* ---------- TEMPLATES ---------- */
router.get('/templates', (req, res) => {
  const rows = db.prepare("SELECT * FROM wa_templates ORDER BY is_default DESC, created_at DESC").all();
  res.json(rows.map(r => ({
    id: r.id, name: r.name, body: r.body,
    isDefault: !!r.is_default, createdAt: r.created_at,
  })));
});

router.post('/templates', (req, res) => {
  const { name, body, isDefault } = req.body || {};
  if (!name || !body) return res.status(400).json({ error: 'name и body обязательны' });
  const id = genId('wt');
  if (isDefault) db.prepare("UPDATE wa_templates SET is_default=0").run();
  db.prepare("INSERT INTO wa_templates (id,name,body,is_default,created_at) VALUES (?,?,?,?,?)")
    .run(id, String(name).trim(), String(body).trim(), isDefault ? 1 : 0, Date.now());
  res.status(201).json({ id });
});

router.put('/templates/:id', (req, res) => {
  const row = db.prepare("SELECT * FROM wa_templates WHERE id=?").get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Шаблон не найден' });
  const { name, body, isDefault } = req.body || {};
  if (isDefault) db.prepare("UPDATE wa_templates SET is_default=0").run();
  db.prepare("UPDATE wa_templates SET name=?,body=?,is_default=? WHERE id=?")
    .run(
      name !== undefined ? String(name).trim() : row.name,
      body !== undefined ? String(body).trim() : row.body,
      isDefault !== undefined ? (isDefault ? 1 : 0) : row.is_default,
      req.params.id,
    );
  res.json({ ok: true });
});

router.delete('/templates/:id', (req, res) => {
  const info = db.prepare("DELETE FROM wa_templates WHERE id=?").run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Шаблон не найден' });
  res.json({ ok: true });
});

/* ---------- TEST SEND ---------- */
router.post('/test', async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone) return res.status(400).json({ error: 'phone обязателен' });
  try {
    const result = await sendTestMessage(phone, message || 'Тест WhatsApp-рассылки из KURSOR 🎓');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- MANUAL SEND ---------- */
router.post('/send-now', async (req, res) => {
  try {
    const result = await sendWhatsAppReminders({ force: true, daysAhead: req.body?.daysAhead });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------- LOG ---------- */
router.get('/log', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM wa_log ORDER BY sent_at DESC LIMIT 200"
  ).all();
  res.json(rows.map(r => ({
    id: r.id, phone: r.phone, studentName: r.student_name,
    parentName: r.parent_name, message: r.message,
    status: r.status, error: r.error || null, sentAt: r.sent_at,
  })));
});

module.exports = router;
