// Мобильное меню: кнопка ☰ раскрывает тот же nav, что на компьютере (стили — в css/style.css, класс menu-open).
// Закрывается повторным нажатием, пунктом меню, касанием по затемнению, клавишей Esc и при расширении окна до компьютерной ширины.
(function () {
  var header = document.querySelector('.header');
  var button = header && header.querySelector('.burger');
  var nav = document.getElementById('menu');
  if (!button || !nav) return;

  function setOpen(open) {
    header.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  button.addEventListener('click', function () {
    setOpen(!header.classList.contains('menu-open'));
  });

  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });

  // Затемнение — это псевдоэлемент шапки, поэтому касание по нему приходит как касание по самой шапке.
  document.addEventListener('click', function (event) {
    if (event.target === header || !header.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') setOpen(false);
  });

  var desktop = window.matchMedia('(min-width: 1200px)');
  desktop.addEventListener('change', function (event) {
    if (event.matches) setOpen(false);
  });
})();

// Форма «Свяжитесь с нами»: проверка полей в браузере. Серверной отправки пока нет — данные никуда не уходят,
// после успешной проверки показывается честное сообщение тестового режима. Поля не очищаются.
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var status = form.querySelector('.form-status');
  // Серая подсказка под парой контактов: прячется, пока показано красное сообщение про тот же контакт
  var contactHint = form.querySelector('.field-hint');
  var fields = {
    name: form.elements.name,
    email: form.elements.email,
    phone: form.elements.phone,
    consent: form.elements.consent
  };

  // Текст про e-mail или телефон — дословно из юридического пакета («Готовые тексты интерфейса»)
  var MESSAGES = {
    name: 'Укажите имя.',
    contact: 'Укажите e-mail или телефон, по которому можно ответить на обращение.',
    email: 'Проверьте адрес e-mail.',
    phone: 'Проверьте номер телефона: цифры, пробелы и знаки + ( ) -.',
    consent: 'Для отправки формы подтвердите согласие на обработку персональных данных.'
  };
  var TEST_MODE = '<strong>Форма пока работает в тестовом режиме — сообщение не отправлено.</strong> ' +
    'Чтобы связаться с нами, позвоните по телефону <a class="nw" href="tel:+78123646180">+7 812 364 6180</a> ' +
    'или напишите на <a href="mailto:info@bollfilter.ru">info@bollfilter.ru</a>.';

  // Отметить поле ошибкой; text — подсказка под полем (пустая строка — только красная рамка)
  function mark(field, text) {
    var wrap = field.closest('.field');
    var hint = wrap.querySelector('.field-error');
    wrap.classList.add('has-error');
    field.setAttribute('aria-invalid', 'true');
    if (hint && text) { hint.textContent = text; hint.hidden = false; }
  }

  function clear(field) {
    var wrap = field.closest('.field');
    var hint = wrap.querySelector('.field-error');
    wrap.classList.remove('has-error');
    field.removeAttribute('aria-invalid');
    if (hint) { hint.textContent = ''; hint.hidden = true; }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    status.hidden = true;
    clear(fields.name); clear(fields.email); clear(fields.phone); clear(fields.consent);
    if (contactHint) contactHint.hidden = false;

    var name = fields.name.value.trim();
    var email = fields.email.value.trim();
    var phone = fields.phone.value.trim();
    var bad = [];

    if (!name) { mark(fields.name, MESSAGES.name); bad.push(fields.name); }
    if (!email && !phone) {
      mark(fields.email, MESSAGES.contact); mark(fields.phone, '');
      if (contactHint) contactHint.hidden = true;
      bad.push(fields.email);
    } else {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mark(fields.email, MESSAGES.email); bad.push(fields.email); }
      if (phone && (!/^[0-9+()\-\s]+$/.test(phone) || phone.replace(/\D/g, '').length < 10)) {
        mark(fields.phone, MESSAGES.phone); bad.push(fields.phone);
      }
    }

    // Согласие проверяется последним: курсор встаёт на первую незаполненную вещь сверху вниз
    if (!fields.consent.checked) { mark(fields.consent, MESSAGES.consent); bad.push(fields.consent); }

    if (bad.length) { bad[0].focus(); return; }

    status.innerHTML = TEST_MODE;
    status.hidden = false;
    status.scrollIntoView({ block: 'nearest' });
  });

  // Начал исправлять поле — подсказка у него исчезает (e-mail и телефон связаны: снимаем обе)
  form.addEventListener('input', function (event) {
    var field = event.target;
    if (field === fields.email || field === fields.phone) {
      clear(fields.email); clear(fields.phone);
      if (contactHint) contactHint.hidden = false;
    }
    else if (field === fields.name) clear(fields.name);
    else if (field === fields.consent) clear(fields.consent);
  });
})();

