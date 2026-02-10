"""
tauri-icon.py

Usage:
  python tauri-icon.py                 # uses icon.png
  python tauri-icon.py path/to/input.png

Output folder:
  ./icons/
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


# ---- config: required outputs ----
PNG_OUTPUTS = [
    ("32x32.png", (32, 32)),
    ("128x128.png", (128, 128)),
    ("128x128@2x.png", (256, 256)),
    ("icon.png", (512, 512)),
    ("Square30x30Logo.png", (30, 30)),
    ("Square44x44Logo.png", (44, 44)),
    ("Square71x71Logo.png", (71, 71)),
    ("Square89x89Logo.png", (89, 89)),
    ("Square107x107Logo.png", (107, 107)),
    ("Square142x142Logo.png", (142, 142)),
    ("Square150x150Logo.png", (150, 150)),
    ("Square284x284Logo.png", (284, 284)),
    ("Square310x310Logo.png", (310, 310)),
    ("StoreLogo.png", (50, 50)),
]

ICO_SIZE = (128, 128)  # icon.ico
ICNS_FILENAME = "icon.icns"


def _ensure_parent(dirpath: Path) -> None:
    dirpath.mkdir(parents=True, exist_ok=True)


def _load_rgba(path: Path) -> Image.Image:
    img = Image.open(path)
    # keep transparency
    return img.convert("RGBA")


def _resize_cover_square(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    """
    Make a square image by:
      - center-cropping to square (min dimension)
      - resizing to target size using high-quality resampling
    """
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = img.crop((left, top, left + side, top + side))
    return cropped.resize(size, Image.LANCZOS)


def _save_png(img: Image.Image, out_path: Path) -> None:
    img.save(out_path, format="PNG", optimize=True)


def _save_ico(img: Image.Image, out_path: Path) -> None:
    ico_img = _resize_cover_square(img, ICO_SIZE)
    # single-size ICO (128x128) as requested
    ico_img.save(out_path, format="ICO", sizes=[ICO_SIZE])


def _have(cmd: str) -> bool:
    return shutil.which(cmd) is not None


def _make_icns_with_iconutil(src_img: Image.Image, out_path: Path) -> bool:
    """
    macOS-native: uses iconutil to build icon.icns from an iconset folder.
    Returns True if created.
    """
    if platform.system().lower() != "darwin":
        return False
    if not _have("iconutil"):
        return False

    with tempfile.TemporaryDirectory() as td:
        iconset = Path(td) / "AppIcon.iconset"
        iconset.mkdir(parents=True, exist_ok=True)

        # Standard iconset members
        sizes = [
            (16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)
        ]

        # base and @2x pairs expected by iconutil
        mapping = [
            ("icon_16x16.png", (16, 16)),
            ("icon_16x16@2x.png", (32, 32)),
            ("icon_32x32.png", (32, 32)),
            ("icon_32x32@2x.png", (64, 64)),
            ("icon_128x128.png", (128, 128)),
            ("icon_128x128@2x.png", (256, 256)),
            ("icon_256x256.png", (256, 256)),
            ("icon_256x256@2x.png", (512, 512)),
            ("icon_512x512.png", (512, 512)),
            ("icon_512x512@2x.png", (1024, 1024)),
        ]

        for name, sz in mapping:
            _save_png(_resize_cover_square(src_img, sz), iconset / name)

        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset), "-o", str(out_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return out_path.exists() and out_path.stat().st_size > 0


def _make_icns_with_pillow(src_img: Image.Image, out_path: Path) -> bool:
    """
    Fallback: try Pillow's ICNS writer (may not be available in some builds).
    Returns True if created.
    """
    try:
        # Provide a range of sizes; Pillow will package them if ICNS support exists.
        sizes = [(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)]
        # Use the largest square as base, then let Pillow derive others
        base = _resize_cover_square(src_img, (1024, 1024))
        base.save(out_path, format="ICNS", sizes=sizes)
        return out_path.exists() and out_path.stat().st_size > 0
    except Exception:
        return False


def generate_icons(input_path: Path, output_dir: Path) -> None:
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    _ensure_parent(output_dir)

    img = _load_rgba(input_path)

    # PNGs
    for filename, size in PNG_OUTPUTS:
        out = output_dir / filename
        _save_png(_resize_cover_square(img, size), out)

    # ICO (128x128)
    _save_ico(img, output_dir / "icon.ico")

    # ICNS
    icns_out = output_dir / ICNS_FILENAME
    created = _make_icns_with_iconutil(img, icns_out) or _make_icns_with_pillow(img, icns_out)
    if not created:
        # Do not silently fail: create a helpful placeholder PNG for manual conversion
        hint_png = output_dir / "icns_source_1024.png"
        _save_png(_resize_cover_square(img, (1024, 1024)), hint_png)
        print(
            "WARNING: Could not create icon.icns automatically.\n"
            f" - Saved {hint_png.name} for manual conversion.\n"
            " - On macOS, install/use Xcode tools and ensure `iconutil` exists.\n"
            " - Or use a converter to build icon.icns from the 1024 PNG."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate platform icon assets into ./icons/")
    parser.add_argument("image", nargs="?", default="icon.png", help="Input image file (default: icon.png)")
    parser.add_argument(
        "-o", "--out", default="icons", help="Output directory (default: icons)"
    )
    args = parser.parse_args()

    input_path = Path(args.image).expanduser().resolve()
    out_dir = Path(args.out).expanduser().resolve()

    try:
        generate_icons(input_path, out_dir)
        print(f"Done. Icons generated in: {out_dir}")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())