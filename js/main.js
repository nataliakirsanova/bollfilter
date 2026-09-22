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
  var fields = {
    name: form.elements.name,
    email: form.elements.email,
    phone: form.elements.phone
  };

  // Текст про e-mail или телефон — дословно из юридического пакета («Готовые тексты интерфейса»)
  var MESSAGES = {
    name: 'Укажите имя.',
    contact: 'Укажите e-mail или телефон, по которому можно ответить на обращение.',
    email: 'Проверьте адрес e-mail.',
    phone: 'Проверьте номер телефона: цифры, пробелы и знаки + ( ) -.'
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
    clear(fields.name); clear(fields.email); clear(fields.phone);

    var name = fields.name.value.trim();
    var email = fields.email.value.trim();
    var phone = fields.phone.value.trim();
    var bad = [];

    if (!name) { mark(fields.name, MESSAGES.name); bad.push(fields.name); }
    if (!email && !phone) {
      mark(fields.email, MESSAGES.contact); mark(fields.phone, '');
      bad.push(fields.email);
    } else {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mark(fields.email, MESSAGES.email); bad.push(fields.email); }
      if (phone && (!/^[0-9+()\-\s]+$/.test(phone) || phone.replace(/\D/g, '').length < 10)) {
        mark(fields.phone, MESSAGES.phone); bad.push(fields.phone);
      }
    }

    if (bad.length) { bad[0].focus(); return; }

    status.innerHTML = TEST_MODE;
    status.hidden = false;
    status.scrollIntoView({ block: 'nearest' });
  });

  // Начал исправлять поле — подсказка у него исчезает (e-mail и телефон связаны: снимаем обе)
  form.addEventListener('input', function (event) {
    var field = event.target;
    if (field === fields.email || field === fields.phone) { clear(fields.email); clear(fields.phone); }
    else if (field === fields.name) clear(fields.name);
  });
})();
