#!/usr/bin/env python3
"""
Empaqueta la landing en un único .html autocontenido (Bootstrap, CSS, JS e
imágenes embebidos). Útil para previsualizar o compartir sin servidor.

    python3 build-singlefile.py [salida.html]
"""
import base64
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DEST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'priorizai-landing.single.html')

FONTS = (
    'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..900'
    '&family=IBM+Plex+Mono:wght@400;500;600'
    '&family=Instrument+Sans:wght@400;500;600;700'
    '&family=Newsreader:ital,opsz,wght@1,6..72,300..500&display=swap'
)


def read(rel):
    with open(os.path.join(ROOT, rel), encoding='utf-8') as fh:
        return fh.read()


def datauri(rel):
    ext = os.path.splitext(rel)[1].lstrip('.').lower()
    mime = {'png': 'image/png', 'jpg': 'image/jpeg', 'svg': 'image/svg+xml'}[ext]
    with open(os.path.join(ROOT, rel), 'rb') as fh:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(fh.read()).decode())


html = read('index.html')

body = html.split('<body', 1)[1].split('>', 1)[1].rsplit('</body>', 1)[0]
body = re.sub(r'\s*<script src="assets/[^"]+"></script>', '', body)

for rel in sorted(set(re.findall(r'assets/img/[A-Za-z0-9._-]+', html))):
    body = body.replace(rel, datauri(rel))

bs_css = read('assets/vendor/bootstrap.min.css').replace('@charset "UTF-8";', '')
bs_js = re.sub(r'//# sourceMappingURL=\S+', '', read('assets/vendor/bootstrap.bundle.min.js'))
pz_js = read('assets/js/priorizai.js').replace(
    '  /* ---- Año en el footer ---- */',
    """  /* ---- Scrollspy (aquí el <body> lo aporta el contenedor) ---- */
  if (window.bootstrap && bootstrap.ScrollSpy) {
    new bootstrap.ScrollSpy(document.body, {
      target: '#pzNav', rootMargin: '0px 0px -55%', smoothScroll: true
    });
  }

  /* ---- Año en el footer ---- */""")

out = (
    '<meta charset="utf-8">\n'
    '<title>PriorizAI</title>\n'
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link href="' + FONTS + '" rel="stylesheet">\n'
    '<style>\n' + bs_css + '\n</style>\n'
    '<style>\n' + read('assets/css/priorizai.css') + '\n</style>\n'
    + body +
    '\n<script>\n' + bs_js + '\n</script>\n'
    '<script>\n' + pz_js + '\n</script>\n'
)

with open(DEST, 'w', encoding='utf-8') as fh:
    fh.write(out)

print('%s — %.2f MB' % (DEST, len(out.encode()) / 1024 / 1024))
