# Fonts

`NotoSansKR-subset.ttf` — Noto Sans KR (Google), SIL Open Font License 1.1,
see `OFL.txt`. Subset to the glyphs this app can produce: all 11,172 modern
Hangul syllables, Hangul compatibility jamo, Latin-1 and Latin Extended-A
(Finnish ä/ö/å), digits, and the punctuation used in exports. 4.4 MB → 2.0 MB.

It exists because jsPDF's built-in fonts carry no Hangul, so every Korean
character in an exported PDF came out blank. It is fetched only when someone
exports, not with the app.

## It must stay TrueType

jsPDF parses `glyf` outlines only. Built from the OTF (CFF outlines) instead,
every glyph embeds but renders as unrelated Latin characters — the failure
looks like a broken encoding rather than a wrong font format. It must also be
a static instance: the upstream file is variable, and jsPDF cannot embed one.

Source: `ofl/notosanskr/NotoSansKR[wght].ttf` from google/fonts.

To regenerate:

    python3 - <<'PY'
    from fontTools import subset
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer

    static = instancer.instantiateVariableFont(
        TTFont("NotoSansKR[wght].ttf"), {"wght": 400}, inplace=False)
    static.save("/tmp/static.ttf")

    codepoints = (list(range(0x20, 0x7F)) + list(range(0xC0, 0x180))
                  + list(range(0x2010, 0x2028)) + list(range(0x3130, 0x3190))
                  + list(range(0xAC00, 0xD7A4)))
    o = subset.Options(); o.layout_features = []; o.notdef_outline = False
    f = subset.load_font("/tmp/static.ttf", o)
    s = subset.Subsetter(options=o); s.populate(unicodes=codepoints); s.subset(f)
    subset.save_font(f, "NotoSansKR-subset.ttf", o)
    PY

Verify afterwards that `glyf` is present and `CFF ` and `fvar` are not.

## Why every syllable

All 11,172 modern syllables are kept rather than the 2,350 of KS X 1001. That
roughly triples the file, but goals are user-written and names and uncommon
words fall outside the smaller set — a missing glyph is a silent blank in
someone's exported plan, which is worse than a larger download.
