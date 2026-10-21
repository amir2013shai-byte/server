#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Сборка APK «Королевские Схватки» без Android SDK.

Конвейер:
  1. npm-пакеты: smali-ассемблер (alpakka) и d8 (запасной путь)
  2. smali -> classes.dex (через java из jdk4py или JAVA_HOME)
  3. esbuild -> один файл игры (IIFE) -> assets/index.html
  4. AndroidManifest.xml в бинарном формате AXML (генерируется здесь)
  5. ZIP с выравниванием 4 байта + подпись APK Signature Scheme v1 (openssl cms)

Запуск:  python3 tools/apk/build_apk.py
Результат: dist-apk/Королевские-Схватки.apk
"""
import hashlib
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOLS = Path(__file__).resolve().parent
CACHE = TOOLS / ".cache"
OUT_DIR = ROOT / "dist-apk"
APK_NAME = "Королевские-Схватки.apk"

PACKAGE = "com.battlecards.royale"
ACTIVITY = "com.battlecards.royale.MainActivity"
LABEL = "Королевские Схватки"

# ---------------------------------------------------------------- java / npm

def find_java():
    env = os.environ.get("JAVA")
    if env and Path(env).exists():
        return env
    which = shutil.which("java")
    if which:
        return which
    for cand in (
        Path.home() / ".local/lib/python3.11/site-packages/jdk4py/java-runtime/bin/java",
        Path.home() / ".local/lib/python3.12/site-packages/jdk4py/java-runtime/bin/java",
    ):
        if cand.exists():
            return str(cand)
    sys.exit("Не найден java. Установите: pip install jdk4py  (или задайте $JAVA)")


def fetch_jar(pkg, version, name, url):
    dst = CACHE / name
    if dst.exists():
        return dst
    CACHE.mkdir(parents=True, exist_ok=True)
    tgz = CACHE / f"{pkg.replace('/', '_')}-{version}.tgz"
    if not tgz.exists():
        print(f"  ⤓ {pkg}@{version}")
        urllib.request.urlretrieve(url, tgz)
    import tarfile
    with tempfile.TemporaryDirectory() as td:
        with tarfile.open(tgz, "r:gz") as t:
            t.extractall(td)
        hits = list(Path(td).rglob(name)) or list(Path(td).rglob(name.split("-")[0] + "*.jar"))
        if not hits:
            sys.exit(f"В пакете {pkg} не найден {name}")
        shutil.copy(hits[0], dst)
    return dst


def extract_all_jars(pkg, version, url):
    """Распаковать все .jar из npm-пакета в кэш (один раз)."""
    marker = CACHE / f".{pkg.replace('/', '_')}-extracted"
    if marker.exists():
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    tgz = CACHE / f"{pkg.replace('/', '_')}-{version}.tgz"
    if not tgz.exists():
        print(f"  ⤓ {pkg}@{version}")
        urllib.request.urlretrieve(url, tgz)
    import tarfile
    with tarfile.open(tgz, "r:gz") as t:
        for m in t.getmembers():
            if m.name.endswith(".jar"):
                f = t.extractfile(m)
                if f:
                    (CACHE / Path(m.name).name).write_bytes(f.read())
    marker.write_text("ok")


def ensure_tool_jars():
    print("• Инструменты")
    registry = "https://registry.npmjs.org"
    import json
    # smali-ассемблер (и зависимости) из @specs-feup/alpakka
    req = urllib.request.urlopen(f"{registry}/@specs-feup%2Falpakka").read()
    meta = json.loads(req)
    ver = meta["dist-tags"]["latest"]
    extract_all_jars("@specs-feup/alpakka", ver, meta["versions"][ver]["dist"]["tarball"])
    # d8 — запасной конвертер class->dex
    req = urllib.request.urlopen(f"{registry}/d8-termux").read()
    meta = json.loads(req)
    ver = meta["dist-tags"]["latest"]
    tgz_url = meta["versions"][ver]["dist"]["tarball"]
    fetch_jar("d8-termux", ver, "d8.jar", tgz_url)
    jars = {p.name: p for p in CACHE.glob("*.jar")}
    need = ("smali-3", "smali-util", "smali-dexlib2", "guava", "jcommander", "antlr-runtime")
    if not any(k in n for n in jars for k in need[:3]):
        sys.exit(f"В кэше нет smali-джарников: {list(jars)}")
    return jars

# ---------------------------------------------------------------- smali -> dex

def build_dex(java, jars):
    print("• classes.dex (smali)")
    smali_cp = ":".join(str(p) for p in jars.values() if "d8" not in p.name)
    with tempfile.TemporaryDirectory() as td:
        dex = Path(td) / "classes.dex"
        cmd = [
            java, "-Xmx512m", "-cp", smali_cp,
            "com.android.tools.smali.smali.Main",
            "assemble", str(TOOLS / "MainActivity.smali"),
            "-o", str(dex),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0 or not dex.exists():
            sys.exit(f"smali не собрался:\n{r.stdout}\n{r.stderr}")
        data = dex.read_bytes()
    if data[:4] != b"dex\n":
        sys.exit("Некорректный DEX")
    print(f"    DEX {len(data)} байт")
    return data

# ---------------------------------------------------------------- AXML / ресурсы (aapt2)

PLAIN_MANIFEST = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="{package}"
    android:versionCode="1"
    android:versionName="1.0">
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="28" />
    <application
        android:label="{label}"
        android:icon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true">
        <activity
            android:name="{activity}"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:screenOrientation="portrait">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
"""


