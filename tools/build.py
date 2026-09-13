"""Build the planner with approved bundled images and generated grid fixtures."""
from pathlib import Path
import argparse
import base64
import hashlib
import io
import json
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MODULES = ['drafts', 'exports', 'checks', 'workspace', 'detection', 'import-storage', 'import-review', 'themes']
PALETTES = [('#243e41','#bdd9bd'),('#54466a','#c7b4e8'),('#9b5138','#eed1ad'),('#324b78','#b1d4e8'),
            ('#6f7135','#e1e5ac'),('#612f45','#e7b1c1'),('#224f50','#9dd1c6'),('#744d31','#ebcba1')]
# Canonical encodings preserve the approved HTML across platform PNG/zlib builds.
# Their decoded pixels must still equal the generator below, without tolerance.
CANONICAL_PNGS = {
    'grid-4x4': '1b07091b3e0062d33d6fdd6b2c28f1d37e3a392aa9e7965b240e43f54e116bea',
    'grid-6x5': 'd92cd2eb09d9596c218bb741accdd279fd3f2811d2822c2bd97b52a1e450a651',
    'sample_19': '359599b5ffc7868811290e1a5d81c1dd7e3593901d986725487c6e89c338fd2c',
    'sample_20': 'bf52fa1240fb0095d4ab22613352c2415e7c19de00d218545d46be0a605cec58',
    'sample_21': 'ccc07c292ba1ed59c554c3ece1e2d298623dde8f46613ef8fd733a1cc25adc80',
}

def rgb(value):
    return tuple(int(value[i:i+2], 16) for i in (1,3,5))

def sample(number, size=(300,400)):
    """Nonrepresentational color cards: a reproducible synthetic data fixture."""
    a,b = map(rgb, PALETTES[(number-1) % len(PALETTES)])
    width,height = size
    im = Image.new('RGB', size)
    px = im.load()
    for y in range(height):
        for x in range(width):
            blend = min(1,max(0, .15 + .55*y/height + .25*math.sin(x/width*3.4 + y/height*2 + number)))
            px[x,y] = tuple(round(v*(1-blend)+w*blend) for v,w in zip(a,b))
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((width*.12,height*.17,width*.88,height*.73), radius=width*.35, outline=b, width=max(2,width//50))
    draw.text((width*.12,height*.83), f'SAMPLE {number:02}', fill=b, font_size=max(11,width//20))
    return im

def canonical_png(name, expected):
    payload = (ROOT/'assets'/'generated'/(name+'.png')).read_bytes()
    if hashlib.sha256(payload).hexdigest() != CANONICAL_PNGS[name]:
        raise ValueError('Canonical PNG hash mismatch: '+name)
    with Image.open(io.BytesIO(payload)) as actual:
        if actual.format != 'PNG' or actual.mode != expected.mode or actual.size != expected.size:
            raise ValueError('Canonical PNG format or dimensions mismatch: '+name)
        if actual.tobytes() != expected.tobytes():
            raise ValueError('Generated pixels differ from canonical PNG: '+name)
    return payload

def build(check=False):
    src = ROOT / 'planner_src'
    approved = json.loads((ROOT/'assets'/'manifest.json').read_text())['images']
    if len(approved) != 27:
        raise ValueError('Expected 27 approved demo images')
    payloads = {}
    sample_numbers = list(range(1, 19)) + list(range(22, 31))
    for n, entry in zip(sample_numbers, approved):
        if entry['path'] != f'assets/sample_{n:02}.png':
            raise ValueError('Unexpected sample path')
        payload = (ROOT/entry['path']).read_bytes()
        if hashlib.sha256(payload).hexdigest() != entry['sha256']:
            raise ValueError('Approved sample hash mismatch')
        payloads[n] = payload
    manifest = [{'id':f'sample_{n:02}', 'src':'data:image/png;base64,'+base64.b64encode(payloads[n] if n in payloads else canonical_png(f'sample_{n:02}',sample(n))).decode(), 'locked': 19 <= n <= 21, 'sample': True} for n in range(1,31)]
    state = {'order':[m['id'] for m in manifest[:12] + manifest[21:]], 'backlog':[m['id'] for m in manifest[12:18]], 'cols':3,
             'railw':0,'railh':False,'meta':{},'drafts':[]}
    app = (src / 'app.js').read_text(encoding='utf-8')
    marker = '  var imageStorageReady = idb().then(function(d){'
    if marker not in app:
        raise ValueError('App integration marker changed; update the public build')
    app = app.replace(marker, (ROOT/'demo_src'/'samples.js').read_text(encoding='utf-8')+'\n'+ '\n'.join((src / (name+'.js')).read_text(encoding='utf-8') for name in MODULES)+'\n'+marker, 1)
    html = (src / 'page.html').read_text(encoding='utf-8')
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; connect-src data: blob:; font-src data:; object-src \'none\'; base-uri \'none\'; form-action \'none\'">')
    for token,name in [('__BASE_CSS__','base.css'),('__DESIGN_CSS__','design.css'),('__IMPORT_CSS__','import-review.css'),('__THEMES_CSS__','themes.css')]:
        html = html.replace(token, (src / name).read_text(encoding='utf-8'))
    html = html.replace('__APP_JS__',app).replace('__MANIFEST__',json.dumps(manifest,separators=(',',':')))
    html = html.replace('<script id="savedstate" type="application/json">null</script>', '<script id="savedstate" type="application/json">'+json.dumps(state,separators=(',',':'))+'</script>')
    outputs = {ROOT/'demo'/'index.html':html.encode('utf-8')}
    for columns,rows in [(4,4),(6,5)]:
        side,gutter = 100,3
        grid = Image.new('RGB',(columns*side+(columns-1)*gutter,rows*side+(rows-1)*gutter),'white')
        for row in range(rows):
            for col in range(columns):
                grid.paste(sample(row*columns+col+1,(side,side)),(col*(side+gutter),row*(side+gutter)))
        outputs[ROOT/'tests'/'fixtures'/f'grid-{columns}x{rows}.png'] = canonical_png(f'grid-{columns}x{rows}',grid)
    guide_css = (ROOT/'demo_src'/'guide.css').read_text(encoding='utf-8')
    guide_js = (ROOT/'demo_src'/'guide.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
    guide_fixture = {'src':'data:image/png;base64,'+base64.b64encode(outputs[ROOT/'tests'/'fixtures'/'grid-4x4.png']).decode(), 'name':'gridsmith-sample-grid.png', 'rows':4, 'columns':4, 'gutter':3}
    guide = '<style>'+guide_css+'</style><script id="gridsmith-guide-fixture" type="application/json">'+json.dumps(guide_fixture,separators=(',',':'))+'</script><script>'+guide_js+'</script>'
    html = html.replace('</body>', guide+'</body>')
    outputs[ROOT/'demo'/'index.html'] = html.encode('utf-8')
    outputs[ROOT/'demo'/'build-info.json'] = (json.dumps({'sha256':hashlib.sha256(outputs[ROOT/'demo'/'index.html']).hexdigest(), 'bytes':len(outputs[ROOT/'demo'/'index.html']), 'fixture':'27 approved demo images; 3 generated posted references; no real posted photos'},indent=2)+'\n').encode()
    for path,content in outputs.items():
        if check:
            if not path.exists() or path.read_bytes()!=content:
                raise SystemExit(f'Generated artifact is stale: {path.relative_to(ROOT).as_posix()}')
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_bytes(content)
    print('Generated artifacts are current.' if check else 'Built standalone planner with 27 approved demo images, 3 generated posted references and two grid fixtures.')

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
