// Markdown Reader — a small GitHub-flavoured Markdown renderer.
// Covers headings, paragraphs, emphasis, links (inline, reference, bare URLs),
// images, code spans and fenced code, lists (nested, ordered, task lists),
// blockquotes with GitHub alerts, tables, rules, front matter and a few safe
// inline HTML tags. Everything else is shown as text, never run.
(function (root) {
  'use strict';

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ESC[c]);

  const LIST = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
  const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/;
  const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
  const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const QUOTE = /^ {0,3}>/;
  const TABLE_SEP = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
  const REF_DEF = /^ {0,3}\[([^\]]+)\]:[ \t]*<?([^\s>]+)>?(?:[ \t]+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?[ \t]*$/;
  const ALERTS = { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' };
  const SAFE_TAG = /<\/?(br|kbd|sub|sup|b|i|em|strong|u|s|mark|del|ins|small|code)\s*\/?>/gi;

  let refs, slugs, stash;

  const blank = l => /^[ \t]*$/.test(l);
  const indentOf = l => l.match(/^ */)[0].length;
  const normRef = s => s.trim().replace(/\s+/g, ' ').toLowerCase();

  function startsBlock(l, inParagraph) {
    if (FENCE.test(l) || HEADING.test(l) || HR.test(l) || QUOTE.test(l)) return true;
    if (/^ {0,3}<!--/.test(l) || /^ {0,3}<\/?(details|summary)\b/i.test(l)) return true;
    const m = l.match(LIST);
    if (m && m[4].trim() !== '') {
      if (!inParagraph) return true;
      return !/\d/.test(m[2]) || /^1[.)]$/.test(m[2]);
    }
    return false;
  }

  function slug(raw) {
    let s = raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '')
      .replace(/[`*~]/g, '').trim().toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
    if (slugs[s] === undefined) { slugs[s] = 0; return s; }
    slugs[s] += 1;
    return s + '-' + slugs[s];
  }

  // ---------- blocks ----------

  function parseBlocks(lines, tight) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (blank(line)) { i++; continue; }

      if ((m = line.match(FENCE))) {
        const indent = m[1].length, fence = m[2], body = [];
        i++;
        while (i < lines.length) {
          const c = lines[i].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
          if (c && c[1][0] === fence[0] && c[1].length >= fence.length) { i++; break; }
          body.push(lines[i].replace(new RegExp('^ {0,' + indent + '}'), ''));
          i++;
        }
        out.push(codeBlock(body.join('\n'), m[3]));
        continue;
      }

      if ((m = line.match(HEADING))) {
        const n = m[1].length, text = m[2] || '', id = slug(text);
        out.push(`<h${n} id="${esc(id)}"><a class="anchor" href="#${esc(id)}" aria-hidden="true">#</a>${inline(text)}</h${n}>`);
        i++; continue;
      }

      if (HR.test(line)) { out.push('<hr>'); i++; continue; }

      if (/^ {0,3}<!--/.test(line)) {
        while (i < lines.length && !lines[i].includes('-->')) i++;
        i++; continue;
      }
      if ((m = line.match(/^ {0,3}<(\/?)(details|summary)\b[^>]*>(.*)$/i))) {
        const tag = m[2].toLowerCase();
        if (m[1]) { out.push(`</${tag}>`); }
        else if (tag === 'summary') {
          out.push(`<summary>${inline(m[3].replace(/<\/summary>\s*$/i, ''))}</summary>`);
        } else {
          out.push(/\bopen\b/i.test(line) ? '<details open>' : '<details>');
          if (m[3].trim()) out.push(parseBlocks([m[3]], false));
        }
        i++; continue;
      }

      if (QUOTE.test(line)) {
        const inner = [];
        while (i < lines.length && (QUOTE.test(lines[i]) ||
               (!blank(lines[i]) && inner.length && !blank(inner[inner.length - 1]) && !startsBlock(lines[i], true)))) {
          inner.push(lines[i].replace(/^ {0,3}> ?/, ''));
          i++;
        }
        const a = inner[0] && inner[0].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i);
        if (a) {
          const kind = a[1].toUpperCase();
          out.push(`<div class="alert alert-${kind.toLowerCase()}"><p class="alert-title">${ALERTS[kind]}</p>${parseBlocks(inner.slice(1), false)}</div>`);
        } else {
          out.push(`<blockquote>${parseBlocks(inner, false)}</blockquote>`);
        }
        continue;
      }

      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) {
        const head = splitRow(line), aligns = splitRow(lines[i + 1]).map(c => {
          const l = c.startsWith(':'), r = c.endsWith(':');
          return l && r ? 'center' : r ? 'right' : l ? 'left' : '';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && !blank(lines[i]) && lines[i].includes('|') && !startsBlock(lines[i], true)) {
          rows.push(splitRow(lines[i])); i++;
        }
        const cell = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${inline(c || '')}</${tag}>`;
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map((c, k) => cell('th', c, k)).join('') +
          '</tr></thead><tbody>' + rows.map(r => '<tr>' + head.map((_, k) => cell('td', r[k], k)).join('') + '</tr>').join('') +
          '</tbody></table></div>');
        continue;
      }

      if ((m = line.match(LIST))) {
        const r = parseList(lines, i);
        out.push(r.html); i = r.next; continue;
      }

      if (indentOf(line) >= 4) {
        const body = [];
        while (i < lines.length && (blank(lines[i]) || indentOf(lines[i]) >= 4)) { body.push(lines[i].slice(4)); i++; }
        while (body.length && blank(body[body.length - 1])) body.pop();
        out.push(codeBlock(body.join('\n'), ''));
        continue;
      }

      // paragraph (with setext headings)
      const para = [line.trim()];
      i++;
      let setext = 0;
      while (i < lines.length && !blank(lines[i])) {
        const l = lines[i];
        if (/^ {0,3}=+[ \t]*$/.test(l)) { setext = 1; i++; break; }
        if (/^ {0,3}-+[ \t]*$/.test(l)) { setext = 2; i++; break; }
        if (startsBlock(l, true)) break;
        if (l.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-')) break;
        para.push(l.replace(/^[ \t]+/, '')); i++;
      }
      const text = para.join('\n');
      if (setext) {
        const id = slug(text);
        out.push(`<h${setext} id="${esc(id)}"><a class="anchor" href="#${esc(id)}" aria-hidden="true">#</a>${inline(text)}</h${setext}>`);
      } else {
        out.push(tight ? inline(text) : `<p>${inline(text)}</p>`);
      }
    }
    return out.join('\n');
  }

  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
    const cells = [];
    let cur = '', code = 0;
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (c === '\\' && s[k + 1] === '|') { cur += '|'; k++; continue; }
      if (c === '`') code ^= 1;
      if (c === '|' && !code) { cells.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    cells.push(cur.trim());
    return cells;
  }

  function parseList(lines, i) {
    const first = lines[i].match(LIST);
    const ordered = /\d/.test(first[2]);
    const marker = ordered ? first[2].slice(-1) : first[2];
    const start = ordered ? parseInt(first[2], 10) : 1;
    const items = [];
    let loose = false;

    while (i < lines.length) {
      const m = lines[i].match(LIST);
      if (!m || /\d/.test(m[2]) !== ordered || (ordered ? m[2].slice(-1) : m[2]) !== marker) break;
      if (HR.test(lines[i])) break;
      const markerIndent = m[1].length;
      const gap = m[3].length;
      const contentIndent = markerIndent + m[2].length + (gap > 4 || m[4] === '' ? 1 : gap);
      const raw = [{ text: gap > 4 ? ' '.repeat(gap - 1) + m[4] : m[4], first: true }];
      i++;
      let sawBlank = false;
      while (i < lines.length) {
        const l = lines[i];
        if (blank(l)) { raw.push({ text: '' }); sawBlank = true; i++; continue; }
        const ind = indentOf(l);
        if (ind >= contentIndent || (ind > markerIndent && LIST.test(l))) {
          raw.push({ text: l, ind }); sawBlank = false; i++; continue;
        }
        if (sawBlank || LIST.test(l) || startsBlock(l, true)) break;
        raw.push({ text: l.trim(), lazy: true }); i++;
      }
      const nested = raw.filter(r => r.ind !== undefined).map(r => r.ind);
      const cut = Math.min(contentIndent, ...(nested.length ? nested : [contentIndent]));
      const itemLines = raw.map(r => (r.ind !== undefined ? r.text.slice(cut) : r.text));
      let trailing = false;
      while (itemLines.length > 1 && itemLines[itemLines.length - 1] === '') { itemLines.pop(); trailing = true; }
      const nx = i < lines.length && lines[i].match(LIST);
      if (trailing && nx && /\d/.test(nx[2]) === ordered && (ordered ? nx[2].slice(-1) : nx[2]) === marker) loose = true;
      for (let k = 0; k + 1 < itemLines.length; k++) {
        if (itemLines[k] === '' && itemLines[k + 1] !== '' && !LIST.test(itemLines[k + 1]) && !/^[ \t]/.test(itemLines[k + 1])) loose = true;
      }
      items.push(itemLines);
    }

    const tag = ordered ? 'ol' : 'ul';
    const startAttr = ordered && start !== 1 ? ` start="${start}"` : '';
    let task = false;
    const lis = items.map(itemLines => {
      const t = itemLines[0].match(/^\[([ xX])\][ \t]+(.*)$/);
      let prefix = '', cls = '';
      if (t) {
        task = true; cls = ' class="task"';
        prefix = `<input type="checkbox" disabled${t[1] !== ' ' ? ' checked' : ''}> `;
        itemLines = [t[2]].concat(itemLines.slice(1));
      }
      return `<li${cls}>${prefix}${parseBlocks(itemLines, !loose)}</li>`;
    });
    return { html: `<${tag}${startAttr}${task ? ' class="tasks"' : ''}>\n${lis.join('\n')}\n</${tag}>`, next: i };
  }

  function codeBlock(body, lang) {
    const cls = lang ? ` class="language-${esc(lang)}"` : '';
    const label = lang ? `<span class="lang">${esc(lang)}</span>` : '';
    return `<div class="code">${label}<button class="copy" type="button">Copy</button><pre><code${cls}>${esc(body)}</code></pre></div>`;
  }

  // ---------- inline ----------

  const put = html => { stash.push(html); return '\u0000' + (stash.length - 1) + '\u0000'; };

  function restore(s) {
    for (let n = 0; n < 20 && s.includes('\u0000'); n++) {
      s = s.replace(/\u0000(\d+)\u0000/g, (_, k) => stash[+k]);
    }
    return s;
  }

  function inline(text) { return restore(inlineRaw(text)); }

  function safeUrl(url) {
    const u = url.trim();
    if (/^(javascript|vbscript|data):/i.test(u) && !/^data:image\//i.test(u)) return '#';
    return u;
  }

  function linkHtml(url, text, title) {
    const t = title ? ` title="${esc(title)}"` : '';
    return `<a href="${esc(safeUrl(url))}"${t}>${inlineRaw(text)}</a>`;
  }

  function imgHtml(url, alt, title) {
    const t = title ? ` title="${esc(title)}"` : '';
    return `<img src="${esc(safeUrl(url))}" alt="${esc(alt)}"${t}>`;
  }

  function matchBracket(s, open, a, b) {
    let depth = 0;
    for (let k = open; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === a) depth++;
      else if (c === b) { depth--; if (depth === 0) return k; }
    }
    return -1;
  }

  function links(s) {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') { out += s.slice(i, i + 2); i += 2; continue; }
      if (c === '[' || (c === '!' && s[i + 1] === '[')) {
        const img = c === '!';
        const open = img ? i + 1 : i;
        const close = matchBracket(s, open, '[', ']');
        if (close > 0) {
          const text = s.slice(open + 1, close);
          if (s[close + 1] === '(') {
            const end = matchBracket(s, close + 1, '(', ')');
            if (end > 0) {
              const inner = s.slice(close + 2, end).trim();
              const tm = inner.match(/^(<[^>]*>|\S+)(?:\s+(?:"([^"]*)"|'([^']*)'|\(([^)]*)\)))?$/);
              let url = tm ? tm[1] : inner;
              const title = tm ? (tm[2] || tm[3] || tm[4] || '') : '';
              if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
              out += put(img ? imgHtml(url, text, title) : linkHtml(url, text, title));
              i = end + 1; continue;
            }
          }
          let ref = text, end = close;
          if (s[close + 1] === '[') {
            const e2 = matchBracket(s, close + 1, '[', ']');
            if (e2 > 0) { ref = s.slice(close + 2, e2) || text; end = e2; }
          }
          const def = refs[normRef(ref)];
          if (def && !/^\^/.test(text)) {
            out += put(img ? imgHtml(def.url, text, def.title) : linkHtml(def.url, text, def.title));
            i = end + 1; continue;
          }
        }
      }
      out += c; i++;
    }
    return out;
  }

  function inlineRaw(text) {
    let s = text;
    // code spans
    s = s.replace(/(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => {
      let c = code.replace(/\n/g, ' ');
      if (/^ .* $/.test(c) && c.trim()) c = c.slice(1, -1);
      return put(`<code>${esc(c)}</code>`);
    });
    // backslash escapes and hard breaks
    s = s.replace(/\\\n/g, () => put('<br>'));
    s = s.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, (_, ch) => put(esc(ch)));
    s = s.replace(/ {2,}\n/g, () => put('<br>'));
    // comments, autolinks, safe tags
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/<((?:https?|ftp):\/\/[^\s<>]+)>/gi, (_, u) => put(`<a href="${esc(u)}">${esc(u)}</a>`));
    s = s.replace(/<([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/g, (_, u) => put(`<a href="mailto:${esc(u)}">${esc(u)}</a>`));
    s = s.replace(SAFE_TAG, t => put(t.toLowerCase().replace(/\s+/g, '')));
    // links and images
    s = links(s);
    // bare URLs
    s = s.replace(/\bhttps?:\/\/[^\s<>\u0000]+/g, u => {
      let tail = '';
      for (;;) {
        const last = u.slice(-1);
        if (/[.,:;!?'"*_~\]]/.test(last) ||
            (last === ')' && (u.match(/\(/g) || []).length < (u.match(/\)/g) || []).length)) {
          tail = last + tail; u = u.slice(0, -1);
        } else break;
      }
      return put(`<a href="${esc(u)}">${esc(u)}</a>`) + tail;
    });
    s = esc(s);
    // emphasis
    s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>');
    s = s.replace(/(^|[^*])\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\p{L}\p{N}_])_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
    return s;
  }

  // ---------- document ----------

  function frontMatter(md) {
    const m = md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/);
    if (!m) return { html: '', body: md };
    return {
      html: `<details class="front-matter"><summary>Front matter</summary><pre><code>${esc(m[1])}</code></pre></details>`,
      body: md.slice(m[0].length),
    };
  }

  function toHtml(md) {
    refs = {}; slugs = {}; stash = [];
    md = String(md).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const fm = frontMatter(md);
    const lines = [];
    let fence = null;
    for (let line of fm.body.split('\n')) {
      line = line.replace(/^\t+/, t => '    '.repeat(t.length));
      const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (f) {
        if (!fence) fence = f[1];
        else if (f[1][0] === fence[0] && f[1].length >= fence.length && /^ {0,3}(`{3,}|~{3,})[ \t]*$/.test(line)) fence = null;
      } else if (!fence) {
        const d = line.match(REF_DEF);
        if (d && !/^\^/.test(d[1])) {
          const key = normRef(d[1]);
          if (!refs[key]) refs[key] = { url: d[2], title: d[3] || d[4] || d[5] || '' };
          continue;
        }
      }
      lines.push(line);
    }
    return fm.html + parseBlocks(lines, false);
  }

  root.markdownToHtml = toHtml;

  // ---------- page ----------

  if (typeof document === 'undefined') return;

  const post = (name, body) => {
    try { window.webkit.messageHandlers[name].postMessage(body); } catch (e) { /* outside the app */ }
  };

  function scrollToFragment(frag) {
    if (!frag) return false;
    let id = frag;
    try { id = decodeURIComponent(frag); } catch (e) { /* keep raw */ }
    const el = document.getElementById(id) || document.getElementById(id.toLowerCase());
    if (el) { el.scrollIntoView({ block: 'start' }); return true; }
    return false;
  }

  root.render = function (md, fragment) {
    const y = window.scrollY;
    const content = document.getElementById('content');
    content.innerHTML = toHtml(md);
    if (!scrollToFragment(fragment)) window.scrollTo(0, y);
    const h1 = content.querySelector('h1');
    return h1 ? h1.textContent.replace(/^#/, '').trim() : '';
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('button.copy');
    if (btn) {
      const code = btn.parentElement.querySelector('code').textContent;
      post('copy', code);
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

  // find bar
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
    const q = findInput.value;
    if (!q) { findCount.textContent = ''; return; }
    const hay = document.getElementById('content').textContent.toLowerCase();
    let n = 0, k = 0;
    const needle = q.toLowerCase();
    while ((k = hay.indexOf(needle, k)) !== -1) { n++; k += needle.length; }
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
