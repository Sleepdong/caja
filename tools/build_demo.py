"""Genera demo/index.html a partir de index.html (la app real) + demo/demo.js.
La demo usa datos de ejemplo en memoria: no se conecta a Supabase ni usa el almacenamiento de la app real."""
import re, subprocess, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
h = (raiz / 'index.html').read_text()

def cambiar(viejo, nuevo, regex=False):
    global h
    if regex:
        h2 = re.sub(viejo, nuevo, h, count=1)
    else:
        h2 = h.replace(viejo, nuevo, 1)
    assert h2 != h, f'no se encontró: {viejo[:60]}'
    h = h2

# 1. Base de datos de ejemplo en lugar de Supabase
cambiar(r'<script src="https://cdn\.jsdelivr\.net/npm/@supabase/supabase-js@[^>]*></script>', '<script src="demo.js"></script>', regex=True)
# 2. CSP: permitir el script propio; sin conexión a la base real
cambiar("script-src https://cdn.jsdelivr.net", "script-src 'self' https://cdn.jsdelivr.net")
cambiar(r"connect-src [^;]*;", "connect-src https://cdn.jsdelivr.net https://api.pwnedpasswords.com;", regex=True)
# 3. No es instalable ni registra el service worker de la app real
cambiar('<link rel="manifest" href="manifest.webmanifest">\n', '')
cambiar('href="favicon.png"', 'href="../favicon.png"')
cambiar('href="apple-touch-icon.png"', 'href="../apple-touch-icon.png"')
cambiar("if ('serviceWorker' in navigator && location.protocol === 'https:') {", "if (false) {")
cambiar('<title>Caja · Gestión Comercial</title>', '<title>Caja · Demostración</title>\n<meta name="robots" content="noindex">')
# 4. Aviso visible de demostración
banner = '''<div id="demoBanner" role="note"><span><b>Demostración</b> con datos de ejemplo<span class="dm-largo">. Prueba vender, cobrar o simular precios: nada se guarda y se reinicia al recargar</span>.</span><a href="https://github.com/Sleepdong/caja" target="_blank" rel="noopener">Ver el proyecto</a></div>
<style>#demoBanner{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;background:linear-gradient(135deg,#7B5CFF,#C054E8 55%,#FF7A8A);color:#fff;font:500 13px/1.4 Sora,system-ui,sans-serif;padding:9px 16px;text-align:center;padding-top:max(9px,env(safe-area-inset-top))}
@media(max-width:600px){#demoBanner .dm-largo{display:none}#demoBanner{flex-wrap:nowrap;justify-content:space-between;text-align:left}}
#demoBanner a{color:#fff;font-weight:700;background:#ffffff2e;padding:4px 12px;border-radius:999px;text-decoration:none;white-space:nowrap}
#demoBanner + #ingreso, body:has(#demoBanner) .top{padding-top:12px}</style>'''
cambiar('<body>', '<body>\n' + banner)

out = raiz / 'demo' / 'index.html'
out.write_text(h)
subprocess.run(['python3', '/home/claude/tools/csp.py', str(out)], check=True, capture_output=True)
print('demo/index.html generado')
