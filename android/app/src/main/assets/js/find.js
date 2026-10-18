(function () {
  var q = __QUERY__;
  var ql = q.toLowerCase();
  var best = null, score = 0;
  var nodes = document.querySelectorAll('article, .article, .card, li, .item, .spell, .monster, .class, .race, .feat');
  for (var i = 0; i < nodes.length; i++) {
    var t = (nodes[i].innerText || '').toLowerCase();
    if (!t) continue;
    var pos = t.indexOf(ql);
    if (pos < 0) continue;
    var s = 1000 - t.length + (pos === 0 ? 300 : 0);
    if (s > score) { score = s; best = nodes[i]; }
  }
  if (best) { best.scrollIntoView({block: 'center'}); return 'found'; }
  return 'notfound';
})()
