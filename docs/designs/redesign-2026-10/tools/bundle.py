# 把 17 个原型页 + kit 合成一个单文件（dist/orbit-redesign-2026-10.html），用于发 artifact。
# 用法：python3 tools/bundle.py （在任意目录运行均可）
import json, re, os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')+'/'
kit={k:open(D+'kit/'+k).read() for k in ['tokens.css','ui.css','kit.js','data.js']}
src=open(D+'kit/kit.js').read()
m=re.search(r"const PAGES = (\[[\s\S]*?\]\]);",src)
pages=json.loads(m.group(1).replace("'",'"'))
data={}
for f,l in pages:
    h=open(D+f+'.html').read()
    h=h.replace('<link rel="stylesheet" href="kit/tokens.css">','<!--K:tokens.css-->').replace('<link rel="stylesheet" href="kit/ui.css">','<!--K:ui.css-->')
    h=h.replace('<script src="kit/kit.js"></script>','<!--K:kit.js-->').replace('<script src="kit/data.js"></script>','<!--K:data.js-->')
    assert 'href="kit/' not in h and 'src="kit/' not in h, f
    data[f]=h
def js(o): return json.dumps(o,ensure_ascii=False).replace('</','<\\/').replace('<!--','<\\!--').replace('<script','<\\script')
shell=open(D+'tools/bundle-shell.html').read()
shell=shell.replace('/*PAGES*/[]',js(pages)).replace('/*KIT*/{}',js(kit)).replace('/*DATA*/{}',js(data))
open(D+'dist/orbit-redesign-2026-10.html','w').write(shell)
print(len(shell)/1e6,'MB', len(pages),'pages')
