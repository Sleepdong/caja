"""Recalcula el hash SHA-256 del <script> en línea y lo pone en la CSP de index.html."""
import base64, hashlib, re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
scripts = re.findall(r'<script>(.*?)</script>', s, re.S)
assert len(scripts) == 1, f'esperaba 1 script en línea, hay {len(scripts)}'
h = "'sha256-" + base64.b64encode(hashlib.sha256(scripts[0].encode('utf-8')).digest()).decode() + "'"
s2, n = re.subn(r"'(HASH_SCRIPT|sha256-[A-Za-z0-9+/=]+)'", h, s, count=1)
assert n == 1
open(p, 'w', encoding='utf-8').write(s2)
print('CSP', h)