// Точки под лентой карточек в «Типах фильтров»: показывают, сколько карточек в категории и какая открыта.
// Разметку точек делает скрипт, поэтому в index.html ничего добавлять не нужно; на компьютере они скрыты
// стилями, а лента там не прокручивается, поэтому и переключать нечего.
(function () {
  var ленты = document.querySelectorAll('.category .cards');
  if (!ленты.length) return;

  Array.prototype.forEach.call(ленты, function (лента) {
    var карточки = лента.querySelectorAll('.card');
    if (карточки.length < 2) return;

    var точки = document.createElement('div');
    точки.className = 'cards-dots';

    // Каждая точка — кнопка: по нажатию лента плавно переходит к своей карточке и встаёт на неё целиком.
    // Подпись нужна только для чтения вслух, на экране её не видно.
    Array.prototype.forEach.call(карточки, function (карточка, номер) {
      var кнопка = document.createElement('button');
      кнопка.type = 'button';
      кнопка.setAttribute('aria-label', 'Фильтр ' + (номер + 1) + ' из ' + карточки.length);
      кнопка.addEventListener('click', function () {
        var куда = лента.scrollLeft
          + карточка.getBoundingClientRect().left - лента.getBoundingClientRect().left;
        лента.scrollTo({ left: куда, behavior: 'smooth' });
      });
      точки.appendChild(кнопка);
    });
    лента.parentNode.insertBefore(точки, лента.nextSibling);

    var активная = -1;
    function отметить() {
      var шаг = карточки[1].offsetLeft - карточки[0].offsetLeft;
      if (!шаг) return;
      var н = Math.round(лента.scrollLeft / шаг);
      if (н < 0) н = 0;
      if (н > карточки.length - 1) н = карточки.length - 1;
      if (н === активная) return;
      if (активная > -1) точки.children[активная].classList.remove('on');
      точки.children[н].classList.add('on');
      активная = н;
    }

    отметить();
    лента.addEventListener('scroll', отметить, { passive: true });
  });
})();

// «Области применения» на телефоне: тринадцать отраслей — складной список, открыта всегда одна.
// Кнопки-строки скрипт создаёт только на узком экране и убирает обратно на широком, поэтому
// компьютерная версия остаётся нетронутой. Если скрипт не отработает, все отрасли просто
// останутся раскрытыми — как было до этой доработки.
(function () {
  var отрасли = Array.prototype.slice.call(document.querySelectorAll('.areas .area'));
  if (!отрасли.length) return;
  var телефон = window.matchMedia('(max-width: 640px)');

  function свернуть(о) {
    о.classList.add('fold');
    о.classList.remove('open');
    var к = о.querySelector('.area-head');
    if (к) к.setAttribute('aria-expanded', 'false');
  }

  function раскрыть(о) {
    о.classList.remove('fold');
    о.classList.add('open');
    var к = о.querySelector('.area-head');
    if (к) к.setAttribute('aria-expanded', 'true');
  }

  // Закрывая отрасль выше по странице, мы убираем её высоту — и то, по чему только что нажали,
  // уехало бы вверх из-под пальца. Поэтому запоминаем положение строки и возвращаем его на место.
  function переключить(о) {
    var было = о.getBoundingClientRect().top;
    if (о.classList.contains('open')) {
      свернуть(о);
    } else {
      отрасли.forEach(свернуть);
      раскрыть(о);
    }
    window.scrollBy(0, о.getBoundingClientRect().top - было);
  }

  function собрать() {
    отрасли.forEach(function (о, номер) {
      var h3 = о.querySelector('h3');
      if (!h3 || о.querySelector('.area-head')) return;
      var кнопка = document.createElement('button');
      кнопка.type = 'button';
      кнопка.className = 'area-head';
      while (h3.firstChild) кнопка.appendChild(h3.firstChild);
      h3.appendChild(кнопка);
      кнопка.addEventListener('click', function () { переключить(о); });
    });
    отрасли.forEach(function (о, номер) { (номер === 0 ? раскрыть : свернуть)(о); });
  }

  function разобрать() {
    отрасли.forEach(function (о) {
      var к = о.querySelector('.area-head');
      if (к) {
        var h3 = к.parentNode;
        while (к.firstChild) h3.insertBefore(к.firstChild, к);
        h3.removeChild(к);
      }
      о.classList.remove('fold');
      о.classList.remove('open');
    });
  }

  function применить() { телефон.matches ? собрать() : разобрать(); }

  применить();
  телефон.addEventListener('change', применить);
})();
