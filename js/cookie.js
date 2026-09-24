// Cookie-баннер, настройки cookie и запуск Яндекс Метрики только после согласия.
// Тексты и поведение — по юридическому пакету (версия 1.0 от 15 сентября 2026 года):
// раздел «Готовые тексты интерфейса» и «Техническое задание разработчику», п. 3.
//
// Выбор хранится в одном техническом cookie bf_cookie_choice: принято или отклонено, версия выбора
// и дата. Он живёт 12 месяцев; нет выбора, срок вышел или версия поменялась — баннер показывается снова.
//
// Метрика: пока METRIKA_ID = null, счётчика нет и никаких обращений к Яндексу не бывает — ни до
// согласия, ни после. Когда появится настоящий счётчик, достаточно вписать его номер ниже.
// Пиксель <noscript> не ставится: он отправлял бы данные без согласия.
(function () {
  var ВЕРСИЯ = '1.0';
  var СРОК_ДНЕЙ = 365;
  var ИМЯ = 'bf_cookie_choice';

  var METRIKA_ID = null;   // номер счётчика Яндекс Метрики, например 12345678
  var METRIKA_SRC = 'https://mc.yandex.ru/metrika/tag.js';
  // Всё дополнительное выключено: Вебвизор, карта кликов, учёт ссылок, точный показатель отказов,
  // события для сторонних скриптов. Электронная коммерция не подключается (параметр ecommerce не задан).
  // Автоматические цели и рекламные функции выключаются в настройках счётчика в самой Метрике.
  var METRIKA_OPTIONS = { webvisor: false, clickmap: false, trackLinks: false, accurateTrackBounce: false, trackHash: false, triggerEvent: false };

  var ТЕКСТ = {
    баннер: 'Мы используем технически необходимые cookie для работы сайта. С вашего согласия Яндекс Метрика будет собирать данные о посещениях, чтобы мы могли улучшать сайт. Вы можете принять или отклонить аналитику; отказ не ограничит доступ к сайту.',
    принять: 'Принять аналитику',
    отклонить: 'Отклонить',
    настроить: 'Настроить',
    политикаCookie: 'Политика использования файлов cookie',
    политикаПД: 'Политика в отношении обработки персональных данных',
    настройки: 'Настройки cookie',
    технические: 'Технически необходимые',
    техническиеПояснение: 'всегда включены.',
    аналитика: 'Аналитические Яндекс Метрики',
    аналитикаПояснение: 'выключены по умолчанию.',
    сохранить: 'Сохранить выбор',
    отменить: 'Отменить',
    отзыв: 'Аналитика отключена. Часть cookie Яндекса можно удалить только в настройках браузера.'
  };

  // Корень сайта — папка над js/. На тестовом адресе это /bollfilter/, на bollfilter.ru — /.
  var корень = new URL('..', document.currentScript.src);
  var путь = корень.pathname;

  // --- Выбор пользователя ---

  function прочитать() {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + ИМЯ + '=([^;]*)'));
    if (!m) return null;
    var p = new URLSearchParams(decodeURIComponent(m[1]));
    var a = p.get('a'), дата = Date.parse(p.get('d'));
    if (p.get('v') !== ВЕРСИЯ || (a !== '1' && a !== '0') || isNaN(дата)) return null;
    if (Date.now() - дата > СРОК_ДНЕЙ * 864e5) return null;
    return { аналитика: a === '1' };
  }

  function записать(аналитика) {
    var значение = 'v=' + ВЕРСИЯ + '&a=' + (аналитика ? '1' : '0') + '&d=' + new Date().toISOString();
    document.cookie = ИМЯ + '=' + encodeURIComponent(значение) + '; Max-Age=' + СРОК_ДНЕЙ * 86400 +
      '; Path=' + путь + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }

  // --- Метрика ---

  var метрикаЗапущена = false;

  function запуститьМетрику() {
    if (метрикаЗапущена || !METRIKA_ID) return;
    метрикаЗапущена = true;
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = 1 * new Date();
    var s = document.createElement('script');
    s.async = true;
    s.src = METRIKA_SRC + '?id=' + METRIKA_ID;
    document.head.appendChild(s);
    window.ym(METRIKA_ID, 'init', METRIKA_OPTIONS);
  }

  // Удаляет то, что Метрика хранит на домене сайта: cookie _ym… и такие же записи в хранилище браузера.
  // Cookie на доменах самого Яндекса сайту недоступны — об этом говорит сообщение об отзыве.
  function удалитьДанныеМетрики() {
    // Метрика ставит cookie на сам домен или на домен уровнем выше — пробуем все варианты.
    var части = location.hostname.split('.');
    var домены = [''];
    for (var i = 0; i < части.length - 1; i++) {
      var д = части.slice(i).join('.');
      домены.push('; Domain=' + д, '; Domain=.' + д);
    }
    document.cookie.split(';').forEach(function (c) {
      var имя = c.split('=')[0].trim();
      if (имя.indexOf('_ym') !== 0) return;
      домены.forEach(function (домен) {
        ['/', путь].forEach(function (п) {
          document.cookie = имя + '=; Max-Age=0; Path=' + п + домен;
        });
      });
    });
    try {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('_ym') === 0) localStorage.removeItem(k); });
    } catch (e) { /* хранилище недоступно — удалять нечего */ }
  }

  // --- Разметка ---

  function узел(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  var ссылки = '<a href="' + путь + 'cookies/">' + ТЕКСТ.политикаCookie + '</a> <span class="sep">·</span> ' +
    '<a href="' + путь + 'privacy/">' + ТЕКСТ.политикаПД + '</a>';

  var баннер = узел(
    '<section class="cookie-banner" aria-label="' + ТЕКСТ.настройки + '" hidden>' +
      '<div class="wrap">' +
        '<div class="cookie-body">' +
          '<p class="cookie-text">' + ТЕКСТ.баннер + '</p>' +
          '<p class="cookie-links">' + ссылки + '</p>' +
        '</div>' +
        '<div class="cookie-actions">' +
          '<button type="button" class="btn btn-blue" data-cookie="принять">' + ТЕКСТ.принять + '</button>' +
          '<button type="button" class="btn btn-blue" data-cookie="отклонить">' + ТЕКСТ.отклонить + '</button>' +
          '<button type="button" class="btn cookie-btn-line" data-cookie="настроить">' + ТЕКСТ.настроить + '</button>' +
        '</div>' +
      '</div>' +
    '</section>');

  var окно = узел(
    '<dialog class="cookie-dialog" aria-labelledby="cookie-dialog-title">' +
      '<form method="dialog">' +
        '<h2 id="cookie-dialog-title">' + ТЕКСТ.настройки + '</h2>' +
        '<div class="cookie-opt">' +
          '<input type="checkbox" id="cookie-opt-tech" checked disabled>' +
          '<label for="cookie-opt-tech"><b>' + ТЕКСТ.технические + '</b> — ' + ТЕКСТ.техническиеПояснение + '</label>' +
        '</div>' +
        '<div class="cookie-opt">' +
          '<input type="checkbox" id="cookie-opt-analytics">' +
          '<label for="cookie-opt-analytics"><b>' + ТЕКСТ.аналитика + '</b> — ' + ТЕКСТ.аналитикаПояснение + '</label>' +
        '</div>' +
        '<p class="cookie-links">' + ссылки + '</p>' +
        '<div class="cookie-actions">' +
          '<button type="button" class="btn btn-blue" data-cookie="сохранить">' + ТЕКСТ.сохранить + '</button>' +
          '<button type="button" class="btn cookie-btn-line" data-cookie="отменить">' + ТЕКСТ.отменить + '</button>' +
        '</div>' +
      '</form>' +
    '</dialog>');

  var сообщение = узел(
    '<div class="cookie-toast" role="status" hidden>' +
      '<span>' + ТЕКСТ.отзыв + '</span>' +
      '<button type="button" aria-label="Закрыть сообщение">×</button>' +
    '</div>');

  // Баннер — первым в странице, чтобы с клавиатуры до него доходили сразу, а не после всех ссылок сайта;
  // на экране он всё равно прижат к низу.
  document.body.prepend(баннер);
  document.body.append(окно, сообщение);
  var галочка = окно.querySelector('#cookie-opt-analytics');

  // Баннер лежит поверх низа страницы; пока он виден, под страницей оставляем место под его высоту,
  // чтобы подвал можно было докрутить и прочитать.
  function подогнатьОтступ() {
    document.body.style.paddingBottom = баннер.hidden ? '' : баннер.offsetHeight + 'px';
  }
  function показатьБаннер(да) {
    баннер.hidden = !да;
    подогнатьОтступ();
  }
  window.addEventListener('resize', подогнатьОтступ);

  var таймер;
  function показатьСообщение() {
    сообщение.hidden = false;
    clearTimeout(таймер);
    таймер = setTimeout(function () { сообщение.hidden = true; }, 10000);
  }
  сообщение.querySelector('button').addEventListener('click', function () { сообщение.hidden = true; });

  function открытьНастройки() {
    var выбор = прочитать();
    галочка.checked = !!(выбор && выбор.аналитика);
    окно.showModal();
  }

  function решить(аналитика) {
    var было = прочитать();
    записать(аналитика);
    показатьБаннер(false);
    if (аналитика) { запуститьМетрику(); return; }
    if (было && было.аналитика) {
      удалитьДанныеМетрики();
      // Уже запущенный счётчик на этой странице не выгрузить — перезагружаем страницу без него,
      // сообщение показываем после перезагрузки.
      if (метрикаЗапущена) {
        try { sessionStorage.setItem('bf-cookie-revoked', '1'); } catch (e) {}
        location.reload();
        return;
      }
      показатьСообщение();
    }
  }

  баннер.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cookie]');
    if (!b) return;
    var д = b.dataset.cookie;
    if (д === 'принять') решить(true);
    else if (д === 'отклонить') решить(false);
    else if (д === 'настроить') открытьНастройки();
  });

  окно.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cookie]');
    if (!b) return;
    if (b.dataset.cookie === 'сохранить') { окно.close(); решить(галочка.checked); }
    else окно.close();
  });

  // «Настройки cookie» в подвале: без JavaScript это обычная ссылка на страницу /cookies/.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-cookie-settings]');
    if (!a) return;
    e.preventDefault();
    открытьНастройки();
  });

  // --- Запуск ---

  var выбор = прочитать();
  if (выбор && выбор.аналитика) запуститьМетрику();
  показатьБаннер(!выбор);
  try {
    if (sessionStorage.getItem('bf-cookie-revoked')) {
      sessionStorage.removeItem('bf-cookie-revoked');
      показатьСообщение();
    }
  } catch (e) {}
})();
