/* codeweb livemap — the site demonstrating the product on itself.
 *
 * A self-contained, zero-dependency, no-network interactive graph: a real subgraph
 * of the axios codebase (extracted by codeweb), rendered as a living force layout you
 * can interrogate. Click a function and the blast radius — every function transitively
 * affected by an edit — propagates in red. That single interaction IS codeweb_impact.
 *
 * No CDN, no fetch, no build step: the data is inline so the page works straight from
 * disk, exactly like a codeweb report. Honours prefers-reduced-motion. */
(function () {
  'use strict';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // gate reveal-hidden state behind JS so content is never invisible without JS (no-JS / SEO / reduced motion)
  if (!REDUCED) document.documentElement.classList.add('cw-js');

  /* ---- real axios subgraph (70 symbols / 178 edges), extracted by codeweb ---- */
  var DATA = {"domains":["helpers","core","adapters","utils","cancel"],"nodes":[{"l":"merge","f":"utils.js","d":3,"loc":49},{"l":"AxiosError","f":"core/AxiosError.js","d":1,"loc":96},{"l":"AxiosHeaders","f":"core/AxiosHeaders.js","d":1,"loc":248},{"l":"httpAdapter","f":"adapters/http.js","d":2,"loc":896},{"l":"mergeConfig","f":"core/mergeConfig.js","d":1,"loc":143},{"l":"source","f":"cancel/CancelToken.js","d":4,"loc":10},{"l":"resolveConfig","f":"helpers/resolveConfig.js","d":0,"loc":79},{"l":"transformRequest","f":"defaults/index.js","d":0,"loc":63},{"l":"factory","f":"adapters/fetch.js","d":2,"loc":547},{"l":"createInstance","f":"axios.js","d":0,"loc":17},{"l":"CanceledError","f":"cancel/CanceledError.js","d":0,"loc":16},{"l":"onloadend","f":"adapters/xhr.js","d":0,"loc":36},{"l":"Axios","f":"core/Axios.js","d":1,"loc":219},{"l":"<module>","f":"adapters/xhr.js","d":0,"loc":1},{"l":"<module>","f":"utils.js","d":3,"loc":1},{"l":"getAdapter","f":"adapters/adapters.js","d":2,"loc":51},{"l":"setProxy","f":"adapters/http.js","d":2,"loc":164},{"l":"toFormData","f":"helpers/toFormData.js","d":0,"loc":191},{"l":"formDataToJSON","f":"helpers/formDataToJSON.js","d":0,"loc":49},{"l":"assertValidHttpProtocolURL","f":"core/buildFullPath.js","d":1,"loc":9},{"l":"dispatchRequest","f":"core/dispatchRequest.js","d":1,"loc":56},{"l":"buildURL","f":"helpers/buildURL.js","d":0,"loc":39},{"l":"progressEventReducer","f":"helpers/progressEventReducer.js","d":0,"loc":31},{"l":"composeSignals","f":"helpers/composeSignals.js","d":0,"loc":51},{"l":"buildFullPath","f":"core/buildFullPath.js","d":1,"loc":9},{"l":"getMergedValue","f":"core/mergeConfig.js","d":1,"loc":10},{"l":"isBuffer","f":"utils.js","d":3,"loc":10},{"l":"FormDataPart","f":"helpers/formDataToStream.js","d":0,"loc":52},{"l":"transformData","f":"core/transformData.js","d":1,"loc":14},{"l":"estimateDataURLDecodedBytes","f":"helpers/estimateDataURLDecodedBytes.js","d":0,"loc":88},{"l":"toByteStringHeaderObject","f":"helpers/sanitizeHeaderValue.js","d":0,"loc":9},{"l":"shouldBypassProxy","f":"helpers/shouldBypassProxy.js","d":0,"loc":52},{"l":"visit","f":"utils.js","d":3,"loc":29},{"l":"CancelToken","f":"cancel/CancelToken.js","d":4,"loc":122},{"l":"forEach","f":"utils.js","d":3,"loc":1},{"l":"settle","f":"core/settle.js","d":2,"loc":14},{"l":"abort","f":"adapters/http.js","d":2,"loc":10},{"l":"handleTimeout","f":"adapters/http.js","d":2,"loc":4},{"l":"executor","f":"cancel/CancelToken.js","d":4,"loc":9},{"l":"assignValue","f":"utils.js","d":3,"loc":23},{"l":"bind","f":"helpers/bind.js","d":0,"loc":5},{"l":"AxiosTransformStream","f":"helpers/AxiosTransformStream.js","d":2,"loc":147},{"l":"toURLEncodedForm","f":"helpers/toURLEncodedForm.js","d":0,"loc":13},{"l":"createTimeoutError","f":"adapters/http.js","d":2,"loc":16},{"l":"transform","f":"adapters/http.js","d":0,"loc":14},{"l":"maxBodyLengthError","f":"adapters/fetch.js","d":2,"loc":7},{"l":"throwIfMaxDepthExceeded","f":"helpers/toFormData.js","d":0,"loc":8},{"l":"fromDataURI","f":"helpers/fromDataURI.js","d":0,"loc":48},{"l":"throwIfDepthExceeded","f":"helpers/formDataToJSON.js","d":0,"loc":8},{"l":"deleteHeader","f":"core/AxiosHeaders.js","d":1,"loc":13},{"l":"sanitizeHeaderValue","f":"helpers/sanitizeHeaderValue.js","d":1,"loc":2},{"l":"wrapAsync","f":"adapters/http.js","d":2,"loc":24},{"l":"onFinished","f":"adapters/http.js","d":2,"loc":13},{"l":"progressEventDecorator","f":"helpers/progressEventReducer.js","d":2,"loc":13},{"l":"Uri","f":"core/Axios.js","d":1,"loc":5},{"l":"visit","f":"core/AxiosError.js","d":1,"loc":38},{"l":"callbackify","f":"helpers/callbackify.js","d":2,"loc":14},{"l":"write","f":"helpers/cookies.js","d":0,"loc":1},{"l":"trimSPorHTAB","f":"helpers/sanitizeHeaderValue.js","d":0,"loc":26},{"l":"isAxiosError","f":"helpers/isAxiosError.js","d":0,"loc":3},{"l":"InterceptorManager","f":"core/InterceptorManager.js","d":1,"loc":66},{"l":"enforceMaxContentLength","f":"adapters/http.js","d":2,"loc":15},{"l":"onChunkProgress","f":"adapters/fetch.js","d":2,"loc":14},{"l":"<module>","f":"helpers/validator.js","d":0,"loc":1},{"l":"assertOptions","f":"helpers/validator.js","d":1,"loc":27},{"l":"convertValue","f":"helpers/toFormData.js","d":0,"loc":27},{"l":"own","f":"adapters/http.js","d":2,"loc":1},{"l":"buildAddressEntry","f":"adapters/http.js","d":2,"loc":2},{"l":"clearConnectPhaseTimer","f":"adapters/http.js","d":2,"loc":6},{"l":"formDataToStream","f":"helpers/formDataToStream.js","d":0,"loc":50}],"edges":[[14,5],[14,26],[14,0],[39,0],[0,26],[0,5],[0,34],[0,39],[14,34],[14,40],[32,5],[32,26],[32,34],[9,12],[9,40],[9,4],[7,18],[7,42],[7,17],[13,6],[11,35],[13,11],[13,1],[13,37],[13,30],[13,22],[13,10],[16,31],[16,1],[3,51],[3,5],[3,66],[3,56],[3,67],[36,10],[43,66],[43,1],[52,68],[52,36],[3,36],[3,68],[3,52],[3,24],[3,47],[3,29],[3,1],[3,35],[3,2],[3,69],[3,41],[3,53],[3,22],[3,21],[3,30],[3,16],[61,1],[3,61],[37,36],[37,43],[3,37],[3,10],[44,1],[8,1],[8,6],[8,23],[45,1],[8,29],[8,45],[8,53],[8,22],[8,30],[62,1],[8,62],[8,35],[15,1],[41,5],[23,1],[63,1],[64,1],[42,17],[65,1],[46,1],[6,4],[6,21],[6,24],[47,1],[69,27],[48,1],[55,5],[12,60],[54,4],[54,24],[54,21],[2,49],[19,1],[24,19],[25,5],[4,0],[4,25],[35,1],[33,38],[38,10],[5,33],[5,38],[28,44],[10,1],[0,40],[9,0],[9,7],[9,18],[9,10],[9,33],[9,17],[9,1],[9,59],[9,2],[9,15],[7,0],[7,1],[11,22],[11,30],[11,0],[11,1],[11,10],[11,2],[11,6],[3,0],[3,19],[3,27],[3,31],[8,0],[8,2],[15,0],[15,3],[15,11],[15,8],[21,0],[41,0],[56,0],[23,10],[23,0],[57,0],[42,0],[17,0],[17,1],[58,0],[6,0],[6,1],[6,57],[6,19],[6,2],[22,0],[59,0],[27,0],[18,0],[18,1],[1,0],[1,2],[12,0],[12,21],[12,20],[12,4],[12,19],[12,64],[12,2],[2,50],[2,0],[20,28],[20,7],[20,10],[20,2],[20,15],[4,2],[60,0],[33,10],[28,0],[28,7],[28,2]]};

  /* domain palette — drawn from the brand tokens (chartreuse signal + accent family) */
  var DOMC = ['#c6f24e', '#a78bfa', '#4fd6c4', '#f0b35a', '#f778ba'];
  var INK = '#100e14', LINE = 'rgba(120,116,134,.22)', RED = '#ff5d5d', FG = '#ececee', MUTED = '#9c99a6';

  function buildModel() {
    var nodes = DATA.nodes.map(function (n, i) {
      return { i: i, l: n.l, f: n.f, d: n.d, loc: n.loc, deg: 0, x: 0, y: 0, vx: 0, vy: 0 };
    });
    var callers = nodes.map(function () { return []; });   // who calls me  (in-edges)
    var callees = nodes.map(function () { return []; });   // whom I call   (out-edges)
    DATA.edges.forEach(function (e) {
      callees[e[0]].push(e[1]); callers[e[1]].push(e[0]);
      nodes[e[0]].deg++; nodes[e[1]].deg++;
    });
    return { nodes: nodes, edges: DATA.edges, callers: callers, callees: callees };
  }

  // blast radius = every function transitively affected by editing `seed` = its transitive callers.
  function blastRadius(model, seed) {
    var seen = {}, order = [seed], depth = {}; depth[seed] = 0;
    var q = [seed]; seen[seed] = true;
    while (q.length) {
      var x = q.shift();
      model.callers[x].forEach(function (c) {
        if (!seen[c]) { seen[c] = true; depth[c] = depth[x] + 1; order.push(c); q.push(c); }
      });
    }
    return { set: seen, order: order, depth: depth };
  }

  function radius(n) { return 4.2 + Math.min(9, Math.sqrt(n.deg) * 2.1); }

  function LiveMap(canvas, opts) {
    opts = opts || {};
    var model = buildModel();
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, DPR = Math.min(2, window.devicePixelRatio || 1);
    var hover = -1, sel = -1, blast = null, reveal = 1, raf = 0, alpha = 1;
    var interactive = opts.interactive !== false;

    function size() {
      var r = canvas.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function seed() {
      // deterministic ring seeding by domain, so layout is stable across loads
      model.nodes.forEach(function (n, i) {
        var a = (i / model.nodes.length) * Math.PI * 2;
        var rr = 0.30 + 0.16 * ((n.d % 3));
        n.x = W / 2 + Math.cos(a) * W * rr * 0.5;
        n.y = H / 2 + Math.sin(a) * H * rr * 0.6;
      });
    }

    function tick() {
      var ns = model.nodes, n = ns.length, i, j, a, b, dx, dy, d2, d, f;
      var cx = W / 2, cy = H / 2;
      for (i = 0; i < n; i++) {
        a = ns[i];
        for (j = i + 1; j < n; j++) {
          b = ns[j];
          dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy || 0.01;
          if (d2 < 90000) { f = 1400 / d2; a.vx += dx * f * 0.0016; a.vy += dy * f * 0.0016; b.vx -= dx * f * 0.0016; b.vy -= dy * f * 0.0016; }
        }
        a.vx += (cx - a.x) * 0.0009; a.vy += (cy - a.y) * 0.0009;   // gravity to center
      }
      model.edges.forEach(function (e) {
        a = ns[e[0]]; b = ns[e[1]];
        dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (d - 78) * 0.0042;
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
      });
      var pad = 16;
      for (i = 0; i < n; i++) {
        a = ns[i];
        a.vx *= 0.86; a.vy *= 0.86;
        a.x += a.vx * alpha; a.y += a.vy * alpha;
        a.x = Math.max(pad, Math.min(W - pad, a.x)); a.y = Math.max(pad, Math.min(H - pad, a.y));
      }
      if (alpha > 0.04) alpha *= 0.992;   // settle, then hold a low gentle floor
      else alpha = 0.04;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var ns = model.nodes;
      var nbr = {};
      if (hover >= 0) { nbr[hover] = 1; model.callers[hover].forEach(function (c) { nbr[c] = 1; }); model.callees[hover].forEach(function (c) { nbr[c] = 1; }); }
      var revealCut = blast ? Math.ceil(blast.order.length * reveal) : 0;
      var inBlast = function (k) { return blast && blast.set[k] && blast.order.indexOf(k) < revealCut; };

      // edges
      model.edges.forEach(function (e) {
        var a = ns[e[0]], b = ns[e[1]];
        var hot = blast && inBlast(e[0]) && inBlast(e[1]);
        var near = hover >= 0 && (e[0] === hover || e[1] === hover);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        if (hot) { ctx.strokeStyle = 'rgba(255,93,93,.55)'; ctx.lineWidth = 1.4; }
        else if (near) { ctx.strokeStyle = 'rgba(198,242,78,.45)'; ctx.lineWidth = 1.3; }
        else { ctx.strokeStyle = (blast || hover >= 0) ? 'rgba(120,116,134,.10)' : LINE; ctx.lineWidth = 1; }
        ctx.stroke();
      });

      // nodes
      ns.forEach(function (nd, k) {
        var r = radius(nd);
        var hot = inBlast(k), isSel = k === sel, isHov = k === hover, near = nbr[k];
        var dim = (blast && !hot && !isSel) || (hover >= 0 && !near && !isHov);
        ctx.globalAlpha = dim ? 0.22 : 1;
        if (hot || isSel) {
          ctx.beginPath(); ctx.arc(nd.x, nd.y, r + (isSel ? 7 : 4), 0, 7); ctx.fillStyle = 'rgba(255,93,93,.16)'; ctx.fill();
        } else if (isHov) {
          ctx.beginPath(); ctx.arc(nd.x, nd.y, r + 6, 0, 7); ctx.fillStyle = 'rgba(198,242,78,.16)'; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(nd.x, nd.y, r, 0, 7);
        ctx.fillStyle = (hot || isSel) ? RED : DOMC[nd.d];
        ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
        ctx.globalAlpha = 1;

        // labels: hubs always; hovered/selected always; blast seed always
        if ((!dim && nd.deg >= 9) || isHov || isSel) {
          ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = (hot || isSel) ? '#ffd2d0' : (isHov ? '#e7f6bf' : MUTED);
          ctx.textAlign = 'center';
          ctx.fillText(nd.l + '()', nd.x, nd.y - r - 5);
        }
      });
    }

    function frame() {
      if (alpha > 0.05 || !REDUCED) tick();
      if (blast && reveal < 1) reveal = Math.min(1, reveal + 0.045);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function pick(mx, my) {
      var best = -1, bd = 1e9;
      model.nodes.forEach(function (n, k) {
        var dx = n.x - mx, dy = n.y - my, d = dx * dx + dy * dy;
        var rr = radius(n) + 8;
        if (d < rr * rr && d < bd) { bd = d; best = k; }
      });
      return best;
    }

    function select(k) {
      sel = k;
      if (k < 0) { blast = null; if (opts.onSelect) opts.onSelect(null); return; }
      blast = blastRadius(model, k); reveal = REDUCED ? 1 : 0.04;
      var doms = {}; blast.order.forEach(function (id) { doms[model.nodes[id].d] = 1; });
      if (opts.onSelect) opts.onSelect({
        node: model.nodes[k], count: blast.order.length - 1,
        domains: Object.keys(doms).length, domNames: DATA.domains
      });
    }

    if (interactive) {
      canvas.addEventListener('mousemove', function (ev) {
        var r = canvas.getBoundingClientRect();
        hover = pick(ev.clientX - r.left, ev.clientY - r.top);
        canvas.style.cursor = hover >= 0 ? 'pointer' : 'default';
      });
      canvas.addEventListener('mouseleave', function () { hover = -1; });
      canvas.addEventListener('click', function (ev) {
        var r = canvas.getBoundingClientRect();
        var k = pick(ev.clientX - r.left, ev.clientY - r.top);
        select(k === sel ? -1 : k);
      });
    }

    var ro = new ResizeObserver(function () { size(); seed(); alpha = 1; });
    ro.observe(canvas);
    size(); seed();
    if (REDUCED) { for (var s = 0; s < 260; s++) { alpha = 1; tick(); } alpha = 0; draw(); }
    frame();

    return { select: select, model: model, byLabel: function (lbl) { for (var k = 0; k < model.nodes.length; k++) if (model.nodes[k].l === lbl) return k; return -1; } };
  }

  /* ---- agent console: the same graph, queried by an agent over MCP ---- */
  function AgentConsole(el) {
    var SCRIPT = [
      ['q', 'codeweb_find_similar', '"retry with backoff"'],
      ['a', '1 match · helpers/retry.js:withBackoff (0.82) — reuse, don’t reinvent'],
      ['q', 'codeweb_impact', '"utils.js:merge"'],
      ['a', '56 functions in blast radius · 5 domains — review before editing', 'warn'],
      ['q', 'codeweb_callers', '"core/dispatchRequest.js:dispatchRequest"'],
      ['a', '3 callers · Axios.request, request, _request'],
      ['q', 'codeweb_cycles', ''],
      ['a', '0 file cycles — structure is acyclic', 'good']
    ];
    if (REDUCED) {
      el.innerHTML = SCRIPT.map(function (s) {
        return s[0] === 'q'
          ? '<div class="cw-line"><span class="cw-pfx">agent ▸</span> <span class="cw-tool">' + s[1] + '</span>(' + s[2] + ')</div>'
          : '<div class="cw-line cw-' + (s[2] || 'ok') + '"><span class="cw-pfx">codeweb ◂</span> ' + s[1] + '</div>';
      }).join('');
      return;
    }
    var i = 0;
    function emit() {
      var s = SCRIPT[i % SCRIPT.length];
      var line = document.createElement('div');
      if (s[0] === 'q') {
        line.className = 'cw-line';
        line.innerHTML = '<span class="cw-pfx">agent ▸</span> <span class="cw-tool">' + s[1] + '</span>(' + s[2] + ')';
      } else {
        line.className = 'cw-line cw-' + (s[2] || 'ok');
        line.innerHTML = '<span class="cw-pfx">codeweb ◂</span> ' + s[1];
      }
      el.appendChild(line);
      while (el.childNodes.length > 7) el.removeChild(el.firstChild);
      i++;
      setTimeout(emit, s[0] === 'q' ? 700 : 1500);
    }
    emit();
  }

  /* ---- scroll reveals + count-up ---- */
  function reveals() {
    var els = document.querySelectorAll('[data-reveal]');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.18 });
    els.forEach(function (e) { io.observe(e); });
  }

  function init() {
    var hero = document.getElementById('cw-hero-map');
    if (hero) {
      var readout = document.getElementById('cw-readout');
      var map = LiveMap(hero, {
        onSelect: function (info) {
          if (!readout) return;
          if (!info) { readout.className = 'cw-readout'; readout.innerHTML = '<span class="cw-hint">Click any function to trace its blast radius.</span>'; return; }
          readout.className = 'cw-readout hot';
          readout.innerHTML = '<span class="cw-imp">codeweb_impact</span> &middot; editing <b>' + info.node.l + '()</b> in <b>' + info.node.f + '</b> touches <b>' + info.count + ' functions</b> across <b>' + info.domains + ' domains</b>. Review before you write.';
        }
      });
      // wire the "try" chips
      document.querySelectorAll('[data-blast]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var k = map.byLabel(btn.getAttribute('data-blast'));
          if (k >= 0) map.select(k);
        });
      });
    }
    var mini = document.getElementById('cw-mini-map');
    if (mini) LiveMap(mini, { interactive: false });
    var con = document.getElementById('cw-console');
    if (con) AgentConsole(con);
    reveals();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