def ensure_aapt2():
    """aapt2 из apktool-lib (npm @specs-feup/alpakka) + android.jar (GitHub)."""
    aapt2 = CACHE / "aapt2"
    if not aapt2.exists():
        jar = CACHE / "apktool-lib-2.9.3.jar"
        if not jar.exists():
            return None, None
        import zipfile, stat
        with zipfile.ZipFile(jar) as z:
            aapt2.write_bytes(z.read("prebuilt/linux/aapt2_64"))
        aapt2.chmod(aapt2.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    android_jar = CACHE / "android-25" / "android.jar"
    if not android_jar.exists():
        print("  ⤓ android.jar (Sable/android-platforms)")
        import shutil as sh
        repo = CACHE / "android-platforms"
        if not (repo / ".git").exists():
            subprocess.run(
                ["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
                 "https://github.com/Sable/android-platforms.git", str(repo)],
                check=True, capture_output=True,
            )
        subprocess.run(
            ["git", "-C", str(repo), "sparse-checkout", "set", "android-25"],
            check=True, capture_output=True,
        )
        android_jar.parent.mkdir(parents=True, exist_ok=True)
        sh.copy(repo / "android-25" / "android.jar", android_jar)
    return str(aapt2), str(android_jar)


def build_resources_axml(game_html):
    """
    Полноценные манифест + resources.arsc + иконка через aapt2.
    Возвращает dict {имя_в_apk: bytes} или None, если aapt2 недоступен.
    """
    aapt2, android_jar = ensure_aapt2()
    if not aapt2:
        return None
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        (td / "AndroidManifest.xml").write_text(
            PLAIN_MANIFEST.format(package=PACKAGE, label=LABEL, activity=ACTIVITY),
            encoding="utf-8",
        )
        # ресурсы-иконки
        res_src = TOOLS / "res"
        flat_dir = td / "flat"
        flat_dir.mkdir()
        flats = []
        for png in sorted(res_src.glob("mipmap-*/ic_launcher.png")):
            r = subprocess.run(
                [aapt2, "compile", "-o", str(flat_dir), str(png)],
                capture_output=True, text=True,
            )
            if r.returncode != 0:
                sys.exit(f"aapt2 compile:\n{r.stdout}\n{r.stderr}")
            flats += list(flat_dir.glob("*.flat"))
        # ассеты
        assets = td / "assets"
        assets.mkdir()
        (assets / "index.html").write_bytes(game_html)
        out_apk = td / "skeleton.apk"
        cmd = [
            aapt2, "link", "-o", str(out_apk),
            "-I", android_jar,
            "--manifest", str(td / "AndroidManifest.xml"),
            "--min-sdk-version", "24", "--target-sdk-version", "28",
            "--version-code", "1", "--version-name", "1.0",
            "-A", str(assets),
            "--auto-add-overlay",
        ]
        for f in flats:
            cmd += ["-R", str(f)]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f"aapt2 link:\n{r.stdout}\n{r.stderr}")
        import zipfile as zf
        with zf.ZipFile(out_apk) as z:
            return {name: z.read(name) for name in z.namelist()}


