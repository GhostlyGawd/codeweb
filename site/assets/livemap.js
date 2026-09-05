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
  var DATA = /* CODEWEB_LIVE_DATA */ null;

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
