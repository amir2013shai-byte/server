(function () {
  var out = [];
  var seen = {};
  var as = document.querySelectorAll('a[href]');
  for (var i = 0; i < as.length; i++) {
    var u = as[i].href;
    if (!u) continue;
    u = u.split('#')[0];
    if (seen[u]) continue;
    seen[u] = 1;
    var t = (as[i].textContent || '').replace(/\s+/g, ' ').trim();
    out.push([u, t]);
  }
  return out;
})()