# ---------------------------------------------------------------- бинарный AXML (запасной путь)

class AxmlBuilder:
    """Минимальный генератор Android binary XML (AXML)."""

    # публичные ID атрибутов фреймворка (AOSP public.xml, стабильные)
    ANDROID_ATTRS = {
        "name": 0x01010003,
        "label": 0x01010001,
        "exported": 0x01010010,
        "versionCode": 0x0101021B,
        "versionName": 0x0101021C,
        "minSdkVersion": 0x0101020C,
        "targetSdkVersion": 0x01010270,
        "configChanges": 0x0101001F,
        "screenOrientation": 0x0101001E,
        "hardwareAccelerated": 0x010102D3,
    }
    TYPE_STRING = 0x03
    TYPE_INT_DEC = 0x10
    TYPE_INT_BOOLEAN = 0x12
    NO_INDEX = 0xFFFFFFFF

    def __init__(self):
        # сначала имена android:-атрибутов (позиционная карта ресурсов)
        self.strings = []
        self.index = {}
        self.res_ids = []
        for name, rid in self.ANDROID_ATTRS.items():
            self._str(name)
            self.res_ids.append(rid)
        self.ns_uri = self._str("http://schemas.android.com/apk/res/android")
        self.ns_prefix = self._str("android")

    def _str(self, s):
        if s not in self.index:
            self.index[s] = len(self.strings)
            self.strings.append(s)
        return self.index[s]

    # — чанки —

    def _string_pool(self):
        encoded = []
        for s in self.strings:
            raw = s.encode("utf-16-le")
            encoded.append(struct.pack("<H", len(s)) + raw + b"\x00\x00")
            if len(encoded[-1]) % 4:
                encoded[-1] += b"\x00\x00"
        offsets = []
        blob = b""
        for e in encoded:
            offsets.append(len(blob))
            blob += e
        # заголовок пула 28 байт + таблица оффсетов 4*count
        strings_start = 28 + 4 * len(self.strings)
        size = strings_start + len(blob)
        # header: type, headerSize, size | body: stringCount, styleCount, flags, stringsStart, stylesStart
        out = struct.pack(
            "<HHIIIIII",
            0x0001, 28, size,
            len(self.strings), 0, 0, strings_start, 0,
        )
        out += b"".join(struct.pack("<I", o) for o in offsets)
        out += blob
        return out

    def _res_map(self):
        body = b"".join(struct.pack("<I", r) for r in self.res_ids)
        return struct.pack("<HHI", 0x0180, 8, 8 + len(body)) + body

    def _node_header(self, typ, size, line=1):
        return struct.pack("<HHIII", typ, 16, size, line, self.NO_INDEX)

    def namespace(self, begin=True):
        typ = 0x0100 if begin else 0x0101
        return struct.pack("<HHIII", typ, 16, 24, 1, self.NO_INDEX) + struct.pack(
            "<II", self.ns_prefix, self.ns_uri
        )

    def start_tag(self, name, attrs, line=1):
        """
        attrs: list of (ns, name, value) где value:
          ('str', idx) | ('int', n) | ('bool', b)
        """
        name_idx = self._str(name)
        attr_blob = b""
        for ns, aname, val in attrs:
            a_idx = self._str(aname)
            if val[0] == "str":
                raw, dtype, data = val[1], self.TYPE_STRING, val[1]
            elif val[0] == "int":
                raw, dtype, data = self.NO_INDEX, self.TYPE_INT_DEC, val[1] & 0xFFFFFFFF
            elif val[0] == "bool":
                raw, dtype, data = self.NO_INDEX, self.TYPE_INT_BOOLEAN, 0xFFFFFFFF if val[1] else 0
            else:
                raise ValueError(val)
            attr_blob += struct.pack(
                "<IIIHHBB I",
                ns, a_idx, raw, 8, 0, dtype, data,
            ).replace(b"", b"", 0) if False else struct.pack(
                "<IIIHBBI", ns, a_idx, raw, 8, 0, dtype, data
            )
        count = len(attrs)
        size = 16 + 20 + len(attr_blob)
        out = self._node_header(0x0102, size, line)
        out += struct.pack(
            "<IIHHHHHH",
            self.NO_INDEX, name_idx, 20, 20, count, 0, 0, 0,
        )
        out += attr_blob
        return out

    def end_tag(self, name, line=1):
        return self._node_header(0x0103, 24, line) + struct.pack(
            "<II", self.NO_INDEX, self._str(name)
        )

    def build(self):
        body = b""
        body += self.namespace(True)
        s = lambda n: self._str(n)

        # <manifest package="..." android:versionCode="1" android:versionName="1.0">
        body += self.start_tag("manifest", [
            (self.NO_INDEX, "package", ("str", s(PACKAGE))),
            (self.ns_uri, "versionCode", ("int", 1)),
            (self.ns_uri, "versionName", ("str", s("1.0"))),
        ])
        #   <uses-sdk minSdk=24 targetSdk=28 />
        body += self.start_tag("uses-sdk", [
            (self.ns_uri, "minSdkVersion", ("int", 24)),
            (self.ns_uri, "targetSdkVersion", ("int", 28)),
        ])
        body += self.end_tag("uses-sdk")
        #   <application ...>
        body += self.start_tag("application", [
            (self.ns_uri, "label", ("str", s(LABEL))),
            (self.ns_uri, "hardwareAccelerated", ("bool", True)),
        ])
        #     <activity ...>
        body += self.start_tag("activity", [
            (self.ns_uri, "name", ("str", s(ACTIVITY))),
            (self.ns_uri, "exported", ("bool", True)),
            (self.ns_uri, "configChanges", ("int", 0x4A0)),  # orientation|screenSize|keyboardHidden
            (self.ns_uri, "screenOrientation", ("int", 1)),  # portrait
        ])
        #       <intent-filter>
        body += self.start_tag("intent-filter", [])
        body += self.start_tag("action", [
            (self.ns_uri, "name", ("str", s("android.intent.action.MAIN"))),
        ])
        body += self.end_tag("action")
        body += self.start_tag("category", [
            (self.ns_uri, "name", ("str", s("android.intent.category.LAUNCHER"))),
        ])
        body += self.end_tag("category")
        body += self.end_tag("intent-filter")
        body += self.end_tag("activity")
        body += self.end_tag("application")
        body += self.end_tag("manifest")
        body += self.namespace(False)

        pool = self._string_pool()
        rmap = self._res_map()
        total = 8 + len(pool) + len(rmap) + len(body)
        header = struct.pack("<HHI", 0x0003, 8, total)
        return header + pool + rmap + body


