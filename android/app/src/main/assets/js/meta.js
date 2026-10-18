(function () {
  try {
    return {url: location.href, title: document.title || ''};
  } catch (e) {
    return {url: '', title: ''};
  }
})()
