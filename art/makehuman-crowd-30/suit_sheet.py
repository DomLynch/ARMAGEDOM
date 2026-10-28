#!/usr/bin/env python3
"""suit_sheet.py OUT.png   (VPS) contact sheet of the 9 suit diffuse textures with a 10 percent UV grid, to place the trouser rectangles by eye."""
import sys
from PIL import Image, ImageDraw
D = '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data/clothes/'
names = ['male_casualsuit01', 'male_casualsuit02', 'male_casualsuit03', 'male_casualsuit04', 'male_casualsuit05', 'male_casualsuit06', 'female_casualsuit01', 'female_casualsuit02', 'female_elegantsuit01']
S = 400
sheet = Image.new('RGB', (S * 3, (S + 18) * 3), (40, 40, 40))
d0 = ImageDraw.Draw(sheet)
for n, name in enumerate(names):
    im = Image.open(D + name + '/' + name + '_diffuse.png').convert('RGB').resize((S, S))
    d = ImageDraw.Draw(im)
    for k in range(1, 10):
        d.line([(k * S / 10, 0), (k * S / 10, S)], fill=(255, 0, 255), width=1); d.line([(0, k * S / 10), (S, k * S / 10)], fill=(255, 0, 255), width=1)
    x, y = (n % 3) * S, (n // 3) * (S + 18)
    sheet.paste(im, (x, y + 18)); d0.text((x + 4, y + 3), name, fill=(255, 255, 255))
sheet.save(sys.argv[1])
