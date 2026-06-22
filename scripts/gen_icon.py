#!/usr/bin/env python3
"""Generate Observer OS app icon -- 512x512 RGBA PNG.
Additive blending for bolt glow: ImageChops.add lights up the iris/pupil.
"""

from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, os

S  = 512
CX = CY = S // 2   # 256

BG   = (7, 7, 16, 255)
NEON = (215, 255, 63)
N_   = (*NEON, 255)


def lyr():
    return Image.new("RGBA", (S, S), (0,0,0,0))

def over(base, top):
    return Image.alpha_composite(base, top)

def gblur(img, r):
    return img.filter(ImageFilter.GaussianBlur(r))

def b2(p0, c, p1, n=140):
    out = []
    for i in range(n+1):
        t=i/n; u=1-t
        out.append((u*u*p0[0]+2*u*t*c[0]+t*t*p1[0],
                    u*u*p0[1]+2*u*t*c[1]+t*t*p1[1]))
    return out

def ipx(pts):
    return [(int(x), int(y)) for x,y in pts]

def add_light(canvas, glow_layer):
    """Additive blend: glow adds neon light to canvas (transparent glow = black = adds 0)."""
    c_rgb  = canvas.convert("RGB")
    g_rgb  = glow_layer.convert("RGB")        # transparent pixels → black → contribute 0
    added  = ImageChops.add(c_rgb, g_rgb)     # clamps at 255, lights up whatever's below
    result = added.convert("RGBA")
    _, _, _, a = canvas.split()
    result.putalpha(a)
    return result


# ── eye geometry ──────────────────────────────────────────────────────────────

EL=(118,CY); ER=(394,CY); ET=(CX,CY-94); EB=(CX,CY+94)
EYE = ipx(b2(EL,ET,ER) + b2(ER,EB,EL)[1:])

# ── rounded-rect mask ─────────────────────────────────────────────────────────

rr = Image.new("L",(S,S),0)
ImageDraw.Draw(rr).rounded_rectangle([0,0,S-1,S-1], radius=96, fill=255)

# ── base canvas ───────────────────────────────────────────────────────────────

canvas = lyr()
bg = Image.new("RGBA",(S,S),BG)
canvas.paste(bg, mask=rr)

# faint blue-purple bloom
vl=lyr(); vd=ImageDraw.Draw(vl)
for r,a in [(210,10),(140,8),(80,6)]:
    vd.ellipse([CX-r,CY-r,CX+r,CY+r], fill=(20,24,72,a))
canvas = over(canvas,vl)

# ── eye fill ──────────────────────────────────────────────────────────────────

ef=lyr(); ImageDraw.Draw(ef).polygon(EYE, fill=(10,13,32,215))
canvas = over(canvas,ef)

# ── eye outline glow ──────────────────────────────────────────────────────────

for r,a,w in [(40,14,10),(18,32,6),(7,60,3),(3,100,2)]:
    gl=lyr(); ImageDraw.Draw(gl).polygon(EYE, outline=(*NEON,a), width=w)
    canvas = over(canvas, gblur(gl,r))

eo=lyr(); ImageDraw.Draw(eo).polygon(EYE, outline=(*NEON,205), width=2)
canvas = over(canvas,eo)

# ── iris ──────────────────────────────────────────────────────────────────────

IR=78; bb=[CX-IR,CY-IR,CX+IR,CY+IR]

for r,a in [(26,28),(11,58),(4,95)]:
    gl=lyr(); ImageDraw.Draw(gl).ellipse(bb, outline=(*NEON,a), width=3)
    canvas = over(canvas, gblur(gl,r))

ir=lyr(); ImageDraw.Draw(ir).ellipse(bb, fill=(11,14,34,255), outline=(*NEON,160), width=2)
canvas = over(canvas,ir)

al=lyr(); ad=ImageDraw.Draw(al)
for ang in [22,67,112,157,202,247,292,337]:
    ad.arc(bb, start=ang, end=ang+18, fill=(*NEON,100), width=2)
canvas = over(canvas,al)

for ang in [45,135,225,315]:
    rad=math.radians(ang)
    px_=int(CX+(IR+14)*math.cos(rad)); py_=int(CY+(IR+14)*math.sin(rad))
    dl=lyr(); ImageDraw.Draw(dl).regular_polygon((px_,py_,3), 4, rotation=45, fill=(*NEON,135))
    canvas = over(canvas, gblur(dl,3))
    canvas = over(canvas, dl)

# ── pupil ─────────────────────────────────────────────────────────────────────

PU=48
pu=lyr(); ImageDraw.Draw(pu).ellipse([CX-PU,CY-PU,CX+PU,CY+PU], fill=(4,4,10,255))
canvas = over(canvas,pu)


# ── lightning bolt — additive glow (hero element) ─────────────────────────────
# Additive blend means glow ADDS neon light to whatever is beneath:
# on black pupil → becomes green; on dark iris → tints green; on eye → glows.

BH,BW = 36,13
bolt = [
    (CX+BW+2, CY-BH),
    (CX-BW-3, CY+6),
    (CX+8,    CY+5),
    (CX-BW-1, CY+BH),
    (CX+BW+4, CY-2),
    (CX-3,    CY-3),
]
bpx = ipx(bolt)

# Build the master bolt source at full brightness
bolt_src = lyr(); ImageDraw.Draw(bolt_src).polygon(bpx, fill=N_)

# Additive glow passes: largest radius first (wide ambient), then tight
for r, scale in [(65, 0.55), (40, 0.70), (20, 0.85), (9, 1.0), (3, 1.0)]:
    gl = gblur(bolt_src, r)
    if scale < 1.0:
        # Dim the glow pass so wide halos aren't too overpowering
        *rgb, alpha = gl.split()
        alpha = alpha.point(lambda v: int(v * scale))
        gl = Image.merge("RGBA", (*rgb, alpha))
    canvas = add_light(canvas, gl)

# Solid neon bolt
bl=lyr(); ImageDraw.Draw(bl).polygon(bpx, fill=N_)
canvas = over(canvas, bl)

# Tight bloom on the solid bolt (screen pass)
canvas = add_light(canvas, gblur(bolt_src, 3))

# White-hot core
core = ipx([(CX+(x-CX)*0.32, CY+(y-CY)*0.32) for x,y in bolt])
cl=lyr(); ImageDraw.Draw(cl).polygon(core, fill=(255,255,255,235))
canvas = over(canvas, gblur(cl,1.5))
canvas = over(canvas, cl)


# ── corner leads ──────────────────────────────────────────────────────────────

tc=lyr(); td=ImageDraw.Draw(tc)
for tip_x,tip_y,sign in [(118,CY,-1),(394,CY,+1)]:
    dx=sign*36
    for dy,opa in [(-16,100),(16,80)]:
        ex,ey=tip_x+dx, tip_y+dy
        td.line([(tip_x,tip_y),(ex,ey)], fill=(*NEON,opa), width=1)
        td.ellipse([ex-2,ey-2,ex+2,ey+2], fill=(*NEON,min(255,int(opa*1.15))))
canvas = over(canvas, gblur(tc,1.0))
canvas = over(canvas, tc)


# ── clip + save ───────────────────────────────────────────────────────────────

final=lyr(); final.paste(canvas, mask=rr)
out=os.path.join(os.path.dirname(__file__),"..","public","icon-512.png")
final.save(out,"PNG")
print(f"Saved: {os.path.abspath(out)}")
