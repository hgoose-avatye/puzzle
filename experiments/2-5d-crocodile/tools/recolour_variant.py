"""A colour variant of one 2.5D species' pictures, registered as another species (same manifest, same candidates).

Usage (from the repo root):
  python3 experiments/2-5d-crocodile/tools/recolour_variant.py --src caterpillar --dst dachshund --hue 68 150 --shift 120

Every picture the source manifest draws is copied to <dst>/variant/ with the hue of the pixels in [--hue lo hi] degrees
turned by --shift degrees (saturation, value and alpha untouched, so shading and the unsaturated eyes, mouth and
highlights stay); the source's candidate pictures and extend.json get the same treatment under <dst>/candidate/, so
?art=candidate behaves alike for both species. <dst>/<dst>.sprites.json is the source manifest with the species name
and the picture paths changed. Nothing of the source species is modified.
"""
import argparse
import json
import os
import shutil

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def recolour(path, lo, hi, shift):
    a = np.array(Image.open(path).convert('RGBA'))
    hsv = np.array(Image.fromarray(a[:, :, :3]).convert('HSV')).astype(int)
    h = hsv[:, :, 0] * 360 // 255
    sel = (h >= lo) & (h <= hi) & (hsv[:, :, 2] > 20)
    hsv[:, :, 0] = np.where(sel, ((h + shift) % 360) * 255 // 360, hsv[:, :, 0])
    hsv_img = Image.frombytes('HSV', (hsv.shape[1], hsv.shape[0]), hsv.astype(np.uint8).tobytes())
    rgb = np.array(hsv_img.convert('RGB'))
    out = a.copy()
    out[:, :, :3] = rgb
    return out, int(sel.sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=os.path.join(HERE, '..', 'assets'))
    ap.add_argument('--src', required=True)
    ap.add_argument('--dst', required=True)
    ap.add_argument('--hue', nargs=2, type=int, required=True, metavar=('LO', 'HI'), help='hue range (degrees) to turn')
    ap.add_argument('--shift', type=int, required=True, help='degrees to add to those hues')
    args = ap.parse_args()
    src_dir, dst_dir = os.path.join(args.root, args.src), os.path.join(args.root, args.dst)
    manifest = json.load(open(os.path.join(src_dir, f'{args.src}.sprites.json')))
    os.makedirs(os.path.join(dst_dir, 'variant'), exist_ok=True)
    for part in manifest['parts'].values():
        for key, pic in part['drawn'].items():
            file = pic if isinstance(pic, str) else pic['file']
            out, n = recolour(os.path.join(src_dir, file), *args.hue, args.shift)
            name = os.path.basename(file)
            Image.fromarray(out).save(os.path.join(dst_dir, 'variant', name))
            new = f'variant/{name}'
            part['drawn'][key] = new if isinstance(pic, str) else {**pic, 'file': new}
            print(f'{new}: {n} px turned')
    cand = os.path.join(src_dir, 'candidate')
    if os.path.isdir(cand):
        os.makedirs(os.path.join(dst_dir, 'candidate'), exist_ok=True)
        for name in sorted(os.listdir(cand)):
            if name.endswith('.png'):
                out, n = recolour(os.path.join(cand, name), *args.hue, args.shift)
                Image.fromarray(out).save(os.path.join(dst_dir, 'candidate', name))
                print(f'candidate/{name}: {n} px turned')
            elif name == 'extend.json':
                shutil.copyfile(os.path.join(cand, name), os.path.join(dst_dir, 'candidate', name))
    manifest['species'] = args.dst
    manifest['note'] = (f'colour variant of {args.src} (tools/recolour_variant.py: hue {args.hue[0]}-{args.hue[1]} turned '
                        f'by {args.shift}); same frame, anchors, offsets and candidates as {args.src}. ' + manifest.get('note', ''))
    with open(os.path.join(dst_dir, f'{args.dst}.sprites.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    print(f'{args.dst}.sprites.json written')


if __name__ == '__main__':
    main()
