# Как собрать APK (Android)

Игра сделана как веб-приложение (Vite + Three.js) и упаковывается в нативный APK
через **Capacitor**. В этой песочнице нет Android SDK / Google Maven, поэтому сам APK
собирается на вашем компьютере — это займёт 5–10 минут.

## Быстрый путь (нужны Node.js 18+ и Android Studio)

```bash
# 1. Установить зависимости
npm install

# 2. Собрать веб-часть
npm run build

# 3. Добавить Android-проект (один раз)
npx cap add android

# 4. Синхронизировать сборку в Android-проект
npx cap sync android

# 5. Собрать APK
cd android
./gradlew assembleDebug      # Linux/macOS
gradlew.bat assembleDebug    # Windows
```

Готовый APK появится здесь:
`android/app/build/outputs/apk/debug/app-debug.apk`

Скопируйте его на телефон и установите (нужно разрешить «Установка из неизвестных источников»).

## Через Android Studio (проще для новичков)

1. `npm install && npm run build && npx cap add android && npx cap sync android`
2. Откройте папку `android` в Android Studio
3. Дождитесь синхронизации Gradle
4. Меню **Build → Build App Bundle(s) / APK(s) → Build APK(s)**
5. APK будет в `android/app/build/outputs/apk/debug/`

## Запуск на телефоне без сборки APK

1. Запустите `npm run dev` и откройте сайт в браузере телефона
2. Меню браузера → **«Установить приложение»** (PWA)
3. Игра появится на рабочем столе и будет работать полноэкранно

## Релизная сборка (подписанный APK)

```bash
cd android
./gradlew assembleRelease
```

Для подписи создайте keystore и настройте `android/app/build.gradle`
(стандартная инструкция Android Developer → «Sign your app»).

## Примечания

- Игра полностью офлайновая: все карты, колоды и пользовательский контент
  хранятся в localStorage устройства.
- Иконка приложения: `public/icon.png` (512×512).
- `capacitor.config.json` уже настроен: `appId = com.battlecards.royale`.