def build_manifest_axml():
    return AxmlBuilder().build()

# ---------------------------------------------------------------- ZIP + подпись

def _zip_entry_bytes(name, data, method, offset, extra_pad=0):
    """Возвращает (local_header+data, next_offset, central_record)."""
    name_b = name.encode("utf-8")
    crc = zlib.crc32(data) & 0xFFFFFFFF
    if method == 8:
        comp = zlib.compress(data, 9)[2:-4]  # raw deflate
    else:
        comp = data
    extra = b""
    if extra_pad:
        # поле-заполнитель для выравнивания данных (неизвестный ID безопасно игнорируется)
        pad = extra_pad - 4
        if pad < 0:
            pad += 4
        extra = struct.pack("<HH", 0xCAFE, pad) + b"\x00" * pad
    local = struct.pack(
        "<IHHHHHIIIHH",
        0x04034B50, 20, 0, method, 0, 0x21,  # sig, ver, flags, method, time, date(2000-01-01)
        crc, len(comp), len(data), len(name_b), len(extra),
    ) + name_b + extra + comp
    central = struct.pack(
        "<IHHHHHHIIIHHHHHII",
        0x02014B50, 20, 20, 0, method, 0, 0x21,
        crc, len(comp), len(data), len(name_b), len(extra), 0, 0, 0, 0,
        offset,
    ) + name_b + extra
    return local, offset + len(local), central


