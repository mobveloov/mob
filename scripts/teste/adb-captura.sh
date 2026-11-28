#!/usr/bin/env bash
# Captura a tela do aparelho/emulador em 412x915: adb-captura.sh <arquivo.png>   (usa /data/local/tmp: o /sdcard do emulador às vezes desconecta)
set -e
MSYS_NO_PATHCONV=1 adb shell screencap -p /data/local/tmp/_cap.png
MSYS_NO_PATHCONV=1 adb pull /data/local/tmp/_cap.png "$1" >/dev/null
python -c "from PIL import Image; import sys; im=Image.open(sys.argv[1]).convert('RGB'); im.resize((412,915), Image.LANCZOS).save(sys.argv[1])" "$1"
