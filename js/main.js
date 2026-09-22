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
