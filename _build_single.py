# -*- coding: utf-8 -*-
"""将多文件版本打包为单文件发行版（CSS/JS/图片全部内联）"""
import io, os, base64, re

ROOT = os.path.dirname(os.path.abspath(__file__))
html = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

# 1. 内联 CSS（兼容 ?v= 查询串）
css = io.open(os.path.join(ROOT, 'css', 'style.css'), encoding='utf-8').read()
html = re.sub(
    r'<link rel="stylesheet" href="css/style\.css(?:\?[^"]*)?">',
    lambda m: '<style>\n' + css + '\n</style>',
    html)

# 2. 内联 JS（须在图片替换之前，使 JS 内的图片路径也被替换；兼容 ?v= 查询串）
def inline_script(m):
    src = m.group(1)
    code = io.open(os.path.join(ROOT, src.split('?')[0]), encoding='utf-8').read()
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<script src="(js/[^"?]+[^"]*)"></script>', inline_script, html)

# 3. 图片转 data URI（python replace 替换全部出现位置）
def data_uri(rel):
    p = os.path.join(ROOT, rel.replace('../', ''))
    ext = os.path.splitext(p)[1].lower()
    mime = 'image/png' if ext == '.png' else 'image/jpeg'
    b64 = base64.b64encode(open(p, 'rb').read()).decode('ascii')
    return 'data:' + mime + ';base64,' + b64

img_files = [f for f in os.listdir(os.path.join(ROOT, 'assets', 'img'))]
for name in img_files:
    uri = data_uri('assets/img/' + name)
    html = html.replace('assets/img/' + name, uri)
    html = html.replace('../assets/img/' + name, uri)

out = os.path.join(ROOT, '向火独行.html')
io.open(out, 'w', encoding='utf-8').write(html)
print('生成单文件:', out, '| 大小:', os.path.getsize(out) // 1024, 'KB')
