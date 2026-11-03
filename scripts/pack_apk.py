#!/usr/bin/env python3
"""Package classes.dex into the aapt2-linked APK and 4-byte align stored entries."""
import struct
import sys
import zipfile

STORE = zipfile.ZIP_STORED
DEFLATE = zipfile.ZIP_DEFLATED


def aligned_extra(offset, name_len, alignment=4):
    head = offset + 30 + name_len
    pad = (-head) % alignment
    if pad == 0:
        return b""
    if pad < 4:
        pad += alignment
    return struct.pack("<HH", 0xD935, pad - 4) + b"\0" * (pad - 4)


def main():
    if len(sys.argv) < 4:
        print("usage: pack_apk.py <base.apk> <classes.dex> <output.apk>")
        sys.exit(2)
    base, dex, out = sys.argv[1], sys.argv[2], sys.argv[3]
    with zipfile.ZipFile(base) as zin, open(out, "wb") as fout:
        zout = zipfile.ZipFile(fout, "w")
        for info in zin.infolist():
            if info.filename == "classes.dex":
                continue
            data = zin.read(info.filename)
            zinfo = zipfile.ZipInfo(info.filename, date_time=info.date_time)
            zinfo.compress_type = info.compress_type
            zinfo.external_attr = info.external_attr
            zinfo.internal_attr = info.internal_attr
            zinfo.create_system = 0
            zinfo.comment = info.comment or b""
            name_len = len(zinfo.filename.encode("utf-8"))
            pad = aligned_extra(fout.tell(), name_len, 4)
            zinfo.extra = pad
            zout.writestr(zinfo, data)
        with open(dex, "rb") as df:
            dex_data = df.read()
        zinfo = zipfile.ZipInfo("classes.dex", date_time=(2026, 1, 1, 0, 0, 0))
        zinfo.compress_type = DEFLATE
        zinfo.create_system = 0
        zout.writestr(zinfo, dex_data)
        zout.close()
    print("packed:", out)


if __name__ == "__main__":
    main()
