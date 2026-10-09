// Markdown Reader — page renderer.
// Parsing: markdown-it (CommonMark + GFM tables, strikethrough, autolinks) with
// footnotes, plus the small plugins below: GitHub alerts, task lists, heading
// anchors and math. Output is sanitised with DOMPurify; then KaTeX renders math,
// highlight.js colours code and Mermaid draws diagrams. Nothing in a document runs.
(function (root) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ESC[c]);
  const ALERTS = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };

  let slugs = {};

  function slug(text) {
    let s = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    if (slugs[s] === undefined) { slugs[s] = 0; return s; }
    slugs[s] += 1;
    return s + '-' + slugs[s];
  }

  // ---------- plugins ----------

  function alertsPlugin(md) {
    md.core.ruler.after('block', 'gh_alerts', state => {
      const t = state.tokens;
      for (let i = 0; i < t.length; i++) {
        if (t[i].type !== 'blockquote_open') continue;
        const inl = t[i + 2];
        if (!t[i + 1] || t[i + 1].type !== 'paragraph_open' || !inl || inl.type !== 'inline') continue;
        const m = inl.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i);
        if (!m) continue;
        let depth = 0, j = i;
        for (; j < t.length; j++) {
          if (t[j].type === 'blockquote_open') depth++;
          else if (t[j].type === 'blockquote_close' && --depth === 0) break;
        }
        const kind = m[1].toUpperCase();
        t[i].tag = 'div';
        t[i].attrSet('class', 'alert alert-' + kind.toLowerCase());
        if (t[j]) t[j].tag = 'div';
        const title = new state.Token('html_block', '', 0);
        title.content = `<p class="alert-title">${ALERTS[kind]}</p>\n`;
        inl.content = inl.content.slice(m[0].length);
        if (inl.content.trim()) t.splice(i + 1, 0, title);
        else t.splice(i + 1, 3, title);
      }
    });
  }

  function taskListPlugin(md) {
    md.core.ruler.after('inline', 'task_lists', state => {
      const t = state.tokens;
      for (let i = 2; i < t.length; i++) {
        if (t[i].type !== 'inline' || t[i - 1].type !== 'paragraph_open' || t[i - 2].type !== 'list_item_open') continue;
        const first = t[i].children[0];
        const m = first && first.type === 'text' && first.content.match(/^\[([ xX])\](?:[ \t]+|$)/);
        if (!m) continue;
        first.content = first.content.slice(m[0].length);
        const box = new state.Token('html_inline', '', 0);
        box.content = `<input type="checkbox" disabled${m[1] === ' ' ? '' : ' checked'}> `;
        t[i].children.unshift(box);
        t[i - 2].attrJoin('class', 'task');
      }
    });
  }

  function anchorPlugin(md) {
    md.core.ruler.after('inline', 'heading_anchors', state => {
      const t = state.tokens;
      for (let i = 0; i < t.length; i++) {
        if (t[i].type !== 'heading_open') continue;
        const text = t[i + 1].children
          .filter(c => c.type === 'text' || c.type === 'code_inline')
          .map(c => c.content).join('');
        const id = slug(text);
        t[i].attrSet('id', id);
        const a = new state.Token('html_inline', '', 0);
        a.content = `<a class="anchor" href="#${esc(id)}" aria-hidden="true">#</a>`;
        t[i + 1].children.unshift(a);
      }
    });
  }

  function mathPlugin(md) {
    // $inline$ (pandoc rules: no space inside the dollars, no digit after the closing one) and $$display$$
    md.inline.ruler.after('escape', 'math_inline', (state, silent) => {
      const s = state.src, pos = state.pos;
      if (s[pos] !== '$') return false;
      if (s[pos + 1] === '$') {
        const end = s.indexOf('$$', pos + 2);
        if (end < 0 || end === pos + 2) return false;
        if (!silent) state.push('math_display_inline', 'math', 0).content = s.slice(pos + 2, end);
        state.pos = end + 2;
        return true;
      }
      if (!s[pos + 1] || /\s/.test(s[pos + 1])) return false;
      let end = pos + 1;
      for (;;) {
        end = s.indexOf('$', end);
        if (end < 0) return false;
        if (s[end - 1] === '\\' || /\s/.test(s[end - 1]) || /\d/.test(s[end + 1] || '')) { end++; continue; }
        break;
      }
      if (!silent) state.push('math_inline', 'math', 0).content = s.slice(pos + 1, end);
      state.pos = end + 1;
      return true;
    });

    md.block.ruler.before('fence', 'math_block', (state, startLine, endLine, silent) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      if (state.src.slice(start, start + 2) !== '$$') return false;
      const rest = state.src.slice(start + 2, state.eMarks[startLine]).trim();
      let content = '', next = startLine, found = false;
      if (rest.length > 2 && rest.endsWith('$$')) { content = rest.slice(0, -2); found = true; }
      else if (rest.endsWith('$$')) { return false; }
      else {
        content = rest ? rest + '\n' : '';
        for (next = startLine + 1; next < endLine; next++) {
          const line = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]);
          if (line.trim().endsWith('$$')) { content += line.trim().slice(0, -2); found = true; break; }
          content += line + '\n';
        }
      }
      if (!found) return false;
      if (silent) return true;
      const tok = state.push('math_block', 'math', 0);
      tok.block = true;
      tok.content = content.trim();
      tok.map = [startLine, next + 1];
      state.line = next + 1;
      return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });

    md.renderer.rules.math_inline = (t, i) => `<span class="math" data-tex="${esc(t[i].content)}">${esc(t[i].content)}</span>`;
    md.renderer.rules.math_display_inline = (t, i) => `<span class="math display" data-tex="${esc(t[i].content)}">${esc(t[i].content)}</span>`;
    md.renderer.rules.math_block = (t, i) => `<div class="math display" data-tex="${esc(t[i].content)}">${esc(t[i].content)}</div>\n`;
  }

  function codePlugin(md) {
    const block = (code, lang) => {
      if (lang === 'mermaid') return `<div class="mermaid-wrap"><pre class="mermaid">${esc(code)}</pre></div>\n`;
      if (lang === 'math') return `<div class="math display" data-tex="${esc(code)}">${esc(code)}</div>\n`;
      let body = esc(code), cls = '';
      const hl = root.hljs;
      if (lang && hl && hl.getLanguage(lang)) {
        try { body = hl.highlight(code, { language: lang, ignoreIllegals: true }).value; cls = ` class="hljs language-${esc(lang)}"`; } catch (e) { /* plain */ }
      } else if (lang) {
        cls = ` class="language-${esc(lang)}"`;
      }
      const label = lang ? `<span class="lang">${esc(lang)}</span>` : '';
      return `<div class="code">${label}<pre><code${cls}>${body}</code></pre></div>\n`;
    };
    md.renderer.rules.fence = (t, i) => block(t[i].content.replace(/\n$/, ''), (t[i].info || '').trim().split(/\s+/)[0].toLowerCase());
    md.renderer.rules.code_block = (t, i) => block(t[i].content.replace(/\n$/, ''), '');
  }

  // ---------- parser ----------

  let parser = null;

  function getParser() {
    if (parser) return parser;
    const md = root.markdownit({ html: true, linkify: true, typographer: false });
    md.linkify.set({ fuzzyLink: false });
    md.validateLink = url => {
      const u = url.trim().toLowerCase();
      if (/^(javascript|vbscript):/.test(u)) return false;
      if (/^data:/.test(u)) return /^data:image\/(gif|png|jpeg|webp|svg\+xml);/.test(u);
      return true;
    };
    if (root.markdownitFootnote) md.use(root.markdownitFootnote);
    md.use(alertsPlugin).use(taskListPlugin).use(anchorPlugin).use(mathPlugin).use(codePlugin);
    parser = md;
    return md;
  }

  function frontMatter(text) {
    const m = text.match(/^---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
    if (!m) return { html: '', body: text };
    return {
      html: `<details class="front-matter"><summary>Front matter</summary><pre><code>${esc(m[1])}</code></pre></details>\n`,
      body: text.slice(m[0].length),
    };
  }

  function toHtml(text) {
    slugs = {};
    text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const fm = frontMatter(text);
    return fm.html + getParser().render(fm.body);
  }

  root.markdownToHtml = toHtml;

  // ---------- page ----------

  if (typeof document === 'undefined') return;

  const post = (name, body) => {
    try { window.webkit.messageHandlers[name].postMessage(body); } catch (e) { /* outside the app */ }
  };

  const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

  function sanitize(html) {
    if (!root.DOMPurify) return html;
    return root.DOMPurify.sanitize(html, {
      SANITIZE_DOM: false, // keep heading ids such as "title" or "images"
      FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option'],
      ALLOWED_URI_REGEXP: /^(?!\s*(?:javascript|vbscript|data(?!:image\/)):)/i,
    });
  }

  function renderMath(container) {
    if (!root.katex) return;
    container.querySelectorAll('.math[data-tex]').forEach(el => {
      try {
        root.katex.render(el.getAttribute('data-tex'), el, {
          displayMode: el.classList.contains('display'),
          throwOnError: false,
          output: 'htmlAndMathml',
        });
      } catch (e) { el.classList.add('math-error'); }
    });
  }

  let mermaidSeq = 0;
  async function renderDiagrams(container) {
    const nodes = Array.from(container.querySelectorAll('pre.mermaid'));
    if (!nodes.length || !root.mermaid) return;
    root.mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark() ? 'dark' : 'default',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
    });
    for (const node of nodes) {
      const source = node.textContent;
      try {
        const { svg } = await root.mermaid.render('mmd-' + (++mermaidSeq), source);
        const wrap = node.parentElement;
        wrap.innerHTML = svg;
        wrap.dataset.source = source;
      } catch (e) {
        node.classList.add('mermaid-error');
        node.title = String((e && e.message) || e);
        document.querySelectorAll('#dmmd-' + mermaidSeq + ', #mmd-' + mermaidSeq).forEach(n => n.remove());
      }
    }
  }

  function addCopyButtons(container) {
    container.querySelectorAll('div.code').forEach(div => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'copy';
      b.textContent = 'Copy';
      div.insertBefore(b, div.firstChild);
    });
  }

  function scrollToFragment(frag) {
    if (!frag) return false;
    let id = frag;
    try { id = decodeURIComponent(frag); } catch (e) { /* keep raw */ }
    const el = document.getElementById(id) || document.getElementById(id.toLowerCase());
    if (el) { el.scrollIntoView({ block: 'start' }); return true; }
    return false;
  }

  let lastSource = null;

  root.render = function (text, fragment) {
    lastSource = text;
    const y = window.scrollY;
    const content = document.getElementById('content');
    content.innerHTML = sanitize(toHtml(text));
    addCopyButtons(content);
    renderMath(content);
    if (!scrollToFragment(fragment)) window.scrollTo(0, y);
    renderDiagrams(content).then(() => {
      if (fragment) scrollToFragment(fragment); else window.scrollTo(0, y);
    });
    const h1 = content.querySelector('h1');
    return h1 ? h1.textContent.replace(/^#/, '').trim() : '';
  };

  // diagrams follow a light/dark switch
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (lastSource !== null && document.querySelector('.mermaid-wrap')) root.render(lastSource);
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('button.copy');
    if (btn) {
      post('copy', btn.parentElement.querySelector('code').textContent);
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1200);
      return;
    }
    const a = e.target.closest('a[href]');
    if (a && a.getAttribute('href').startsWith('#')) {
      e.preventDefault();
      scrollToFragment(a.getAttribute('href').slice(1));
    }
  });

  // ---------- find bar ----------

  let findBar, findInput, findCount;
  function ensureFind() {
    if (findBar) return;
    findBar = document.createElement('div');
    findBar.id = 'findbar';
    findBar.hidden = true;
    findBar.innerHTML = '<input type="search" placeholder="Find in page" spellcheck="false"><span class="count"></span>' +
      '<button type="button" data-dir="prev" title="Previous (⇧⌘G)">‹</button><button type="button" data-dir="next" title="Next (⌘G)">›</button>' +
      '<button type="button" data-dir="close" title="Close (Esc)">×</button>';
    document.body.appendChild(findBar);
    findInput = findBar.querySelector('input');
    findCount = findBar.querySelector('.count');
    findInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); root.findNext(e.shiftKey); }
      if (e.key === 'Escape') { e.preventDefault(); root.hideFind(); }
    });
    findInput.addEventListener('input', () => {
      window.getSelection().removeAllRanges();
      updateCount();
      if (findInput.value) root.findNext(false, true);
    });
    findBar.addEventListener('click', e => {
      const d = e.target.dataset && e.target.dataset.dir;
      if (d === 'close') root.hideFind();
      else if (d) root.findNext(d === 'prev');
    });
  }
  function updateCount() {
    const q = findInput.value.toLowerCase();
    if (!q) { findCount.textContent = ''; return; }
    const hay = document.getElementById('content').textContent.toLowerCase();
    let n = 0, k = 0;
    while ((k = hay.indexOf(q, k)) !== -1) { n++; k += q.length; }
    findCount.textContent = n ? n + (n === 1 ? ' match' : ' matches') : 'no matches';
  }
  root.showFind = function () {
    ensureFind();
    findBar.hidden = false;
    const sel = String(window.getSelection());
    if (sel && !sel.includes('\n') && sel.length < 80) findInput.value = sel;
    findInput.focus();
    findInput.select();
    updateCount();
  };
  root.hideFind = function () { if (findBar) findBar.hidden = true; };
  root.findNext = function (backwards, fromStart) {
    ensureFind();
    if (!findInput.value) { root.showFind(); return; }
    if (fromStart) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      const r = document.createRange();
      r.setStart(document.getElementById('content'), 0);
      r.collapse(true);
      sel.addRange(r);
    }
    const hidden = findBar.hidden;
    findBar.hidden = true; // keep the bar's own input out of the search
    window.find(findInput.value, false, !!backwards, true, false, false, false);
    findBar.hidden = hidden;
  };
})(typeof window !== 'undefined' ? window : globalThis);
