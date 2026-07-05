#!/usr/bin/env python3
"""Observer OS final icon -- minimalist O (disc) with lightning bolt cutout.
Concept B, refined: perfectly centered, point-symmetric bolt for visual balance.
Rendered at 4x supersample, downsampled with LANCZOS for clean anti-aliased edges.
"""

from PIL import Image, ImageDraw
import os

SS = 4
S = 512 * SS
CX = CY = S // 2

BG_DARK = (10, 10, 18, 255)   # near-black navy background
NEON    = (215, 255, 63, 255)  # brand neon lime — the disc color

OUT = os.path.join(os.path.dirname(__file__), "..", "public")
os.makedirs(OUT, exist_ok=True)


def rounded_canvas(bg=BG_DARK, corner_radius=104):
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, S - 1, S - 1], radius=corner_radius * SS, fill=255
    )
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    base.paste(Image.new("RGBA", (S, S), bg), mask=mask)
    return base, mask


# Classic bolt silhouette, defined with 180°-rotational point symmetry about
# the origin (point[i] == -point[i+3]) so its visual centroid is exact —
# this is what makes it sit "balanced" inside the disc instead of leaning.
def bolt_polygon(cx, cy, h, w):
    pts = [
        (0.15, -1.00), (-0.55, 0.15), (-0.05, 0.15),
        (-0.15, 1.00), (0.55, -0.15), (0.05, -0.15),
    ]
    return [(cx + px * w, cy + py * h) for px, py in pts]


def make_icon(disc_r_frac=0.69, bolt_h_frac=0.575, bolt_w_frac=0.32):
    """disc_r_frac / bolt_*_frac are relative to half the 512px canvas (256px)."""
    img, mask = rounded_canvas()

    R = int(256 * disc_r_frac) * SS
    disc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse([CX - R, CY - R, CX + R, CY + R], fill=NEON)
    img.alpha_composite(disc)

    bolt = bolt_polygon(CX, CY, int(256 * bolt_h_frac) * SS, int(256 * bolt_w_frac) * SS)
    cutout = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(cutout).polygon(bolt, fill=BG_DARK)
    img.alpha_composite(cutout)

    final = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    final.paste(img, mask=mask)
    return final


def make_maskable(full_res_icon, size, pad_frac=0.20):
    """Android maskable icons get cropped to a circle/squircle by the OS —
    pad the artwork inward so nothing important sits in the crop zone."""
    inner = int(size * (1 - pad_frac))
    resized = full_res_icon.resize((inner, inner), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), BG_DARK)
    offset = (size - inner) // 2
    out.paste(resized, (offset, offset), resized)
    return out


# ── build at full working resolution once, then downsample for every size ──

master = make_icon()

sizes = {
    "icon-512.png": 512,
    "icon-192.png": 192,
    "apple-touch-icon.png": 180,   # iOS home screen (no alpha channel expected)
    "favicon-32.png": 32,
    "favicon-16.png": 16,
}

for name, size in sizes.items():
    resized = master.resize((size, size), Image.LANCZOS)
    if name == "apple-touch-icon.png":
        # iOS applies its own rounding + ignores transparency oddly on some
        # versions — flatten onto the background color to be safe.
        flat = Image.new("RGB", (size, size), BG_DARK[:3])
        flat.paste(resized, mask=resized.split()[3])
        flat.save(os.path.join(OUT, name), "PNG")
    else:
        resized.save(os.path.join(OUT, name), "PNG")

make_maskable(master, 512).save(os.path.join(OUT, "icon-512-maskable.png"), "PNG")
make_maskable(master, 192).save(os.path.join(OUT, "icon-192-maskable.png"), "PNG")

print("Saved:", ", ".join(list(sizes.keys()) + ["icon-512-maskable.png", "icon-192-maskable.png"]))
