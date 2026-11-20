# ממיר קובץ Word לטקסט (פסקאות, קישורים וטבלאות). משמש ליצירת tests/fixtures/source-content.txt:
#   py -I -X utf8 scripts/docx-to-text.py "חבילת_העברה/שלא_תדעו_תוכן_האתר.docx" > tests/fixtures/source-content.txt
import sys, zipfile, re
from xml.etree import ElementTree as ET
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
path=sys.argv[1]
z=zipfile.ZipFile(path)
rels={}
try:
    rx=ET.fromstring(z.read('word/_rels/document.xml.rels'))
    for r in rx: rels[r.get('Id')]=r.get('Target')
except KeyError: pass
doc=ET.fromstring(z.read('word/document.xml'))
body=doc.find(W+'body')
def ptext(p):
    out=[]
    for el in p:
        if el.tag==W+'r':
            for t in el.iter():
                if t.tag==W+'t': out.append(t.text or '')
                elif t.tag==W+'br': out.append('\n')
                elif t.tag==W+'tab': out.append('\t')
        elif el.tag==W+'hyperlink':
            rid=el.get(R+'id'); txt=''.join(t.text or '' for t in el.iter(W+'t'))
            out.append(f'[{txt}]({rels.get(rid, el.get(W+"anchor"))})')
        elif el.tag in (W+'ins',W+'smartTag',W+'sdt'):
            out.append(''.join(t.text or '' for t in el.iter(W+'t')))
    s=''.join(out)
    ps=p.find(W+'pPr'); style=''
    if ps is not None:
        st=ps.find(W+'pStyle')
        if st is not None: style=st.get(W+'val')
        if ps.find(W+'numPr') is not None: style+='|list'
    return style,s
for el in body:
    if el.tag==W+'p':
        st,s=ptext(el)
        if s.strip() or st: print(f'<{st}> {s}' if st else s)
    elif el.tag==W+'tbl':
        print('=== TABLE ===')
        for i,tr in enumerate(el.iter(W+'tr')):
            cells=[]
            for tc in tr.findall(W+'tc'):
                cells.append(' / '.join(ptext(p)[1] for p in tc.iter(W+'p')).strip())
            print(f'R{i}: ' + ' || '.join(cells))
        print('=== END TABLE ===')
