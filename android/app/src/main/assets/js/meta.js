(function () {
  try {
    var title = document.title || '';
    var h1 = document.querySelector('h1');
    var heading = h1 ? (h1.innerText || h1.textContent || '') : '';
    var body = document.body ? (document.body.innerText || '').slice(0, 600) : '';
    var text = (title + ' ' + heading).toLowerCase();
    var notFound = text.indexOf('404') >= 0 ||
      text.indexOf('не найдена') >= 0 ||
      text.indexOf('не найден') >= 0 ||
      text.indexOf('not found') >= 0 ||
      body.toLowerCase().indexOf('запрашиваемая страница не найдена') >= 0 ||
      /\/404\/?$/.test(location.pathname || '');
    return { url: location.href, title: title, notFound: !!notFound };
  } catch (e) {
    return { url: '', title: '', notFound: false };
  }
})()
