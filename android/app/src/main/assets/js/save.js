(function () {
  try {
    var head = document.head || document.documentElement;
    if (!document.querySelector('base')) {
      var b = document.createElement('base');
      b.setAttribute('href', location.href);
      head.insertBefore(b, head.firstChild);
    }
    var kill = document.querySelectorAll('script,noscript,iframe,object,embed,link[rel="preconnect"],link[rel="dns-prefetch"],link[rel="preload"],link[rel="prefetch"]');
    for (var i = kill.length - 1; i >= 0; i--) {
      if (kill[i].parentNode) kill[i].parentNode.removeChild(kill[i]);
    }
    var attrs = document.querySelectorAll('[onclick],[onload],[onerror],[onmousedown]');
    for (var j = 0; j < attrs.length; j++) {
      attrs[j].removeAttribute('onclick');
      attrs[j].removeAttribute('onload');
      attrs[j].removeAttribute('onerror');
      attrs[j].removeAttribute('onmousedown');
    }
    document.documentElement.setAttribute('data-dnd-saved', new Date().toISOString());
    var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    if (window.DndBridge && DndBridge.save) { DndBridge.save(html); return 'sent'; }
    return 'nobridge';
  } catch (e) {
    return 'error:' + e;
  }
})()
