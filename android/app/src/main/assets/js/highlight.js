(function () {
  try {
    var q = __QUERY__;
    if (!q || q.length < 2) return 'none';
    var body = document.body;
    if (!body) return 'none';

    var old = document.querySelectorAll('mark[data-dnd-hl]');
    for (var o = 0; o < old.length; o++) {
      var m = old[o];
      var parent = m.parentNode;
      if (!parent) continue;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    }

    var style = document.getElementById('dnd-hl-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dnd-hl-style';
      style.textContent = 'mark[data-dnd-hl]{background:#f2c14e;color:#1b1b1b;border-radius:2px;padding:0 1px;}' +
        'mark[data-dnd-hl].dnd-hl-first{background:#e8a33d;box-shadow:0 0 0 2px rgba(242,193,78,0.45);}';
      (document.head || document.documentElement).appendChild(style);
    }

    var ql = q.toLowerCase();
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || n.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p) return NodeFilter.FIL_REJECT;
        var tag = (p.nodeName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'mark' || tag === 'textarea' ||
            tag === 'input' || tag === 'select' || tag === 'title') return NodeFilter.FILTER_REJECT;
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    var nodes = [];
    var node;
    while ((node = walker.nextNode())) nodes.push(node);

    var count = 0;
    var first = null;
    for (var i = 0; i < nodes.length && count < 400; i++) {
      var textNode = nodes[i];
      var text = textNode.nodeValue;
      var lower = text.toLowerCase();
      if (lower.indexOf(ql) < 0) continue;
      var frag = document.createDocumentFragment();
      var from = 0;
      while (true) {
        var pos = lower.indexOf(ql, from);
        if (pos < 0) {
          frag.appendChild(document.createTextNode(text.substring(from)));
          break;
        }
        if (pos > from) frag.appendChild(document.createTextNode(text.substring(from, pos)));
        var mark = document.createElement('mark');
        mark.setAttribute('data-dnd-hl', '1');
        mark.textContent = text.substring(pos, pos + ql.length);
        if (!first) {
          first = mark;
          mark.className = 'dnd-hl-first';
        }
        frag.appendChild(mark);
        count++;
        from = pos + ql.length;
      }
      var parentNode = textNode.parentNode;
      if (!parentNode) continue;
      parentNode.replaceChild(frag, textNode);
    }

    if (first && first.scrollIntoView) {
      try { first.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) { }
    }
    return 'found:' + count;
  } catch (e) {
    return 'err';
  }
})()
