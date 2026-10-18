(function () {
  try {
    var dark = __DARK__;
    if (window.__dndReaderOriginal) {
      document.body.innerHTML = window.__dndReaderOriginal;
      window.__dndReaderOriginal = null;
      var oldStyle = document.getElementById('dnd-reader-style');
      if (oldStyle) oldStyle.parentNode.removeChild(oldStyle);
      return 'off';
    }
    var candidates = [].slice.call(document.querySelectorAll('article, main, .article, .article-body, .content, .entry-content, .post-content, #content, .container'));
    var best = null, bestLen = 0;
    candidates.forEach(function (el) {
      var text = (el.innerText || '').trim();
      if (text.length > bestLen) { bestLen = text.length; best = el; }
    });
    if (!best || bestLen < 400) best = document.body;
    window.__dndReaderOriginal = document.body.innerHTML;
    var title = document.title || '';
    var wrap = document.createElement('div');
    wrap.id = 'dnd-reader';
    var h1 = document.createElement('div');
    h1.id = 'dnd-reader-title';
    h1.textContent = title;
    wrap.appendChild(h1);
    var clone = best.cloneNode(true);
    clone.removeAttribute('id');
    var junk = clone.querySelectorAll('script,style,nav,aside,form,iframe,.comments,.comment,.sidebar,.ad,.ads,.share,.social');
    for (var i = junk.length - 1; i >= 0; i--) {
      if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
    }
    wrap.appendChild(clone);
    var style = document.createElement('style');
    style.id = 'dnd-reader-style';
    var bg = dark ? '#15120e' : '#f4efe5';
    var fg = dark ? '#e8dcc8' : '#211a12';
    var link = dark ? '#e3bc66' : '#8C1D18';
    var soft = dark ? '#2a231a' : '#e5dccb';
    style.textContent = 'html,body{background:' + bg + ' !important;color:' + fg + ' !important;}' +
      '#dnd-reader{max-width:840px;margin:0 auto;padding:18px 18px 70px;font-family:Georgia,"Times New Roman",serif;font-size:18px;line-height:1.65;}' +
      '#dnd-reader *{color:' + fg + ' !important;background-color:transparent !important;border-color:' + soft + ' !important;}' +
      '#dnd-reader a,#dnd-reader a *{color:' + link + ' !important;text-decoration:underline;}' +
      '#dnd-reader img{max-width:100% !important;height:auto !important;border-radius:8px;display:block;margin:12px auto;}' +
      '#dnd-reader table{width:100% !important;border-collapse:collapse;display:block;overflow-x:auto;}' +
      '#dnd-reader td,#dnd-reader th{border:1px solid ' + soft + ' !important;padding:6px;}' +
      '#dnd-reader h1,#dnd-reader h2,#dnd-reader h3{line-height:1.25;}' +
      '#dnd-reader-title{font-size:26px;font-weight:700;margin:6px 0 18px;line-height:1.22;}' +
      '#dnd-reader hr{border:none;border-top:1px solid ' + soft + ';margin:18px 0;}' +
      '#dnd-reader blockquote{border-left:3px solid ' + link + ';margin:12px 0;padding:4px 14px;}' +
      '#dnd-reader .dnd-hint{font-size:12px;opacity:.7;margin-top:28px;}';
    document.head.appendChild(style);
    document.body.innerHTML = '';
    document.body.appendChild(wrap);
    var hint = document.createElement('div');
    hint.className = 'dnd-hint';
    hint.textContent = 'Режим чтения D&D.su';
    wrap.appendChild(hint);
    window.scrollTo(0, 0);
    return 'on';
  } catch (e) {
    return 'error';
  }
})()
