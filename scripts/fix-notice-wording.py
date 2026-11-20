"""תיקוני ניסוח שאושרו בתבנית מודעת האבל (2026-11-20):
1. שורת הקרבה הפכה לשדה למילוי: [בעלי, אבינו וסבנו היקר]
2. "פטירתו" → "פטירתו/ה"
3. הקווים העבים של השם → [שם פרטי] [שם משפחה]
4. שעות הביקור מתחילות ב-09:00
הרצה: py -I -X utf8 scripts/fix-notice-wording.py public/files/modaat-evel.docx
"""
import sys, re, zipfile, shutil, os

path = sys.argv[1]
z = zipfile.ZipFile(path)
xml = z.read('word/document.xml').decode('utf8')
head, body = xml[: xml.index('<w:body>')], xml[xml.index('<w:body>'):]
paras = list(re.finditer(r'<w:p[ >].*?</w:p>', body, re.S))
texts = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', m.group(0))) for m in paras]

def find(prefix):
    idx = [i for i, t in enumerate(texts) if t.startswith(prefix)]
    assert len(idx) == 1, (prefix, idx)
    return idx[0]

def set_run_texts(p, fn):
    """fn(index, text, run_xml) -> (new_text or None, new_run_xml or None)"""
    runs = list(re.finditer(r'<w:r[ >].*?</w:r>', p, re.S))
    out, last, k = [], 0, 0
    for r in runs:
        rx = r.group(0)
        t = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', rx))
        if t:
            nt, nrx = fn(k, t, rx)
            if nrx is not None:
                rx = nrx
            if nt is not None:
                rx = re.sub(r'<w:t[^>]*>[^<]*</w:t>', f'<w:t xml:space="preserve">{nt}</w:t>', rx, count=1)
            k += 1
        out.append(p[last:r.start()] + rx)
        last = r.end()
    out.append(p[last:])
    return ''.join(out)

new = {}
# 2. פטירתו → פטירתו/ה
i = find('בצער רב')
new[i] = set_run_texts(paras[i].group(0), lambda k, t, rx: ('פטירתו/ה', None) if t == 'פטירתו' else (None, None))
# 1. שורת הקרבה
i = find('בעלי')
new[i] = set_run_texts(paras[i].group(0), lambda k, t, rx: ('[בעלי, אבינו וסבנו היקר]', None) if k == 0 else ('', None))
# 3. השם: הקווים העבים → טקסט למילוי, בגודל 48 נקודות ומודגש
def name_run(k, t, rx):
    rx2 = re.sub(r'<w:sz w:val="260"/>', '<w:sz w:val="96"/>', rx)
    rx2 = re.sub(r'<w:szCs w:val="260"/>', '<w:szCs w:val="96"/>', rx2)
    if '<w:b/>' not in rx2:
        rx2 = rx2.replace('<w:rPr>', '<w:rPr><w:b/><w:bCs/>', 1)
    if t == '___':
        return ('[שם פרטי]' if k == 0 else '[שם משפחה]', rx2)
    if t == ' ':
        return (None, rx2)
    return (None, None)
i = find('___')
new[i] = set_run_texts(paras[i].group(0), name_run)
# 4. שעת התחלה
i = find('בשעות')
new[i] = set_run_texts(paras[i].group(0), lambda k, t, rx: ('09:00-', None) if t == '8:00-' else (None, None))

parts, last = [], 0
for j, m in enumerate(paras):
    parts.append(body[last:m.start()] + new.get(j, m.group(0)))
    last = m.end()
parts.append(body[last:])
new_xml = head + ''.join(parts)

tmp = path + '.tmp'
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
    for item in z.infolist():
        data = new_xml.encode('utf8') if item.filename == 'word/document.xml' else z.read(item.filename)
        out.writestr(item, data)
z.close()
shutil.move(tmp, path)
print('ok')

# 5. ריווח סביב שורת השם, כדי שהמודעה תישאר מאוזנת אחרי הסרת הקווים העבים
z = zipfile.ZipFile(path)
xml = z.read('word/document.xml').decode('utf8')
def add_spacing(m):
    p = m.group(0)
    if '[שם פרטי]' not in p or '<w:spacing w:before="480"' in p:
        return p
    return p.replace('<w:pPr><w:jc w:val="center"/>', '<w:pPr><w:spacing w:before="480" w:after="360"/><w:jc w:val="center"/>', 1)
xml2 = re.sub(r'<w:p[ >].*?</w:p>', add_spacing, xml, flags=re.S)
if xml2 != xml:
    tmp = path + '.tmp'
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for item in z.infolist():
            out.writestr(item, xml2.encode('utf8') if item.filename == 'word/document.xml' else z.read(item.filename))
    z.close()
    shutil.move(tmp, path)
    print('spacing added')
