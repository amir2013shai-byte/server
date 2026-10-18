(function () {
  var tries = 0, clicked = 0;
  var id = setInterval(function () {
    tries++;
    var els = document.querySelectorAll('button, a, div, span');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim().toLowerCase();
      if (t === 'загрузить больше' || t === 'показать ещё' || t === 'показать еще' ||
          t === 'показать больше' || t === 'load more') {
        try { els[i].click(); clicked++; } catch (e) {}
        if (clicked > 5) { clearInterval(id); return 'ok'; }
        break;
      }
    }
    if (tries > 12) { clearInterval(id); }
  }, 350);
  return 'ok';
})()
