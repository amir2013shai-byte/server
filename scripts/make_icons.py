#!/usr/bin/env python3
"""Generate Android launcher icons from icon-source/icon.png."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "android/app/src/main/icon-source/icon.png")
RES = os.path.join(ROOT, "android/app/src/main/res")
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def rounded(img, radius_ratio=0.18):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=int(w * radius_ratio), fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def circular(img):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, w - 1, h - 1], fill=255)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def main():
    base = Image.open(SRC).convert("RGBA")
    for name, size in DENSITIES.items():
        d = os.path.join(RES, "mipmap-" + name)
        os.makedirs(d, exist_ok=True)
        square = rounded(base.resize((size, size), Image.LANCZOS))
        square.save(os.path.join(d, "ic_launcher.png"))
        round_icon = circular(base.resize((size, size), Image.LANCZOS))
        round_icon.save(os.path.join(d, "ic_launcher_round.png"))
    # Adaptive icon foreground: 108dp canvas, artwork inside 66dp safe zone.
    for name, size in DENSITIES.items():
        canvas = int(size * 108 / 48)
        inner = int(canvas * 0.64)
        fg = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
        art = base.resize((inner, inner), Image.LANCZOS)
        fg.paste(art, ((canvas - inner) // 2, (canvas - inner) // 2), art)
        fg.save(os.path.join(RES, "mipmap-" + name, "ic_launcher_foreground.png"))
    print("icons written")


if __name__ == "__main__":
    main()
