(function () {
  try {
    var total = document.body ? document.body.scrollHeight : 0;
    var y = 0, n = 0;
    var id = setInterval(function () {
      y += Math.max(320, window.innerHeight * 0.9);
      window.scrollTo(0, y);
      n++;
      if (y > total || n > 40) { clearInterval(id); window.scrollTo(0, 0); }
    }, 55);
    return 'ok';
  } catch (e) { return 'err'; }
})()
