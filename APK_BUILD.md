# Как собрать APK (Android)

Игра сделана как веб-приложение (Vite + Three.js) и упаковывается в нативный APK.

## ✅ Вариант 1: готовый APK уже собран

В репозитории лежит собранный APK:

- `dist-apk/Королевские-Схватки.apk` — копируйте на телефон и установите
  (Настройки → Безопасность → «Установка из неизвестных источников»).

Это WebView-оболочка с полной офлайн-игрой внутри (подпись v1, minSdk 24 / targetSdk 28).

## Вариант 2: пересобрать APK без Android SDK (скрипт)

```bash
pip install jdk4py pyaxmlparser   # JRE с java/keytool + валидатор
python3 tools/apk/build_apk.py
```

Скрипт сам скачивает smali-ассемблер из npm, собирает `classes.dex` из
`tools/apk/MainActivity.smali`, генерирует бинарный AndroidManifest.xml (AXML),
запаковывает игру одним файлом, выравнивает ZIP и подписывает APK (PKCS#7 v1).
Никакой Android SDK не нужен. Результат: `dist-apk/Королевские-Схватки.apk`.

## Вариант 3: классический путь через Capacitor + Android Studio

Нужны Node.js 18+ и Android Studio.

```bash
npm install
npm run build
npx cap add android
npx cap sync android
cd android
./gradlew assembleDebug      # Linux/macOS
gradlew.bat assembleDebug    # Windows
```

Готовый APK появится здесь:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Запуск на телефоне без сборки APK

1. Запустите `npm run dev` и откройте сайт в браузере телефона
2. Меню браузера → **«Установить приложение»** (PWA)
3. Игра появится на рабочем столе и будет работать полноэкранно

## Примечания

- Игра полностью офлайновая: все карты, колоды и пользовательский контент
  хранятся в localStorage устройства.
- Иконка приложения: `public/icon.png` (512×512).
- `capacitor.config.json` уже настроен: `appId = com.battlecards.royale`.
- Собранный APK подписан самоподписанным сертификатом (v1) — это нормально
  для установки «из файлов». Google Play требует подпись v2+ и свой keystore.
