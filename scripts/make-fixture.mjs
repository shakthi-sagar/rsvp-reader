// Generates fixtures/sample.epub (feature coverage) and fixtures/large.epub (performance).
import JSZip from 'jszip';
import { writeFileSync, mkdirSync } from 'node:fs';

const xhtml = (title, body) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title><style>p{text-indent:1em}</style></head>
<body>${body}</body></html>`;

function build({ title, author, chapters, withCover = true, malformed = false }) {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);
  const manifest = [];
  const spine = [];
  if (withCover) {
    zip.file('OEBPS/images/cover.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 600 900"><rect width="600" height="900" fill="#2b3a42"/><rect x="40" y="40" width="520" height="820" fill="none" stroke="#e8d9b5" stroke-width="2"/><text x="300" y="380" font-family="Georgia" font-size="54" fill="#e8d9b5" text-anchor="middle">${title}</text><text x="300" y="460" font-family="Georgia" font-size="28" fill="#c9b994" text-anchor="middle">${author}</text></svg>`);
    manifest.push(`<item id="cover-img" href="images/cover.svg" media-type="image/svg+xml" properties="cover-image"/>`);
    zip.file('OEBPS/text/cover.xhtml', xhtml('Cover', `<div><img src="../images/cover.svg" alt="Cover"/></div>`));
    manifest.push(`<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="cover"/>`);
  }
  // Nav lives in a different folder from the chapters to exercise relative href resolution.
  manifest.push(`<item id="nav" href="nav/nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  spine.push(`<itemref idref="nav" linear="no"/>`);
  const navItems = [];
  chapters.forEach((ch, i) => {
    const file = `text/ch${i + 1}.xhtml`;
    let content = xhtml(ch.title, ch.body);
    if (malformed && i === 1) content = content.replace('</p>', '<br></p>'); // invalid XHTML
    zip.file(`OEBPS/${file}`, content);
    manifest.push(`<item id="ch${i + 1}" href="${file}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="ch${i + 1}"/>`);
    const subs = (ch.subs ?? []).map((s) => `<li><a href="../${file}#${s.id}">${s.label}</a></li>`).join('');
    navItems.push(`<li><a href="../${file}">${ch.title}</a>${subs ? `<ol>${subs}</ol>` : ''}</li>`);
  });
  zip.file('OEBPS/nav/nav.xhtml', xhtml('Contents', `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>${navItems.join('')}</ol></nav>`));
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${title.replace(/\W/g, '')}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-01-01T00:00:00Z</meta>
  </metadata>
  <manifest>${manifest.join('\n    ')}</manifest>
  <spine>${spine.join('\n    ')}</spine>
</package>`);
  return zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip' });
}

const sample = [
  {
    title: 'Chapter One: The Lighthouse',
    subs: [{ id: 'storm', label: 'The Storm' }],
    body: `<section epub:type="chapter"><h1>Chapter One</h1><h2>The Lighthouse</h2>
<p>It was a dark night—darker than any she remembered. “Are you there?” she called. Nobody answered… The wind, however, had plenty to say.</p>
<p>Mr. Hale had kept the light for <em>thirty-one years</em>; he knew every stone, every gull, every rotten plank. He was, as the villagers said, <strong>indefatigable</strong>.<sup><a epub:type="noteref" href="#fn1">1</a></sup></p>
<p>She didn’t believe in ghosts. Still, the stairs creaked: one, two, three. ‘It’s only the house settling,’ she told herself -- though she wasn’t sure.</p>
<h3 id="storm">The Storm</h3>
<p>By midnight the storm had arrived in earnest. Waves broke against the rocks with extraordinarily-complicated rhythms, e.g. three short and one long, etc. Then silence.</p>
<p>Dr. J. R. Pembroke would later write that the night of 4 November 1891 was “the worst in living memory.” He was wrong, of course . . . but only slightly.</p>
<aside epub:type="footnote" id="fn1"><p>This footnote should never be read aloud.</p></aside>
<span epub:type="pagebreak" id="page12" title="12"/>
</section>`,
  },
  {
    title: 'Chapter Two: Morning',
    body: `<h1>Chapter Two</h1><h2>Morning</h2>
<p>Morning came grey and slow. The keeper climbed down, sat on the bottom step, and laughed — quietly at first, then loudly.</p>
<blockquote><p>The sea gives, and the sea takes away.</p></blockquote>
<ul><li>A broken lamp.</li><li>Three ropes, frayed.</li><li>One very wet cat.</li></ul>
<p>“Well,” he said, “that’s that.”</p>`,
  },
  {
    title: 'Chapter Three: Afterwards',
    body: `<h1>Chapter Three</h1><p>Years afterwards, when the light was automated and the keeper long gone, children still told the story. They said the lamp burned all night without oil. They said a lot of things.</p><p>The End.</p>`,
  },
];

const SENTENCES = [
  'The river bent westward past the mill, and the road followed it as faithfully as a dog.',
  'Nobody in the village could remember who had planted the oaks along the square.',
  '“We will need more lanterns before winter,” said the miller, counting on his fingers.',
  'She read late into the night; the candle guttered, flared, and finally went out.',
  'Some questions are better left unasked — at least until the harvest is in.',
  'He walked to the station, bought a ticket, and then, for reasons he never explained, went home again.',
  'Was it courage, or merely stubbornness? The distinction mattered less than people thought.',
  'Rain fell on the slate roofs with a sound like distant applause.',
];
const large = Array.from({ length: 40 }, (_, c) => {
  const paras = Array.from({ length: 60 }, (_, p) => {
    const n = 4 + ((c * 7 + p) % 5);
    return `<p>${Array.from({ length: n }, (_, k) => SENTENCES[(c + p + k) % SENTENCES.length]).join(' ')}</p>`;
  });
  return { title: `Chapter ${c + 1}`, body: `<h1>Chapter ${c + 1}</h1>${paras.join('\n')}` };
});

mkdirSync('fixtures', { recursive: true });
writeFileSync('fixtures/sample.epub', await build({ title: 'The Keeper of the Light', author: 'A. N. Example', chapters: sample, malformed: true }));
writeFileSync('fixtures/large.epub', await build({ title: 'A Very Long Book', author: 'Test Author', chapters: large, withCover: false }));
console.log('fixtures written');
