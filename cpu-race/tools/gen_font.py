"""สร้าง font ROM 8x16 (ASCII 0-127) -> mem/font.mem  (2048 บรรทัด, byte ละบรรทัด, bit 7 = pixel ซ้ายสุด)

render จากฟอนต์ monospace ในเครื่องแบบไม่มี anti-aliasing แล้วเก็บผลไว้ใน repo
(เครื่องที่ build บอร์ดไม่ต้องมีฟอนต์นี้ เพราะใช้ mem/font.mem ที่สร้างไว้แล้ว)

    python tools/gen_font.py [--font C:/Windows/Fonts/consolab.ttf] [--preview build/font.png]
"""
import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
W, H = 8, 16


def find_font():
    for cand in ("C:/Windows/Fonts/consolab.ttf", "C:/Windows/Fonts/consola.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"):
        if Path(cand).exists():
            return cand
    sys.exit("ไม่พบฟอนต์ monospace ให้ระบุ --font")


def render(font_path, size):
    font = ImageFont.truetype(font_path, size)
    glyphs = []
    for code in range(128):
        img = Image.new("1", (W, H), 0)
        if 33 <= code <= 126:
            d = ImageDraw.Draw(img)
            d.fontmode = "1"
            ch = chr(code)
            bbox = d.textbbox((0, 0), ch, font=font)
            gw = bbox[2] - bbox[0]
            x = (W - gw) // 2 - bbox[0]
            # วาง baseline ให้ตัวพิมพ์ใหญ่อยู่กลางช่อง
            ascent, _ = font.getmetrics()
            y = (H - 1) - ascent - 3
            d.text((x, y), ch, font=font, fill=1)
        rows = []
        for yy in range(H):
            b = 0
            for xx in range(W):
                if img.getpixel((xx, yy)):
                    b |= 0x80 >> xx
            rows.append(b)
        glyphs.append(rows)
    return glyphs


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--font", default=None)
    ap.add_argument("--size", type=int, default=13)
    ap.add_argument("--preview", default=str(ROOT / "build" / "font_preview.png"))
    args = ap.parse_args()

    glyphs = render(args.font or find_font(), args.size)
    out = ROOT / "mem" / "font.mem"
    out.write_text("".join(f"{b:02x}\n" for g in glyphs for b in g), encoding="ascii")
    print(f"wrote {out.relative_to(ROOT)}")

    # preview: 16 x 8 ตัว ขยาย 3 เท่า
    prev = Image.new("RGB", (16 * W, 8 * H), (16, 16, 48))
    px = prev.load()
    for code, g in enumerate(glyphs):
        cx, cy = (code % 16) * W, (code // 16) * H
        for yy in range(H):
            for xx in range(W):
                if g[yy] & (0x80 >> xx):
                    px[cx + xx, cy + yy] = (255, 255, 255)
    Path(args.preview).parent.mkdir(parents=True, exist_ok=True)
    prev.resize((prev.width * 3, prev.height * 3), Image.NEAREST).save(args.preview)
    print(f"preview {args.preview}")


if __name__ == "__main__":
    main()
