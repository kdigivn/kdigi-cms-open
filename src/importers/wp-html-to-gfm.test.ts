import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripShortcodes, wpHtmlToGfm } from './wp-html-to-gfm'

test('headings and paragraphs', () => {
  const html = '<h2>Opening <strong>hours</strong></h2>\n<p>We are open daily at <a href="/contact/">our studio</a>.</p>'
  assert.equal(wpHtmlToGfm(html), '## Opening **hours**\n\nWe are open daily at [our studio](/contact/).')
})

test('unordered and nested lists', () => {
  const html = '<ul><li>Adults</li><li>Children<ul><li>Under 6</li><li>6–11</li></ul></li></ul>'
  assert.equal(wpHtmlToGfm(html), '- Adults\n- Children\n  - Under 6\n  - 6–11')
})

test('ordered list', () => {
  const html = '<ol><li>Step one</li><li>Step two</li></ol>'
  assert.equal(wpHtmlToGfm(html), '1. Step one\n2. Step two')
})

test('table delegates to GFM converter, wrapper div unwraps', () => {
  const html =
    '<div class="wpDataTables"><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$10</td></tr></table></div>'
  assert.equal(wpHtmlToGfm(html), '| Plan | Price |\n| --- | --- |\n| Basic | $10 |')
})

test('images: inline in paragraph and standalone', () => {
  const p = '<p>See <img src="https://wp.example.com/wp-content/uploads/boat.webp" alt="A boat"> at the pier.</p>'
  assert.equal(wpHtmlToGfm(p), 'See ![A boat](https://wp.example.com/wp-content/uploads/boat.webp) at the pier.')
  const standalone = '<img src="/a.jpg" alt="A" />'
  assert.equal(wpHtmlToGfm(standalone), '![A](/a.jpg)')
})

test('figure with caption', () => {
  const html = '<figure><img src="/pier.jpg" alt="Pier"><figcaption>The old pier</figcaption></figure>'
  assert.equal(wpHtmlToGfm(html), '![Pier](/pier.jpg)\n\n*The old pier*')
})

test('blockquote, hr, entities', () => {
  const html = '<blockquote><p>Ghi ch&uacute; &amp; l&#432;u &yacute;</p></blockquote><hr/>'
  assert.equal(wpHtmlToGfm(html), '> Ghi chú & lưu ý\n\n---')
})

test('iframe embed kept as raw html', () => {
  const out = wpHtmlToGfm('<iframe src="https://www.youtube.com/embed/abc123" width="325"></iframe>')
  assert.equal(out, '<iframe src="https://www.youtube.com/embed/abc123" allowfullscreen></iframe>')
})

test('script/style/comments dropped', () => {
  const html = '<!-- wp:paragraph --><p>Content</p><!-- /wp:paragraph --><script>alert(1)</script><style>.x{}</style>'
  assert.equal(wpHtmlToGfm(html), 'Content')
})

test('empty and whitespace input', () => {
  assert.equal(wpHtmlToGfm(''), '')
  assert.equal(wpHtmlToGfm('   \n  '), '')
})

test('linked image', () => {
  const html = '<p><a href="/product/widget/"><img src="/thumb.jpg" alt="Widget"></a></p>'
  assert.equal(wpHtmlToGfm(html), '[![Widget](/thumb.jpg)](/product/widget/)')
})

test('Gutenberg block delimiters and wp-block-* wrappers degrade to plain Markdown', () => {
  const html = [
    '<!-- wp:heading {"level":2} -->',
    '<h2 class="wp-block-heading">Getting started</h2>',
    '<!-- /wp:heading -->',
    '<!-- wp:paragraph {"align":"center"} -->',
    '<p class="has-text-align-center">Read the <a href="/docs/">docs</a>.</p>',
    '<!-- /wp:paragraph -->',
    '<!-- wp:image {"id":12,"sizeSlug":"large"} -->',
    '<figure class="wp-block-image size-large"><img src="https://wp.example.com/wp-content/uploads/a.jpg" alt="Diagram" class="wp-image-12"/><figcaption class="wp-element-caption">Figure 1</figcaption></figure>',
    '<!-- /wp:image -->',
    '<!-- wp:group {"layout":{"type":"constrained"}} -->',
    '<div class="wp-block-group"><!-- wp:list --><ul class="wp-block-list"><li>One</li><li>Two</li></ul><!-- /wp:list --></div>',
    '<!-- /wp:group -->',
  ].join('\n')
  const md = wpHtmlToGfm(html)
  assert.equal(
    md,
    [
      '## Getting started',
      'Read the [docs](/docs/).',
      '![Diagram](https://wp.example.com/wp-content/uploads/a.jpg)',
      '*Figure 1*',
      '- One\n- Two',
    ].join('\n\n'),
  )
  assert.ok(!md.includes('wp:'), 'no block comment survives')
  assert.ok(!md.includes('<'), 'no wrapper markup survives')
})

test('Elementor section/column/widget wrappers unwrap to their content', () => {
  const html =
    '<div data-elementor-type="wp-page" class="elementor elementor-12">' +
    '<section class="elementor-section elementor-top-section"><div class="elementor-container">' +
    '<div class="elementor-column elementor-col-50"><div class="elementor-widget-wrap">' +
    '<div class="elementor-element elementor-widget elementor-widget-heading"><div class="elementor-widget-container">' +
    '<h2 class="elementor-heading-title elementor-size-default">Our <span>services</span></h2></div></div>' +
    '<div class="elementor-element elementor-widget elementor-widget-text-editor"><div class="elementor-widget-container">' +
    '<div class="elementor-text-editor elementor-clearfix"><p>We build <em>fast</em> sites.</p></div></div></div>' +
    '<div class="elementor-widget-image"><div class="elementor-widget-container"><img decoding="async" src="/team.jpg" alt="Team" /></div></div>' +
    '</div></div></div></section></div>'
  assert.equal(wpHtmlToGfm(html), '## Our services\n\nWe build *fast* sites.\n\n![Team](/team.jpg)')
})

test('leftover [shortcodes] are removed from text but their content is kept', () => {
  const html =
    '<p>Intro [gallery ids="1,2,3"] text.</p>' +
    '<p>[caption id="attachment_5" align="aligncenter" width="300"]<img src="/c.jpg" alt="Cap"> A caption[/caption]</p>' +
    '<p>[vc_row][vc_column]Kept words[/vc_column][/vc_row]</p>'
  assert.equal(wpHtmlToGfm(html), 'Intro text.\n\n![Cap](/c.jpg) A caption\n\nKept words')
})

test('shortcode stripping leaves attributes, code, numeric brackets and ellipsis alone', () => {
  assert.equal(
    stripShortcodes('<p>See [1] and […] ok</p><a href="/x?a=[b]" title="[c d]">t</a><pre>[raw code]</pre><code>[inline x]</code>'),
    '<p>See [1] and […] ok</p><a href="/x?a=[b]" title="[c d]">t</a><pre>[raw code]</pre><code>[inline x]</code>',
  )
})
