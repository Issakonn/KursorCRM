/* ============================================================
   KURSOR — Локализация (RU / KK).
   Интерфейс переключается полностью. Учебный контент (уроки)
   при отсутствии казахского перевода показывается на русском.
   Использование в разметке:
     <span data-i18n="nav.tasks">Задачи</span>
     <input data-i18n-ph="auth.login_ph">
     <button data-i18n-title="common.save">
   В коде: t('nav.tasks')
   ============================================================ */
(function () {
  const LANG_KEY = 'kursor_lang';

  const DICT = {
    ru: {
      'lang.ru': 'Рус', 'lang.kk': 'Қаз',
      'lang.switch_title': 'Сменить язык интерфейса',

      'common.save': 'Сохранить', 'common.cancel': 'Отмена', 'common.delete': 'Удалить',
      'common.edit': 'Изменить', 'common.add': 'Добавить', 'common.create': 'Создать',
      'common.close': 'Закрыть', 'common.search': 'Поиск', 'common.loading': 'Загрузка…',
      'common.back': 'Назад', 'common.yes': 'Да', 'common.no': 'Нет', 'common.all': 'Все',
      'common.name': 'Имя', 'common.title': 'Название', 'common.status': 'Статус',
      'common.actions': 'Действия', 'common.date': 'Дата', 'common.comment': 'Комментарий',
      'common.description': 'Описание', 'common.none': 'Нет данных', 'common.confirm_delete': 'Удалить запись?',
      'common.saved': 'Сохранено', 'common.deleted': 'Удалено', 'common.error': 'Ошибка',
      'common.export': 'Экспорт', 'common.import': 'Импорт', 'common.active': 'Активен',
      'common.open': 'Открыть', 'common.phone': 'Телефон', 'common.address': 'Адрес',

      'nav.dashboard': 'Главная', 'nav.tasks': 'Задачи', 'nav.leaderboard': 'Рейтинг',
      'nav.profile': 'Профиль', 'nav.students': 'Ученики', 'nav.manage': 'Управление',
      'nav.admin': 'Админ-панель', 'nav.logout': 'Выйти', 'nav.my_profile': 'Мой профиль',
      'nav.parent': 'Кабинет родителя', 'nav.notifications': 'Уведомления',

      'auth.title': 'Вход в КУРСОР', 'auth.login_ph': 'Логин', 'auth.password_ph': 'Пароль',
      'auth.signin': 'Войти', 'auth.error': 'Неверный логин или пароль',

      'dash.greeting': 'Привет', 'dash.points': 'Баллы', 'dash.solved': 'Решено задач',
      'dash.streak': 'Серия дней', 'dash.continue': 'Продолжить обучение',
      'dash.homework': 'Домашнее задание', 'dash.homework_empty': 'Пока нет заданий — отдыхай!',
      'dash.homework_done': 'Выполнено', 'dash.homework_open': 'Открыть задание',
      'dash.hw_progress': 'Прогресс по заданию',

      'admin.dashboard': 'Обзор', 'admin.users': 'Пользователи', 'admin.modules': 'Модули',
      'admin.tasks': 'Задачи', 'admin.materials': 'Материалы', 'admin.branches': 'Филиалы',
      'admin.tariffs': 'Тарифы', 'admin.groups': 'Группы', 'admin.clients': 'Клиенты (CRM)',
      'admin.permissions': 'Права доступа', 'admin.sessions': 'Журнал занятий',
      'admin.homework': 'Домашние задания', 'admin.access': 'Доступ к курсам',
      'admin.notifications': 'Уведомления',
      'admin.grp_overview': 'Обзор', 'admin.grp_education': 'Образование',
      'admin.grp_crm': 'CRM', 'admin.grp_people': 'Люди', 'admin.grp_journal': 'Учебный процесс',
      'admin.search_nav': 'Поиск раздела…',

      'tariff.lessons': 'Занятий', 'tariff.price': 'Цена', 'tariff.price_kzt': 'Цена, ₸',
      'tariff.duration': 'Срок (дней)', 'tariff.extra_separate': 'Доп. занятия отдельно',

      'crm.fullname': 'ФИО', 'crm.branch': 'Филиал', 'crm.tariff': 'Тариф',
      'crm.visits_left': 'Осталось занятий', 'crm.manager': 'Ответственный',
      'crm.parent_name': 'Имя родителя', 'crm.parent_phone': 'Телефон родителя',
      'crm.video_consent': 'Согласие на видеосъёмку', 'crm.status_active': 'Активен',
      'crm.status_frozen': 'Заморожен', 'crm.status_inactive': 'Неактивен',
      'crm.birth_date': 'Дата рождения', 'crm.document': 'Документ',

      'session.conduct': 'Провести занятие', 'session.topic': 'Тема',
      'session.attendance': 'Посещаемость', 'session.present': 'Был',
      'session.absent': 'Отсутствовал', 'session.late': 'Опоздал',
      'session.save_attendance': 'Сохранить посещаемость',

      'mat.title': 'Материалы курса', 'mat.course': 'Курс', 'mat.link': 'Ссылка',
      'mat.type': 'Тип', 'mat.expires': 'Доступ до',

      'fb.title': 'Обратная связь', 'fb.write': 'Написать отзыв',
      'fb.internal': 'Внутренняя заметка (не видна родителям)', 'fb.empty': 'Отзывов пока нет',

      'parent.title': 'Кабинет родителя', 'parent.child': 'Ребёнок',
      'parent.progress': 'Успеваемость', 'parent.attendance': 'Посещаемость',
      'parent.reports': 'Отчёты с занятий', 'parent.feedback': 'Отзывы преподавателя',
      'parent.no_children': 'К вашему профилю пока не привязан ни один ученик.',
      'parent.video_expired': 'Видео больше не доступно (срок хранения истёк)',

      'notif.empty': 'Новых уведомлений нет', 'notif.mark_all': 'Прочитать все',
    },
    kk: {
      'lang.ru': 'Рус', 'lang.kk': 'Қаз',
      'lang.switch_title': 'Интерфейс тілін ауыстыру',

      'common.save': 'Сақтау', 'common.cancel': 'Бас тарту', 'common.delete': 'Жою',
      'common.edit': 'Өзгерту', 'common.add': 'Қосу', 'common.create': 'Құру',
      'common.close': 'Жабу', 'common.search': 'Іздеу', 'common.loading': 'Жүктелуде…',
      'common.back': 'Артқа', 'common.yes': 'Иә', 'common.no': 'Жоқ', 'common.all': 'Барлығы',
      'common.name': 'Аты', 'common.title': 'Атауы', 'common.status': 'Күйі',
      'common.actions': 'Әрекеттер', 'common.date': 'Күні', 'common.comment': 'Түсініктеме',
      'common.description': 'Сипаттама', 'common.none': 'Дерек жоқ', 'common.confirm_delete': 'Жазбаны жою керек пе?',
      'common.saved': 'Сақталды', 'common.deleted': 'Жойылды', 'common.error': 'Қате',
      'common.export': 'Экспорт', 'common.import': 'Импорт', 'common.active': 'Белсенді',
      'common.open': 'Ашу', 'common.phone': 'Телефон', 'common.address': 'Мекенжай',

      'nav.dashboard': 'Басты бет', 'nav.tasks': 'Тапсырмалар', 'nav.leaderboard': 'Рейтинг',
      'nav.profile': 'Профиль', 'nav.students': 'Оқушылар', 'nav.manage': 'Басқару',
      'nav.admin': 'Әкімші панелі', 'nav.logout': 'Шығу', 'nav.my_profile': 'Менің профилім',
      'nav.parent': 'Ата-ана кабинеті', 'nav.notifications': 'Хабарламалар',

      'auth.title': 'КУРСОР-ға кіру', 'auth.login_ph': 'Логин', 'auth.password_ph': 'Құпиясөз',
      'auth.signin': 'Кіру', 'auth.error': 'Логин не құпиясөз қате',

      'dash.greeting': 'Сәлем', 'dash.points': 'Ұпай', 'dash.solved': 'Шешілген тапсырма',
      'dash.streak': 'Күндер сериясы', 'dash.continue': 'Оқуды жалғастыру',
      'dash.homework': 'Үй тапсырмасы', 'dash.homework_empty': 'Әзірге тапсырма жоқ — демал!',
      'dash.homework_done': 'Орындалды', 'dash.homework_open': 'Тапсырманы ашу',
      'dash.hw_progress': 'Тапсырма бойынша үлгерім',

      'admin.dashboard': 'Шолу', 'admin.users': 'Пайдаланушылар', 'admin.modules': 'Модульдер',
      'admin.tasks': 'Тапсырмалар', 'admin.materials': 'Материалдар', 'admin.branches': 'Филиалдар',
      'admin.tariffs': 'Тарифтер', 'admin.groups': 'Топтар', 'admin.clients': 'Клиенттер (CRM)',
      'admin.permissions': 'Қол жеткізу құқықтары', 'admin.sessions': 'Сабақ журналы',
      'admin.homework': 'Үй тапсырмалары', 'admin.access': 'Курстарға қол жеткізу',
      'admin.notifications': 'Хабарламалар',
      'admin.grp_overview': 'Шолу', 'admin.grp_education': 'Білім беру',
      'admin.grp_crm': 'CRM', 'admin.grp_people': 'Адамдар', 'admin.grp_journal': 'Оқу үдерісі',
      'admin.search_nav': 'Бөлімді іздеу…',

      'tariff.lessons': 'Сабақ саны', 'tariff.price': 'Бағасы', 'tariff.price_kzt': 'Бағасы, ₸',
      'tariff.duration': 'Мерзімі (күн)', 'tariff.extra_separate': 'Қосымша сабақтар бөлек',

      'crm.fullname': 'Аты-жөні', 'crm.branch': 'Филиал', 'crm.tariff': 'Тариф',
      'crm.visits_left': 'Қалған сабақ', 'crm.manager': 'Жауапты',
      'crm.parent_name': 'Ата-ананың аты', 'crm.parent_phone': 'Ата-ана телефоны',
      'crm.video_consent': 'Бейнетүсірілімге келісім', 'crm.status_active': 'Белсенді',
      'crm.status_frozen': 'Тоқтатылған', 'crm.status_inactive': 'Белсенді емес',
      'crm.birth_date': 'Туған күні', 'crm.document': 'Құжат',

      'session.conduct': 'Сабақ өткізу', 'session.topic': 'Тақырып',
      'session.attendance': 'Қатысу', 'session.present': 'Болды',
      'session.absent': 'Болмады', 'session.late': 'Кешікті',
      'session.save_attendance': 'Қатысуды сақтау',

      'mat.title': 'Курс материалдары', 'mat.course': 'Курс', 'mat.link': 'Сілтеме',
      'mat.type': 'Түрі', 'mat.expires': 'Қолжетімділік мерзімі',

      'fb.title': 'Кері байланыс', 'fb.write': 'Пікір жазу',
      'fb.internal': 'Ішкі жазба (ата-анаға көрінбейді)', 'fb.empty': 'Әзірге пікір жоқ',

      'parent.title': 'Ата-ана кабинеті', 'parent.child': 'Бала',
      'parent.progress': 'Үлгерім', 'parent.attendance': 'Қатысу',
      'parent.reports': 'Сабақ есептері', 'parent.feedback': 'Мұғалім пікірлері',
      'parent.no_children': 'Сіздің профиліңізге әзірге бірде-бір оқушы тіркелмеген.',
      'parent.video_expired': 'Бейне енді қолжетімді емес (сақтау мерзімі аяқталды)',

      'notif.empty': 'Жаңа хабарлама жоқ', 'notif.mark_all': 'Барлығын оқылды деп белгілеу',
    },
  };

  let lang = localStorage.getItem(LANG_KEY) || 'ru';
  if (!DICT[lang]) lang = 'ru';

  function t(key, fallback) {
    const d = DICT[lang] || DICT.ru;
    if (d[key] != null) return d[key];
    if (DICT.ru[key] != null) return DICT.ru[key];
    return fallback != null ? fallback : key;
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    if (document.documentElement) document.documentElement.setAttribute('lang', lang);
  }

  function setLang(next) {
    if (!DICT[next] || next === lang) return;
    lang = next;
    localStorage.setItem(LANG_KEY, next);
    // Перерисовываем страницу: простой и надёжный способ обновить весь контент
    location.reload();
  }

  // Перевод поля сущности с учётом *_kk варианта (для контента из БД)
  function localized(obj, field) {
    if (!obj) return '';
    if (lang === 'kk') {
      const kk = obj[field + 'Kk'] || obj[field + '_kk'];
      if (kk) return kk;
    }
    return obj[field] || '';
  }

  function switcherHtml() {
    const mk = (code, label) =>
      `<button type="button" class="lang-btn ${code === lang ? 'active' : ''}" data-lang="${code}" onclick="I18N.setLang('${code}')">${label}</button>`;
    return `<div class="lang-switch" title="${t('lang.switch_title')}">${mk('ru', t('lang.ru'))}${mk('kk', t('lang.kk'))}</div>`;
  }

  window.I18N = { t, applyI18n, setLang, localized, switcherHtml, get lang() { return lang; }, DICT };
  window.t = t;

  // Автоприменение после загрузки DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n());
  } else {
    applyI18n();
  }
})();
