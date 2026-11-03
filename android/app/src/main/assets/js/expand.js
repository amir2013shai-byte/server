(function () {
  try {
    var els = document.querySelectorAll('button, a, div, span');
    for (var i = 0; i < els.length; i++) {
      var tag = (els[i].tagName || '').toLowerCase();
      if (tag === 'a') {
        var href = els[i].getAttribute('href') || '';
        if (href && href.charAt(0) !== '#' && href.indexOf('javascript:') !== 0) continue;
      }
      var t = (els[i].textContent || '').trim().toLowerCase();
      if (t === 'загрузить больше' || t === 'показать ещё' || t === 'показать еще' ||
          t === 'показать больше' || t === 'load more' || t === 'показать все') {
        try { els[i].click(); return 'clicked'; } catch (e) { return 'error'; }
      }
    }
    return 'none';
  } catch (e) {
    return 'error';
  }
})()