def build_zip(entries):
    """
    entries: list of (name, data, method, must_align)
    Выравнивание: начало данных STORED-записей кратно 4 байтам.
    """
    parts = []
    centrals = []
    offset = 0
    for name, data, method, align in entries:
        header_len = 30 + len(name.encode("utf-8"))
        pad = 0
        if align:
            mis = (offset + header_len) % 4
            if mis:
                pad = 4 - mis
        local, next_off, central = _zip_entry_bytes(name, data, method, offset, pad)
        parts.append(local)
        centrals.append(central)
        offset = next_off
    cd = b"".join(centrals)
    eocd = struct.pack(
        "<IHHHHIIH",
        0x06054B50, 0, 0, len(centrals), len(centrals), len(cd), offset, 0,
    )
    return b"".join(parts) + cd + eocd


def _b64(b):
    import base64
    return base64.b64encode(b).decode("ascii")


def sign_v1(entries):
    """
    Возвращает (MANIFEST.MF, CERT.SF, CERT.RSA) байты.
    entries: list of (name, data) — подписываемые файлы (без META-INF).
    """
    # MANIFEST.MF (CRLF, как у jarsigner)
    mf_main = "Manifest-Version: 1.0\r\nCreated-By: BattleCards-Python\r\n"
    main_sec = mf_main + "\r\n"  # главная секция — с завершающей пустой строкой
    mf_sections = []
    for name, data in entries:
        sec = f"Name: {name}\r\nSHA-256-Digest: {_b64(hashlib.sha256(data).digest())}\r\n\r\n"
        mf_sections.append(sec)
    manifest = mf_main + "\r\n" + "".join(mf_sections)
    manifest_b = manifest.encode("utf-8")

    # CERT.SF
    sf_main = (
        "Signature-Version: 1.0\r\n"
        "Created-By: BattleCards-Python\r\n"
        f"SHA-256-Digest-Manifest: {_b64(hashlib.sha256(manifest_b).digest())}\r\n"
        f"SHA-256-Digest-Manifest-Main-Attributes: {_b64(hashlib.sha256(main_sec.encode('utf-8')).digest())}\r\n"
    )
    sf_sections = []
    # по OpenJDK ManifestDigester: дайджест секции — вместе с завершающей пустой строкой
    for sec in mf_sections:
        digest = hashlib.sha256(sec.encode("utf-8")).digest()
        name_line = sec.split("\r\n")[0]  # "Name: xxx"
        sf_sections.append(f"{name_line}\r\nSHA-256-Digest: {_b64(digest)}\r\n\r\n")
    sf = sf_main + "\r\n" + "".join(sf_sections)
    sf_b = sf.encode("utf-8")

    # CERT.RSA — PKCS#7 SignedData через openssl cms (как jarsigner: detached + signed attrs)
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        key = td / "key.pem"
        crt = td / "cert.pem"
        sf_file = td / "CERT.SF"
        rsa = td / "CERT.RSA"
        sf_file.write_bytes(sf_b)
        subprocess.run(
            ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
             "-keyout", str(key), "-out", str(crt), "-days", "10950",
             "-subj", f"/CN={LABEL}/O=BattleCards/C=RU",
             "-sha256"],
            check=True, capture_output=True,
        )
        r = subprocess.run(
            ["openssl", "cms", "-sign",
             "-in", str(sf_file), "-signer", str(crt), "-inkey", str(key),
             "-outform", "DER", "-out", str(rsa), "-md", "sha256",
             "-nosmimecap"],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            sys.exit(f"openssl cms -sign:\n{r.stderr}")
        # самопроверка подписи
        v = subprocess.run(
            ["openssl", "cms", "-verify", "-in", str(rsa), "-inform", "DER",
             "-content", str(sf_file), "-noverify", "-out", os.devnull],
            capture_output=True, text=True,
        )
        if v.returncode != 0:
            sys.exit(f"Самопроверка PKCS7 не прошла:\n{v.stderr}")
        rsa_b = rsa.read_bytes()
    return manifest_b, sf_b, rsa_b

# ---------------------------------------------------------------- игра в один файл

def build_game_html():
    print("• Игра -> assets/index.html")
    esbuild = ROOT / "node_modules/.bin/esbuild"
    if not esbuild.exists():
        sys.exit("Нет node_modules/.bin/esbuild — выполните npm install")
    with tempfile.TemporaryDirectory() as td:
        js = Path(td) / "game.js"
        r = subprocess.run(
            [str(esbuild), str(ROOT / "src/main.js"),
             "--bundle", "--format=iife", "--minify",
             "--outfile=" + str(js), "--log-level=warning"],
            capture_output=True, text=True, cwd=str(ROOT),
        )
        if r.returncode != 0:
            sys.exit(f"esbuild:\n{r.stderr}")
        css = Path(td) / "game.css"
        js_data = js.read_text(encoding="utf-8")
        css_data = css.read_text(encoding="utf-8") if css.exists() else ""
    html = f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#14182b">
<title>{LABEL}</title>
<style>
html,body{{margin:0;padding:0;height:100%;background:#14182b;overflow:hidden;user-select:none;-webkit-user-select:none}}
{css_data}
</style>
</head>
<body>
<div id="app"></div>
<script>
{js_data}
</script>
</body>
</html>
"""
    return html.encode("utf-8")

# ---------------------------------------------------------------- main

def main():
    print("═══ Сборка APK «Королевские Схватки» ═══")
    java = find_java()
    print(f"• java: {java}")
    jars = ensure_tool_jars()
    dex = build_dex(java, jars)
    game = build_game_html()
    print(f"• assets/index.html: {len(game) // 1024} КБ")

    print("• Ресурсы и манифест (aapt2)")
    res_entries = build_resources_axml(game)
    if res_entries is not None and "AndroidManifest.xml" in res_entries and "resources.arsc" in res_entries:
        print(f"  aapt2: манифест + resources.arsc + иконка ({len(res_entries)} записей)")
        manifest = res_entries["AndroidManifest.xml"]
    else:
        print("  aapt2 недоступен — запасной AXML-генератор (без иконки)")
        manifest = build_manifest_axml()
        res_entries = {"assets/index.html": game}
        print(f"• AndroidManifest.xml (AXML): {len(manifest)} байт")

    sign_entries = [("AndroidManifest.xml", manifest)]
    for name, data in res_entries.items():
        if name == "AndroidManifest.xml":
            continue
        sign_entries.append((name, data))
    sign_entries.append(("classes.dex", dex))
    mf, sf, rsa = sign_v1(sign_entries)
    print(f"• Подпись v1: MANIFEST {len(mf)} / SF {len(sf)} / RSA {len(rsa)} байт")

    # финальный ZIP: ресурсы aapt2 + dex + подпись; STORED c выравниванием
    stored = {"AndroidManifest.xml", "resources.arsc", "classes.dex"}
    entries = []
    seen = set()
    for name, data in res_entries.items():
        entries.append((name, data, 0 if name in stored else 8, name in stored))
        seen.add(name)
    if "classes.dex" not in seen:
        entries.append(("classes.dex", dex, 0, True))
    entries.append(("META-INF/MANIFEST.MF", mf, 8, False))
    entries.append(("META-INF/CERT.SF", sf, 8, False))
    entries.append(("META-INF/CERT.RSA", rsa, 8, False))
    # стабильный порядок: сначала манифест и ресурсы, потом dex, потом подпись
    entries.sort(key=lambda e: ({"AndroidManifest.xml": 0, "resources.arsc": 1, "classes.dex": 2}.get(e[0], 3)))
    apk = build_zip(entries)

    OUT_DIR.mkdir(exist_ok=True)
    out = OUT_DIR / APK_NAME
    out.write_bytes(apk)
    print(f"\n✅ Готово: {out}  ({len(apk) / 1024 / 1024:.2f} МБ)")

    # быстрая самопроверка
    with zipfile.ZipFile(out) as z:
        bad = z.testzip()
        names = z.namelist()
        assert bad is None, f"битый файл в zip: {bad}"
        assert "classes.dex" in names and "AndroidManifest.xml" in names
        print("✓ zip-структура целая, файлы:", ", ".join(names))
    with zipfile.ZipFile(out) as z:
        d = z.read("classes.dex")
        assert d[:4] == b"dex\n", "DEX magic"
        print("✓ DEX magic валиден")
    return out


if __name__ == "__main__":
    main()
