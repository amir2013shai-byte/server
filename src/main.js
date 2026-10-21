// Точка входа: загрузка стилей и запуск приложения.
import './styles.css';
import { App } from './ui.js';

function boot() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  window.__app = new App(root);

  // разблокировка AudioContext по первому касанию (требование мобильных браузеров)
  const unlock = () => {
    try {
      const ac = window.__app.sfx._ac();
      if (ac && ac.state === 'suspended') ac.resume();
    } catch { /* ignore */ }
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
