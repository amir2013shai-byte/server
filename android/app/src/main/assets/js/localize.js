(function () {
  try {
    var map = __MAP__;
    var as = document.querySelectorAll('a[href]');
    var n = 0;
    for (var i = 0; i < as.length; i++) {
      var a = as[i];
      var href = a.href;
      if (!href) continue;
      var key = href.split('#')[0];
      if (map[key]) { a.setAttribute('href', map[key]); n++; continue; }
      var trimmed = key;
      while (trimmed.length > 8 && trimmed.charAt(trimmed.length - 1) === '/') {
        trimmed = trimmed.substring(0, trimmed.length - 1);
      }
      if (map[trimmed]) { a.setAttribute('href', map[trimmed]); n++; }
    }
    return 'ok:' + n;
  } catch (e) {
    return 'error';
  }
})()
