(function () {
  try {
    function hostOf(u) {
      var m = /^https?:\/\/([^\/?#]+)/i.exec(u);
      if (!m) return '';
      return m[1].toLowerCase().replace(/:\d+$/, '');
    }

    function isDndSite(u) {
      var h = hostOf(u);
      if (!h) return false;
      if (h === 'dnd.su' || h === 'www.dnd.su' || h === 'next.dnd.su' || h === '5e14.dnd.su') return true;
      return h.length > 7 && h.slice(-7) === '.dnd.su';
    }

    function cleanText(v) {
      return (v || '').replace(/\s+/g, ' ').trim();
    }

    /* Yandex sometimes wraps result links into /clck/jsredir?...&url=<base64>. */
    function decodeRedirect(href) {
      if (href.indexOf('yandex.') < 0) return href;
      if (href.indexOf('/clck/') < 0 && href.indexOf('/redir') < 0) return href;
      var m = /[?&]url=([^&]+)/i.exec(href);
      if (!m) return href;
      var val = m[1];
      try { val = decodeURIComponent(val); } catch (e) { }
      if (!/^https?:\/\//i.test(val)) {
        try {
          var b = val.replace(/-/g, '+').replace(/_/g, '/');
          while (b.length % 4 !== 0) b += '=';
          var decoded = atob(b);
          if (/^https?:\/\//i.test(decoded)) val = decoded;
        } catch (e2) { }
      }
      return val;
    }

    function hasCaptcha() {
      var href = location.href || '';
      if (/showcaptcha|checkcaptcha/i.test(href)) return true;
      if (document.querySelector('.SmartCaptcha, .CheckboxCaptcha, #captcha-container, form[action*="captcha"], input[name="captcha"]')) {
        return true;
      }
      var body = document.body ? (document.body.innerText || document.body.textContent || '') : '';
      body = body.toLowerCase();
      return body.indexOf('подтвердите, что запросы отправляли вы') >= 0 ||
        body.indexOf('вы не робот') >= 0 ||
        body.indexOf('are you not a robot') >= 0;
    }

    var items = [];
    var index = {};
    var anchors = document.querySelectorAll('a[href]');

    for (var i = 0; i < anchors.length && items.length < 30; i++) {
      var a = anchors[i];
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') continue;
      if (href.indexOf('//') === 0) href = 'https:' + href;
      href = decodeRedirect(href);
      if (href.indexOf('http') !== 0) continue;
      if (!isDndSite(href)) continue;

      var url = href.split('#')[0];
      if (/^https?:\/\/(www\.)?dnd\.su\/?$/i.test(url)) continue;

      var title = cleanText(a.innerText || a.textContent || '');
      if (title.length < 2) {
        title = cleanText(a.getAttribute('aria-label') || a.getAttribute('title') || '');
      }
      if (!title) continue;

      if (index[url] === undefined) {
        index[url] = items.length;
        items.push({ url: url, title: title });
      } else if (items[index[url]].title.length < title.length) {
        items[index[url]].title = title;
      }
    }

    return JSON.stringify({
      captcha: hasCaptcha(),
      items: items,
      url: location.href || ''
    });
  } catch (e) {
    return JSON.stringify({ captcha: false, items: [], error: String(e) });
  }
})()
