"""מכין את תבנית מודעת האבל לפרסום באתר, בלי לשנות את התוכן:
- מסיר פרטים אישיים מהמטא-דאטה (מחבר, עורך אחרון)
- משאיר מוטמע רק את הגופן David (שבו כתוב הטקסט), כדי שהקובץ יהיה קל להורדה בנייד
הרצה: py -I -X utf8 scripts/clean-notice-template.py <מקור.docx> public/files/modaat-evel.docx
"""
import sys, zipfile, re

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
font_rels = zin.read('word/_rels/fontTable.xml.rels').decode('utf8')
font_table = zin.read('word/fontTable.xml').decode('utf8')

# אילו rId שייכים ל-David
keep_ids = set()
for m in re.finditer(r'<w:font w:name="([^"]+)".*?</w:font>', font_table, re.S):
    if m.group(1) == 'David':
        keep_ids |= set(re.findall(r'r:id="(rId\d+)"', m.group(0)))
rels = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', font_rels))
drop_files = {'word/' + t for i, t in rels.items() if i not in keep_ids}

def strip_embeds(m):
    block = m.group(0)
    return re.sub(r'<w:embed\w+ r:id="(rId\d+)"[^>]*/>', lambda e: e.group(0) if e.group(1) in keep_ids else '', block)

new_table = re.sub(r'<w:font w:name="[^"]+".*?</w:font>', strip_embeds, font_table, flags=re.S)
new_rels = re.sub(r'<Relationship [^>]*Id="(rId\d+)"[^>]*/>', lambda m: m.group(0) if m.group(1) in keep_ids else '', font_rels)

with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for item in zin.infolist():
        n = item.filename
        if n in drop_files:
            continue
        d = zin.read(n)
        if n == 'word/fontTable.xml': d = new_table.encode('utf8')
        elif n == 'word/_rels/fontTable.xml.rels': d = new_rels.encode('utf8')
        elif n == 'docProps/core.xml':
            d = re.sub(rb'<dc:creator>.*?</dc:creator>', b'<dc:creator></dc:creator>', d)
            d = re.sub(rb'<cp:lastModifiedBy>.*?</cp:lastModifiedBy>', b'<cp:lastModifiedBy></cp:lastModifiedBy>', d)
            if b'<dc:title' not in d:
                d = d.replace(b'</cp:coreProperties>', '<dc:title>תבנית מודעת אבל</dc:title></cp:coreProperties>'.encode('utf8'))
        z.writestr(item, d)
print('kept', sorted(keep_ids), 'dropped', len(drop_files), 'font files')
