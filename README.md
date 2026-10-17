# PojavLauncher — сборка для Minecraft Java 1.21.1 + NeoForge

Android-приложение (APK), запускающее **настоящую Minecraft Java Edition** (в том числе
**1.21.1 с модами NeoForge**) на телефоне или планшете.

Основано на [PojavLauncher](https://github.com/PojavLauncherTeam/PojavLauncher) (LGPL-3.0)
с добавленной **нативной поддержкой установки NeoForge** (в апстриме её нет — см. «Что изменено»).

> ⚠️ **Правовая информация.** Сам Minecraft в APK **не входит** и не распространяется.
> Игра скачивается с официальных серверов Mojang после входа в **ваш аккаунт Microsoft**
> (нужна лицензионная копия игры). Установщик NeoForge скачивается с официального maven
> `maven.neoforged.net` при установке. Это тот же принцип, что у официального лаунчера.

---

## 📲 Как получить APK

1. Откройте вкладку **Actions** этого репозитория.
2. Выберите последний успешный запуск workflow **Build Android APK**.
3. Внизу страницы скачайте артефакт **PojavLauncher-NeoForge-1.21.1-debug**
   (внутри — `PojavLauncher-NeoForge-1.21.1-debug.apk`, ~150 МБ).
4. Установите APK на устройство (разрешите установку из неизвестных источников).

Либо запустите сборку вручную: вкладка **Actions → Build Android APK → Run workflow**.
Сборка занимает ~10–15 минут. APK подписан debug-ключом — для установки достаточно
разрешить «неизвестные источники».

## 🎮 Как играть (1.21.1 + NeoForge)

1. Запустите приложение, войдите в **аккаунт Microsoft** (лицензия Minecraft Java).
2. В списке версий выберите **1.21.1** и запустите — лаунчер скачает игру
   и Java 21 (идут в комплекте с APK, интернет нужен только для файлов игры).
3. Вернитесь в лаунчер → **Управление профилями → Версия с NeoForge**.
4. В списке версий NeoForge (версии Minecraft отсортированы, **1.21.1 сверху**)
   выберите свежую `21.1.x` (например, `21.1.209` или новее).
   Установщик отработает автоматически в headless-режиме — просто дождитесь
   сообщения об успешной установке в окне лога.
5. Скачайте моды для **NeoForge 1.21.1** (с CurseForge/Modrinth) и положите `.jar`
   в `games/PojavLauncher/.minecraft/mods` (папка появится после первого запуска).
6. В списке версий выберите `neoforge-21.1.x` → **Play**.

Управление — сенсорные кнопки (готовые раскладки есть в настройках), поддерживаются
геймпады и клавиатура. Рендер — gl4es/LTW/VirGL/Zink на выбор (Настройки → Видео).

**Советы:**
- Выдайте лаунчеру 2–4 ГБ ОЗУ (Настройки), для тяжёлых сборок — ближе к максимуму.
- Если игра тормозит — попробуйте рендер «LTW (ANGLE)» или уменьшите дальность прорисовки.
- Виртуальная мышь для меню установки — свайп по нижней панели.

## 🔧 Что изменено относительно апстрима PojavLauncher

| Изменение | Назначение |
|---|---|
| `modloaders/NeoForge*.java`, `fragments/NeoForgeInstallFragment.java` | Загрузка списка версий NeoForge с maven `maven.neoforged.net` (JSON API), группировка по версиям Minecraft (1.21.1 закреплена сверху), скачивание установщика |
| Headless-установка `--install-client` | Установщик NeoForge запускается в консольном режиме через `JavaGUILauncherActivity` — без GUI-автоматизации и без 30-секундного таймаута java-агента Forge |
| `JavaGUILauncherActivity` | Новый режим headless-установки: выбор JRE по требуемой версии Java (21), без ограничения «caciocavallo ≤ Java 17», т.к. GUI не используется |
| Автоподготовка | Перед установкой гарантируется наличие `launcher_profiles.json` и рантайма Java 21 (распаковка встроенного «Internal-21») |
| `.github/workflows/android.yml` | Рабочий CI: JRE-компоненты берутся из последнего официального релиза PojavLauncher (репозиторий сборок JRE апстрима заархивирован) |

NeoForge-профиль (`neoforge-21.1.x`, mainClass `cpw.mods.bootstraplauncher.BootstrapLauncher`,
модульные аргументы `-p`/`--ignoreList`) совместим с существующим механизмом запуска
Forge 1.17+ — изменений в механизме запуска игры не потребовалось.

## 🛠 Сборка из исходников

```bash
# Требуется: JDK 17+, Android SDK (API 34), NDK 25.2.9519653
cd app_pojavlauncher/libs
wget https://github.com/PojavLauncherTeam/LTW/releases/latest/download/ltw-release.aar
cd ../..
./scripts/languagelist_updater.sh
./gradlew :jre_lwjgl3glfw:build :app_pojavlauncher:assembleDebug
# APK: app_pojavlauncher/build/outputs/apk/debug/app_pojavlauncher-debug.apk
```

APK из CI дополнительно включает встроенные Java-рантаймы (8/17/21), извлечённые из
официального релиза PojavLauncher — тогда Java скачивается при первом запуске не нужно.

## ⚖️ Лицензии и благодарности

- [PojavLauncher](https://github.com/PojavLauncherTeam/PojavLauncher) — LGPL-3.0,
  PojavLauncherTeam. Данный проект — модификация их кода, исходники доступны в этом
  репозитории (требование LGPL соблюдено).
- [NeoForge](https://github.com/neoforged/NeoForge) — LGPL-2.1, NeoForged.
  Устанавливается с официальных серверов, в APK не входит.
- Minecraft — торговая марка Mojang/Microsoft. Проект не связан с Mojang.
- Minecraft Java требует лицензионной копии игры и аккаунта Microsoft.
