# יוצר את תבנית מודעת האבל (לרוחב) מתוך קובץ המקור שבחבילת ההעברה:
#   py -I -X utf8 scripts/make-notice-template.py "חבילת_העברה/תבנית_מודעת_אבל.docx" public/files/modaat-evel.docx
# אחר כך: פותחים ב-Word, מייצאים PDF ומפיקים ממנו את public/images/modaat-evel-preview.webp
import sys, zipfile, re
src, dst = sys.argv[1], sys.argv[2]
# (text, half-points, bold, space-after twips) — same wording as the approved preview
LINES = [
    ("מודעת אבל", 60, True, 160),
    ("בצער רב אנו מודיעים על פטירתו/ה של", 44, False, 80),
    ("[שם הנפטר/ת]", 96, True, 240),
    ("ההלוויה תתקיים ביום [יום], [תאריך], בשעה [שעה]", 40, False, 40),
    ("בבית העלמין [שם בית העלמין], [עיר]", 40, False, 260),
    ("המשפחה תשב שבעה בכתובת [כתובת השבעה]", 40, False, 40),
    ("שעות הביקור [שעות הביקור]", 40, False, 40),
    ("הפסקה [שעות ההפסקה, אם יש]", 40, False, 280),
    ("[חתימת המשפחה]", 44, True, 0),
]
def para(text, size, bold, after):
    b = "<w:b/><w:bCs/>" if bold else '<w:b w:val="0"/><w:bCs w:val="0"/>'
    return (f'<w:p><w:pPr><w:bidi w:val="1"/><w:spacing w:before="0" w:after="{after}" w:line="264" w:lineRule="auto"/><w:jc w:val="center"/></w:pPr>'
            f'<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>{b}<w:sz w:val="{size}"/><w:szCs w:val="{size}"/><w:rtl w:val="1"/></w:rPr>'
            f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p>')
SECT = ('<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
        '<w:pgMar w:top="850" w:right="1134" w:bottom="850" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>'
        '<w:pgBorders w:offsetFrom="page">' + ''.join(f'<w:{s} w:val="single" w:sz="48" w:space="20" w:color="1A1A1A"/>' for s in ('top','left','bottom','right')) +
        '</w:pgBorders><w:vAlign w:val="center"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>')
zin = zipfile.ZipFile(src)
doc = zin.read("word/document.xml").decode("utf-8")
new_doc = doc[: doc.index("<w:body>") + 8] + "".join(para(*l) for l in LINES) + SECT + "</w:body></w:document>"
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for item in zin.infolist():
        n = item.filename
        if n == "docProps/thumbnail.jpeg": continue
        d = zin.read(n)
        if n == "word/document.xml": d = new_doc.encode()
        elif n == "_rels/.rels": d = re.sub(rb'<Relationship [^>]*thumbnail[^>]*/>', b"", d)
        elif n == "docProps/core.xml":
            d = re.sub(rb"<dc:creator>.*?</dc:creator>", b"<dc:creator></dc:creator>", d)
            d = re.sub(rb"<dc:title\s*/>|<dc:title>.*?</dc:title>", "<dc:title>תבנית מודעת אבל</dc:title>".encode(), d)
        z.writestr(item, d)
