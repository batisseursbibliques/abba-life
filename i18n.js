/* ============================================================
   Deux langues : français (par défaut) et anglais.
   - Les textes de l'application sont écrits en français dans le code ; en anglais,
     ils sont remplacés à l'affichage grâce au dictionnaire lang/en.json.
   - Les clés avec {0}, {1}… correspondent à des valeurs insérées (nombres, noms).
   - Les contenus (modules, déclaration…) ont leur version dans content/en/.
   Changer de langue recharge la page : le français revient tel quel.
   ============================================================ */
(function () {
  const LS = "abba_lang";
  let lang = "fr";
  try { lang = localStorage.getItem(LS) === "en" ? "en" : "fr"; } catch (e) {}
  const exact = new Map(), pats = [];
  const state = new WeakMap(); // nœud -> { shown }
  const norm = (s) => String(s).replace(/\s+/g, " ").trim();
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
  const skipEl = (el) => !el || (el.closest && el.closest("[data-no-i18n],.no-i18n,script,style,textarea"));

  function fill(tpl, m) { return tpl.replace(/\{(\d+)\}/g, (_, i) => (m[Number(i) + 1] == null ? "" : tr(m[Number(i) + 1]))); }
  function tr(text) {
    const k = norm(text);
    if (!k) return text;
    if (exact.has(k)) return exact.get(k);
    for (const [re, tpl] of pats) { const m = k.match(re); if (m) return fill(tpl, m); }
    return text;
  }
  function loadDict(d) {
    Object.entries(d).forEach(([k, v]) => {
      if (!v) return;
      if (/\{\d+\}/.test(k)) {
        const re = new RegExp("^" + k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{(\d+)\\?\}/g, "(.+?)") + "$");
        pats.push([re, v, k.length]);
      } else exact.set(norm(k), v);
    });
    pats.sort((a, b) => b[2] - a[2]);
  }

  function translateText(node) {
    const p = node.parentNode;
    if (!p || SKIP.test(p.nodeName) || skipEl(p)) return;
    const st = state.get(node);
    if (st && node.nodeValue === st.shown) return; // déjà traduit par nous
    const v = node.nodeValue;
    if (!/[A-Za-zÀ-ÿ]/.test(v)) return;
    const core = norm(v);
    const out = tr(core);
    if (out === core) { state.delete(node); return; }
    const lead = (v.match(/^\s*/) || [""])[0], trail = (v.match(/\s*$/) || [""])[0];
    const shown = lead + out + trail;
    state.set(node, { shown });
    node.nodeValue = shown;
  }
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function translateAttrs(el) {
    if (!el.getAttribute || (el.closest && el.closest("[data-no-i18n],.no-i18n,script,style"))) return;   // (Life) les placeholders des zones de texte sont traduits aussi
    ATTRS.forEach((a) => {
      const v = el.getAttribute(a);
      if (!v) return;
      const key = "__i18n_" + a;
      if (el[key] === v) return;
      const out = tr(v);
      if (out !== v) { el[key] = out; el.setAttribute(a, out); }
    });
    if (el.tagName === "INPUT" && /^(button|submit)$/.test(el.type) && el.value) { const o = tr(el.value); if (o !== el.value) el.value = o; }
  }
  function walk(root) {
    if (root.nodeType === 3) { translateText(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP.test(root.nodeName)) return;
    translateAttrs(root);
    const tw = document.createTreeWalker(root, 5, null); // texte + éléments
    let n = tw.nextNode();
    while (n) { if (n.nodeType === 3) translateText(n); else translateAttrs(n); n = tw.nextNode(); }
  }

  let queue = [], scheduled = false;
  function flush() {
    scheduled = false;
    const q = queue; queue = [];
    q.forEach((n) => { if (n.isConnected !== false) walk(n); });
  }
  function startObserver() {
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        if (m.type === "childList") m.addedNodes.forEach((n) => queue.push(n));
        else if (m.type === "characterData") queue.push(m.target);
        else if (m.type === "attributes") queue.push(m.target);
      });
      if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function setLang(l) {
    try { localStorage.setItem(LS, l === "en" ? "en" : "fr"); } catch (e) {}
    location.reload();
  }
  function bindSelectors() {
    document.querySelectorAll("[data-lang-select]").forEach((s) => {
      s.value = lang;
      s.addEventListener("change", () => setLang(s.value));
    });
  }

  // alert / confirm / prompt dans la langue choisie
  ["alert", "confirm", "prompt"].forEach((fn) => {
    const o = window[fn].bind(window);
    window[fn] = (m, ...r) => o(lang === "en" ? tr(m) : m, ...r);
  });

  window.I18N = {
    get lang() { return lang; },
    t: (s) => (lang === "en" ? tr(s) : s),
    setLang,
    speechLang: () => (lang === "en" ? "en-US" : "fr-FR"),
    contentDir: () => (lang === "en" ? "content/en/" : "content/"),
    untranslated: () => [], // rempli pour les tests
  };

  document.documentElement.lang = lang;
  if (lang === "en") {
    document.documentElement.classList.add("i18n-wait");
    const done = () => { document.documentElement.classList.remove("i18n-wait"); };
    fetch("lang/en.json").then((r) => r.json()).then((d) => {
      loadDict(d);
      const go = () => { walk(document.body); startObserver(); bindSelectors(); done(); };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
    }).catch(() => { bindSelectors(); done(); });
    setTimeout(done, 2500); // sécurité : ne jamais laisser la page cachée
  } else {
    const go = () => bindSelectors();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
  }
})();
