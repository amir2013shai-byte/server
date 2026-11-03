(function () {
  try {
    var old = document.getElementById('dnd-dark-style');
    if (old) { old.parentNode.removeChild(old); return 'off'; }
    var st = document.createElement('style');
    st.id = 'dnd-dark-style';
    st.textContent =
      'html,body{background:#12100d !important;color:#e6dccb !important}' +
      'body *:not(img):not(svg):not(video):not(canvas):not(iframe):not(path){background-color:transparent !important;border-color:#3a3125 !important;box-shadow:none !important}' +
      'body *{color:#e6dccb !important}' +
      'body a,body a *{color:#e3bc66 !important}' +
      'input,textarea,select{background-color:#241d16 !important;color:#e6dccb !important}' +
      'img{opacity:.92}';
    document.head.appendChild(st);
    return 'on';
  } catch (e) {
    return 'error';
  }
})()
