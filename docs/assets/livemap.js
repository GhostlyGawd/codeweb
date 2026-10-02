/* codeweb livemap — the site demonstrating the product on itself.
 *
 * A self-contained, zero-dependency, no-network interactive graph: a real subgraph
 * of the axios codebase (extracted by codeweb), rendered as a living force layout you
 * can interrogate. Click a function and the blast radius — every function transitively
 * affected within the displayed subset — uses the lime accent. The full report provides the complete mapped graph.
 *
 * No CDN, no fetch, no build step: the data is inline so the page works straight from
 * disk, exactly like a codeweb report. Honours prefers-reduced-motion. */
(function () {
  'use strict';
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // gate reveal-hidden state behind JS so content is never invisible without JS (no-JS / SEO / reduced motion)
  if (!REDUCED) document.documentElement.classList.add('cw-js');

  /* ---- real axios subgraph: injected from the current demo graph by site/build.mjs ---- */
  var DATA = {"domains":["CLI scripts (root)","adapters","core","helpers"],"nodes":[{"id":"adapters/http.js:httpAdapter","l":"httpAdapter","f":"adapters/http.js","d":1,"loc":896},{"id":"core/AxiosError.js:AxiosError","l":"AxiosError","f":"core/AxiosError.js","d":2,"loc":96},{"id":"utils.js:merge","l":"merge","f":"utils.js","d":0,"loc":49},{"id":"utils.js:<module>","l":"<module>","f":"utils.js","d":0,"loc":1},{"id":"adapters/fetch.js:factory","l":"factory","f":"adapters/fetch.js","d":1,"loc":547},{"id":"core/AxiosHeaders.js:AxiosHeaders","l":"AxiosHeaders","f":"core/AxiosHeaders.js","d":2,"loc":248},{"id":"helpers/resolveConfig.js:resolveConfig","l":"resolveConfig","f":"helpers/resolveConfig.js","d":3,"loc":79},{"id":"utils.js:forEach","l":"forEach","f":"utils.js","d":0,"loc":37},{"id":"core/mergeConfig.js:mergeConfig","l":"mergeConfig","f":"core/mergeConfig.js","d":2,"loc":143},{"id":"axios.js:createInstance","l":"createInstance","f":"axios.js","d":3,"loc":17},{"id":"helpers/toFormData.js:toFormData","l":"toFormData","f":"helpers/toFormData.js","d":3,"loc":191},{"id":"adapters/xhr.js:onloadend","l":"onloadend","f":"adapters/xhr.js","d":3,"loc":36},{"id":"defaults/index.js:transformRequest","l":"transformRequest","f":"defaults/index.js","d":0,"loc":63},{"id":"axios.js:<module>","l":"<module>","f":"axios.js","d":3,"loc":1},{"id":"utils.js:isObject","l":"isObject","f":"utils.js","d":0,"loc":1},{"id":"adapters/xhr.js:<module>","l":"<module>","f":"adapters/xhr.js","d":3,"loc":1},{"id":"cancel/CanceledError.js:CanceledError","l":"CanceledError","f":"cancel/CanceledError.js","d":3,"loc":16},{"id":"adapters/adapters.js:getAdapter","l":"getAdapter","f":"adapters/adapters.js","d":1,"loc":51},{"id":"core/Axios.js:Axios","l":"Axios","f":"core/Axios.js","d":2,"loc":219},{"id":"core/dispatchRequest.js:dispatchRequest","l":"dispatchRequest","f":"core/dispatchRequest.js","d":2,"loc":56},{"id":"helpers/toFormData.js:defaultVisitor","l":"defaultVisitor","f":"helpers/toFormData.js","d":3,"loc":45},{"id":"core/AxiosHeaders.js:AxiosHeaders.from","l":"from","f":"core/AxiosHeaders.js","d":2,"loc":3},{"id":"helpers/formDataToJSON.js:formDataToJSON","l":"formDataToJSON","f":"helpers/formDataToJSON.js","d":3,"loc":49},{"id":"platform/index.js:<module>","l":"<module>","f":"platform/index.js","d":3,"loc":1},{"id":"utils.js:findKey","l":"findKey","f":"utils.js","d":2,"loc":17},{"id":"utils.js:isBuffer","l":"isBuffer","f":"utils.js","d":0,"loc":10},{"id":"utils.js:isPlainObject","l":"isPlainObject","f":"utils.js","d":2,"loc":17},{"id":"adapters/http.js:setProxy","l":"setProxy","f":"adapters/http.js","d":1,"loc":164},{"id":"core/buildFullPath.js:buildFullPath","l":"buildFullPath","f":"core/buildFullPath.js","d":2,"loc":9},{"id":"core/mergeConfig.js:getMergedValue","l":"getMergedValue","f":"core/mergeConfig.js","d":2,"loc":10},{"id":"core/transformData.js:transformData","l":"transformData","f":"core/transformData.js","d":2,"loc":14},{"id":"helpers/buildURL.js:buildURL","l":"buildURL","f":"helpers/buildURL.js","d":3,"loc":39},{"id":"helpers/composeSignals.js:composeSignals","l":"composeSignals","f":"helpers/composeSignals.js","d":3,"loc":51},{"id":"helpers/progressEventReducer.js:progressEventReducer","l":"progressEventReducer","f":"helpers/progressEventReducer.js","d":3,"loc":31},{"id":"utils.js:getSafeProp","l":"getSafeProp","f":"utils.js","d":1,"loc":2},{"id":"utils.js:isFormData","l":"isFormData","f":"utils.js","d":1,"loc":14},{"id":"core/AxiosHeaders.js:AxiosHeaders.set","l":"set","f":"core/AxiosHeaders.js","d":2,"loc":55},{"id":"helpers/composeSignals.js:onabort","l":"onabort","f":"helpers/composeSignals.js","d":3,"loc":12},{"id":"helpers/sanitizeHeaderValue.js:toByteStringHeaderObject","l":"toByteStringHeaderObject","f":"helpers/sanitizeHeaderValue.js","d":3,"loc":9},{"id":"adapters/adapters.js:<module>","l":"<module>","f":"adapters/adapters.js","d":1,"loc":1},{"id":"adapters/http.js:<module>","l":"<module>","f":"adapters/http.js","d":1,"loc":1},{"id":"adapters/http.js:abort","l":"abort","f":"adapters/http.js","d":1,"loc":10},{"id":"core/Axios.js:Axios._request","l":"_request","f":"core/Axios.js","d":2,"loc":152},{"id":"core/AxiosError.js:AxiosError.from","l":"from","f":"core/AxiosError.js","d":1,"loc":25},{"id":"core/AxiosError.js:visit","l":"visit","f":"core/AxiosError.js","d":2,"loc":38},{"id":"core/AxiosHeaders.js:normalizeHeader","l":"normalizeHeader","f":"core/AxiosHeaders.js","d":2,"loc":3},{"id":"core/AxiosHeaders.js:setHeader","l":"setHeader","f":"core/AxiosHeaders.js","d":2,"loc":18},{"id":"core/buildFullPath.js:assertValidHttpProtocolURL","l":"assertValidHttpProtocolURL","f":"core/buildFullPath.js","d":2,"loc":9},{"id":"helpers/estimateDataURLDecodedBytes.js:estimateDataURLDecodedBytes","l":"estimateDataURLDecodedBytes","f":"helpers/estimateDataURLDecodedBytes.js","d":3,"loc":88},{"id":"helpers/shouldBypassProxy.js:shouldBypassProxy","l":"shouldBypassProxy","f":"helpers/shouldBypassProxy.js","d":3,"loc":52},{"id":"helpers/toURLEncodedForm.js:toURLEncodedForm","l":"toURLEncodedForm","f":"helpers/toURLEncodedForm.js","d":0,"loc":13},{"id":"utils.js:assignValue","l":"assignValue","f":"utils.js","d":0,"loc":23},{"id":"utils.js:isStream","l":"isStream","f":"utils.js","d":1,"loc":1},{"id":"utils.js:toFiniteNumber","l":"toFiniteNumber","f":"utils.js","d":1,"loc":3},{"id":"adapters/fetch.js:getBodyLength","l":"getBodyLength","f":"adapters/fetch.js","d":1,"loc":29},{"id":"cancel/CancelToken.js:CancelToken","l":"CancelToken","f":"cancel/CancelToken.js","d":3,"loc":122},{"id":"cancel/isCancel.js:isCancel","l":"isCancel","f":"cancel/isCancel.js","d":2,"loc":3},{"id":"core/AxiosHeaders.js:AxiosHeaders.normalize","l":"normalize","f":"core/AxiosHeaders.js","d":2,"loc":26},{"id":"core/AxiosHeaders.js:defineAccessor","l":"defineAccessor","f":"core/AxiosHeaders.js","d":2,"loc":8},{"id":"core/AxiosHeaders.js:deleteHeader","l":"deleteHeader","f":"core/AxiosHeaders.js","d":2,"loc":13},{"id":"core/dispatchRequest.js:onAdapterRejection","l":"onAdapterRejection","f":"core/dispatchRequest.js","d":2,"loc":22},{"id":"core/dispatchRequest.js:throwIfCancellationRequested","l":"throwIfCancellationRequested","f":"core/dispatchRequest.js","d":2,"loc":9},{"id":"core/settle.js:settle","l":"settle","f":"core/settle.js","d":1,"loc":14},{"id":"defaults/index.js:<module>","l":"<module>","f":"defaults/index.js","d":2,"loc":1},{"id":"defaults/transitional.js:<module>","l":"<module>","f":"defaults/transitional.js","d":1,"loc":1},{"id":"helpers/AxiosTransformStream.js:AxiosTransformStream","l":"AxiosTransformStream","f":"helpers/AxiosTransformStream.js","d":3,"loc":147},{"id":"helpers/formDataToJSON.js:buildPath","l":"buildPath","f":"helpers/formDataToJSON.js","d":3,"loc":35},{"id":"helpers/formDataToStream.js:FormDataPart","l":"FormDataPart","f":"helpers/formDataToStream.js","d":3,"loc":52},{"id":"helpers/formDataToStream.js:formDataToStream","l":"formDataToStream","f":"helpers/formDataToStream.js","d":1,"loc":50},{"id":"helpers/fromDataURI.js:fromDataURI","l":"fromDataURI","f":"helpers/fromDataURI.js","d":3,"loc":48}],"edges":[[39,7],[17,1],[39,17],[4,2],[4,1],[4,6],[4,32],[4,34],[4,48],[4,54],[4,52],[4,35],[4,33],[4,38],[4,21],[4,5],[4,53],[4,24],[4,62],[4,43],[27,49],[27,1],[41,16],[0,41],[0,28],[0,48],[0,1],[0,62],[0,69],[0,43],[0,5],[0,21],[0,68],[0,35],[0,52],[0,53],[0,65],[0,33],[0,34],[0,31],[0,38],[0,27],[0,16],[40,27],[15,6],[15,21],[15,5],[11,21],[11,5],[11,62],[15,11],[15,1],[15,7],[15,38],[15,33],[15,16],[9,18],[9,8],[13,9],[13,22],[13,18],[13,16],[13,55],[13,56],[13,10],[13,1],[13,8],[13,5],[13,17],[16,1],[42,8],[42,2],[42,7],[42,5],[44,25],[44,5],[44,26],[43,1],[46,45],[46,24],[36,26],[36,14],[36,46],[59,45],[59,24],[5,59],[57,7],[57,24],[58,45],[47,1],[28,47],[61,16],[19,61],[19,21],[19,5],[19,17],[60,56],[60,61],[60,21],[60,5],[29,26],[29,2],[8,7],[8,29],[62,1],[30,21],[30,5],[30,7],[12,14],[12,35],[12,22],[12,25],[12,52],[12,50],[12,10],[63,7],[31,34],[37,1],[37,16],[32,37],[32,1],[66,14],[22,35],[22,66],[68,35],[68,67],[68,53],[69,1],[6,8],[6,21],[6,5],[6,31],[6,28],[6,34],[6,43],[6,1],[6,35],[38,7],[10,14],[10,20],[50,10],[50,25],[26,14],[52,14],[7,25],[24,25],[51,24],[51,26],[51,2],[2,25],[2,7],[2,51],[3,25],[3,35],[3,14],[3,26],[3,52],[3,7],[3,2],[3,34],[3,53],[3,24],[17,3],[17,40],[17,15],[4,23],[4,3],[0,3],[0,64],[0,23],[0,49],[11,33],[11,38],[11,3],[11,64],[11,1],[11,16],[11,23],[11,6],[9,3],[9,63],[9,22],[9,16],[9,55],[9,56],[9,10],[9,1],[9,5],[9,39],[55,16],[18,3],[18,31],[18,19],[18,8],[18,28],[18,5],[18,64],[1,3],[1,5],[5,3],[19,30],[19,56],[19,63],[19,16],[19,39],[8,3],[8,5],[30,3],[30,63],[12,3],[12,1],[12,64],[12,23],[65,3],[31,3],[32,16],[32,3],[22,3],[22,1],[67,3],[67,23],[69,23],[33,3],[6,23],[6,3],[10,3],[10,1],[50,3],[50,23]]};

  /* terminal-editorial palette — monochrome constellation, chartreuse only for the blast */
  var NODE = '#7c7987', HOT = '#c6f24e', HOTNODE = '#eceaf1',
      LINE = 'rgba(162,159,174,.3)', MUTED = '#8a8794';

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
      // repulsion scales with the canvas area: on a small/narrow canvas (the mobile mini-map)
      // the desktop constant blows nodes into the walls, where the old hard clamp froze them
      // into straight rows along the edges. Tuned so 760×480 keeps the approved hero look.
      var repK = Math.min(2100, Math.max(380, W * H * 0.00575));
      for (i = 0; i < n; i++) {
        a = ns[i];
        for (j = i + 1; j < n; j++) {
          b = ns[j];
          dx = a.x - b.x; dy = a.y - b.y; d2 = dx * dx + dy * dy || 0.01;
          if (d2 < 90000) { f = repK / d2; a.vx += dx * f * 0.0016; a.vy += dy * f * 0.0016; b.vx -= dx * f * 0.0016; b.vy -= dy * f * 0.0016; }
        }
        a.vx += (cx - a.x) * 0.0007; a.vy += (cy - a.y) * 0.0007;   // gravity to center
      }
      model.edges.forEach(function (e) {
        a = ns[e[0]]; b = ns[e[1]];
        dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        f = (d - 96) * 0.0042;
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
      });
      var pad = 20;
      for (i = 0; i < n; i++) {
        a = ns[i];
        a.vx *= 0.86; a.vy *= 0.86;
        a.x += a.vx * alpha; a.y += a.vy * alpha;
        // soft walls — a spring back inside, so the boundary never collects a pinned row
        if (a.x < pad) a.vx += (pad - a.x) * 0.045; else if (a.x > W - pad) a.vx -= (a.x - (W - pad)) * 0.045;
        if (a.y < pad) a.vy += (pad - a.y) * 0.045; else if (a.y > H - pad) a.vy -= (a.y - (H - pad)) * 0.045;
        a.x = Math.max(6, Math.min(W - 6, a.x)); a.y = Math.max(6, Math.min(H - 6, a.y));
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

      // edges — stippled, like the brand's dithered constellation
      model.edges.forEach(function (e) {
        var a = ns[e[0]], b = ns[e[1]];
        var hot = blast && inBlast(e[0]) && inBlast(e[1]);
        var near = hover >= 0 && (e[0] === hover || e[1] === hover);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        if (hot) { ctx.setLineDash([2, 2.6]); ctx.strokeStyle = 'rgba(198,242,78,.8)'; ctx.lineWidth = 1.2; }
        else if (near) { ctx.setLineDash([2, 2.6]); ctx.strokeStyle = 'rgba(198,242,78,.45)'; ctx.lineWidth = 1.1; }
        else { ctx.setLineDash([1, 3]); ctx.strokeStyle = (blast || hover >= 0) ? 'rgba(162,159,174,.14)' : LINE; ctx.lineWidth = 1; }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // nodes — pixel squares
      ns.forEach(function (nd, k) {
        var r = radius(nd), s2 = r * 1.15;
        var hot = inBlast(k), isSel = k === sel, isHov = k === hover, near = nbr[k];
        var dim = (blast && !hot && !isSel) || (hover >= 0 && !near && !isHov);
        ctx.globalAlpha = dim ? 0.22 : 1;
        if (isSel) {
          // HUD crosshair ticks on the selected function
          ctx.strokeStyle = HOT; ctx.lineWidth = 1.4;
          var t = s2 + 9;
          ctx.beginPath();
          ctx.moveTo(nd.x - t, nd.y - t + 6); ctx.lineTo(nd.x - t, nd.y - t); ctx.lineTo(nd.x - t + 6, nd.y - t);
          ctx.moveTo(nd.x + t - 6, nd.y - t); ctx.lineTo(nd.x + t, nd.y - t); ctx.lineTo(nd.x + t, nd.y - t + 6);
          ctx.moveTo(nd.x - t, nd.y + t - 6); ctx.lineTo(nd.x - t, nd.y + t); ctx.lineTo(nd.x - t + 6, nd.y + t);
          ctx.moveTo(nd.x + t - 6, nd.y + t); ctx.lineTo(nd.x + t, nd.y + t); ctx.lineTo(nd.x + t, nd.y + t - 6);
          ctx.stroke();
        } else if (isHov) {
          ctx.fillStyle = 'rgba(198,242,78,.14)';
          ctx.fillRect(nd.x - s2 - 5, nd.y - s2 - 5, (s2 + 5) * 2, (s2 + 5) * 2);
        }
        ctx.fillStyle = isSel ? HOT : (hot ? HOTNODE : NODE);
        ctx.fillRect(nd.x - s2 / 1.4, nd.y - s2 / 1.4, s2 * 1.43, s2 * 1.43);
        ctx.globalAlpha = 1;

        // labels: only where attention is — the hovered or selected function
        if (isHov || isSel) {
          ctx.font = '500 10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
          ctx.fillStyle = isSel ? HOT : (isHov ? '#eceaf1' : MUTED);
          ctx.textAlign = 'center';
          ctx.fillText(nd.l.toUpperCase() + '()', nd.x, nd.y - s2 - 8);
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

    var ro = new ResizeObserver(function () { size(); seed(); warm(); });
    ro.observe(canvas);
    function warm() {
      // never show the seeding ring: settle the layout before first paint
      for (var s = 0; s < 240; s++) { alpha = 1; tick(); }
      alpha = REDUCED ? 0 : 0.04;
    }
    size(); seed(); warm();
    if (REDUCED) draw();
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

  /* ---- tool explorer: phase tabs ---- */
  function toolExplorer() {
    var rail = document.querySelector('.te-rail');
    if (!rail) return;
    var stations = [].slice.call(document.querySelectorAll('.te-station'));
    var panels = [].slice.call(document.querySelectorAll('.te-panel'));
    function activate(idx) {
      stations.forEach(function (s, i) { var on = i === idx; s.classList.toggle('active', on); s.setAttribute('aria-selected', on); });
      panels.forEach(function (p, i) { p.classList.toggle('active', i === idx); });
    }
    stations.forEach(function (s, i) {
      s.addEventListener('click', function () { activate(i); });
      s.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
          ev.preventDefault();
          var next = (i + (ev.key === 'ArrowRight' ? 1 : stations.length - 1)) % stations.length;
          stations[next].focus(); activate(next);
        }
      });
    });
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
          readout.innerHTML = '<span class="cw-imp">codeweb_impact</span> &middot; editing <b>' + info.node.l + '()</b> in <b>' + info.node.f + '</b> touches <b>' + info.count + ' functions within this displayed subset</b> across <b>' + info.domains + ' domains</b>. Review before you write.';
        }
      });
      // wire the "try" chips
      document.querySelectorAll('[data-blast]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var k = map.byLabel(btn.getAttribute('data-blast'));
          if (k >= 0) map.select(k);
        });
      });
      // open with the story told: the biggest hub selected, its blast radius lit
      var k0 = map.byLabel('merge');
      if (k0 >= 0) map.select(k0);
    }
    var mini = document.getElementById('cw-mini-map');
    if (mini) LiveMap(mini, { interactive: false });
    var con = document.getElementById('cw-console');
    if (con) AgentConsole(con);
    toolExplorer();
    reveals();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
