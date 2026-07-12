/* Adjacency — util.js: tiny DOM + misc helpers */
(function () {
  'use strict';
  const U = {
    el(tag, cls = '', html = '') {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (html) e.innerHTML = html;
      return e;
    },
    btn(label, cls, onClick, title = '') {
      const b = U.el('button', cls, label);
      b.type = 'button';
      if (title) b.title = title;
      if (onClick) b.addEventListener('click', onClick);
      return b;
    },
    field(labelText, inputEl) {
      const w = U.el('label', 'field');
      w.appendChild(U.el('span', 'field-label', labelText));
      w.appendChild(inputEl);
      return w;
    },
    range(min, max, step, value, onInput) {
      const i = U.el('input');
      i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
      if (onInput) i.addEventListener('input', () => onInput(parseFloat(i.value)));
      return i;
    },
    select(options, value, onChange) {
      const s = U.el('select');
      options.forEach(([v, label]) => {
        const o = U.el('option', '', label);
        o.value = v;
        s.appendChild(o);
      });
      s.value = value;
      if (onChange) s.addEventListener('change', () => onChange(s.value));
      return s;
    },
    seg(options, value, onChange, cls = '') {
      const w = U.el('div', 'seg ' + cls);
      const btns = new Map();
      options.forEach(([v, label, title]) => {
        const b = U.btn(label, 'seg-btn', () => { set(v); onChange(v); }, title || '');
        btns.set(v, b);
        w.appendChild(b);
      });
      function set(v) {
        btns.forEach((b, key) => b.classList.toggle('on', key === v));
        w.dataset.value = v;
      }
      set(value);
      w.set = set;
      return w;
    },
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    download(filename, content, mime = 'text/plain') {
      const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    async copy(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch {
        const t = document.createElement('textarea');
        t.value = text; document.body.appendChild(t);
        t.select();
        try { document.execCommand('copy'); } catch {}
        t.remove();
        return true;
      }
    }
  };
  // roundRect polyfill (older Safari)
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }
  window.U = U;
})();
