(function () {
  try {
    if (window.__dndEmbed && !window.__dndEmbed.done) return 'running';
    var st = {done: false, ok: 0, fail: 0, css: 0, total: 0};
    window.__dndEmbed = st;
    var MAX_IMAGES = 140;
    var MAX_SIDE = 1600;

    function abs(u) { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } }
    function sameDnd(u) { return /^https?:\/\/[a-z0-9.-]*dnd\.su(\/|$)/i.test(u); }
    function toData(blob) {
      return new Promise(function (res, rej) {
        var f = new FileReader();
        f.onload = function () { res(f.result); };
        f.onerror = rej;
        f.readAsDataURL(blob);
      });
    }

    function imgJob(img) {
      return function (cb) {
        if (!img || !img.getAttribute) { cb(); return; }
        var src = img.currentSrc || img.getAttribute('src') || '';
        if (!src || src.indexOf('data:') === 0 || !/^https?:/i.test(src)) { cb(); return; }
        st.total++;
        if (!img.complete || !img.naturalWidth) {
          setTimeout(function () {
            if (!img.complete || !img.naturalWidth) { st.fail++; cb(); return; }
            embedImg();
          }, 700);
          return;
        }
        embedImg();

        function embedImg() {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w * h > 18000000) { st.fail++; cb(); return; }
        var ext = (src.split('?')[0].split('.').pop() || '').toLowerCase();
        var keepPng = (ext === 'png' || ext === 'gif' || ext === 'svg' || ext === 'webp');
        try {
          var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = cw; canvas.height = ch;
          var ctx = canvas.getContext('2d');
          if (!keepPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); }
          ctx.drawImage(img, 0, 0, cw, ch);
          var data = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
          if (data && data.length > 150) {
            img.setAttribute('src', data);
            img.removeAttribute('srcset');
            dropSrcset(img);
            st.ok++; cb(); return;
          }
        } catch (e) { /* tainted canvas, fall through to fetch */ }
        try {
          fetch(src, {credentials: 'omit'})
            .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
            .then(toData)
            .then(function (d) {
              img.setAttribute('src', d);
              img.removeAttribute('srcset');
              dropSrcset(img);
              st.ok++; cb();
            })
            .catch(function () { st.fail++; cb(); });
        } catch (e) {
          st.fail++; cb();
        }
        }

        function dropSrcset(img) {
          try {
            var pic = img.parentNode;
            if (pic && pic.tagName && pic.tagName.toLowerCase() === 'picture') {
              var sources = pic.querySelectorAll('source');
              for (var i = 0; i < sources.length; i++) sources[i].removeAttribute('srcset');
            }
          } catch (e) {}
        }
      };
    }

    var jobs = [];
    var imgs = Array.prototype.slice.call(document.images || []).slice(0, MAX_IMAGES);
    imgs.forEach(function (img) { jobs.push(imgJob(img)); });

    var links = Array.prototype.slice.call(document.querySelectorAll('link[rel~="stylesheet"][href]'));
    links.forEach(function (link) {
      var href = link.href || '';
      if (!sameDnd(href)) return;
      jobs.push(function (cb) {
        fetch(href, {credentials: 'omit'})
          .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.text(); })
          .then(function (css) {
            css = css.replace(/url\((['"]?)([^'")]+)\1\)/g, function (m, q, u) {
              if (!u || u.indexOf('data:') === 0 || u.charAt(0) === '#' || /^https?:/i.test(u)) return m;
              try { return 'url(' + abs(new URL(u, href).href) + ')'; } catch (e) { return m; }
            });
            var style = document.createElement('style');
            style.setAttribute('data-dnd-css', href);
            style.textContent = css;
            if (link.parentNode) link.parentNode.replaceChild(style, link);
            st.css++; cb();
          })
          .catch(function () { st.fail++; cb(); });
      });
    });

    var i = 0, active = 0, finished = false;
    function done() { if (finished) return; finished = true; st.done = true; }
    function next() {
      while (active < 4 && i < jobs.length) {
        var job = jobs[i++]; active++;
        try {
          job(function () {
            active--;
            if (i >= jobs.length && active === 0) done(); else next();
          });
        } catch (e) {
          active--;
          st.fail++;
          if (i >= jobs.length && active === 0) done(); else next();
        }
      }
      if (i >= jobs.length && active === 0) done();
    }
    if (!jobs.length) done(); else next();
    setTimeout(done, 30000);
    return 'started';
  } catch (e) {
    window.__dndEmbed = {done: true, ok: 0, fail: 1, error: String(e)};
    return 'error';
  }
})()
