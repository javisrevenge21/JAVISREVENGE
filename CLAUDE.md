# Notes for changes to this site

## Every piece of text must be translated
The site shows in English, Spanish, Hebrew, Farsi and Arabic (`assets/i18n.js`).
Any text you add or change on a page or in a script needs its translation in
`assets/i18n/es.json`, `he.json`, `fa.json` and `ar.json`.

- `node scripts/i18n.js` lists the text that has no translation yet.
- `npm test` fails until every piece is translated.
- Text built in scripts is found too; code values become `{0}`, `{1}`, and
  links or bold words inside a sentence become `<0>…</0>`. Keep those markers.
- Names, @handles and brand words that must never change: add `translate="no"`,
  or list the string in `assets/i18n/ignore.json`.
- Text the finder can't see (option values filled in by code): add it to
  `assets/i18n/extra.json`.
- Hebrew, Farsi and Arabic pages are right to left. Use logical CSS
  (`margin-inline-start`, `text-align: start`) for new layout.
