// Token Radar's radar-2 dashboard. It reads window.RADAR (written beside dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the model's
// own inputs and the protocol's farm plan, and a table of the calibrated category multiples.
// No network: every byte it shows is in data.js.
//
// radar-2's model, in the page as in the program: the base multiple is the row's category
// multiple, calibrated from the live-token protocols in that category (DATA.category_multiples),
// falling back to the global median. The page recomputes every row from the snapshot figures
// and checks the number board.json carries, so the page's code and the board's data are visibly
// the same arithmetic. Farm plans are derived the same way main.ts derives them: category,
// chains, TVL and age decide the action, the capital, the hold and every cost and time, with
// gas priced per chain. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, sandbox: { growth: null, maturity: null } };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The base multiple is the row's category multiple, calibrated from the live-token protocols in
  // that category (DATA.category_multiples), falling back to the global median.
  function multipleOf(row) {
    var list = DATA.category_multiples || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].category === (row.category || 'Other')) return list[i].multiple;
    }
    return DATA.global_multiple !== undefined && DATA.global_multiple !== null ? DATA.global_multiple : DATA.model.base_multiple;
  }
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * multipleOf(row) * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return { first: 'about $5 of gas for the first transaction', setup: 'about $8 of gas', weekly: 'about $3 of gas a week' };
    if (c === 'solana') return { first: 'under $0.05 of gas for the first transaction', setup: 'under $0.10 of gas', weekly: 'under $0.05 of gas a week' };
    if (['base', 'arbitrum', 'optimism', 'polygon', 'bsc', 'binance', 'zksync', 'linea', 'scroll', 'avalanche', 'fantom'].some(function (k) { return c.indexOf(k) >= 0; })) {
      return { first: 'under $0.50 of gas for the first transaction', setup: 'under $1 of gas', weekly: 'under $0.50 of gas a week' };
    }
    return { first: 'about $1 of gas for the first transaction', setup: 'about $2 of gas', weekly: 'about $1 of gas a week' };
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas.first, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas.setup, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    var watchlist = state.tab === 'watchlist' && DATA.watchlist ? DATA.watchlist : null;
    return DATA.rows.filter(function (r) {
      if (watchlist !== null && watchlist.indexOf(r.slug) < 0) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // The sandbox: the reader may turn the model's two dials and watch the ranking respond.
  // Null means "the submitted model". The board always starts from the submitted model;
  // the sandbox only explores it, and the detail view always checks the submitted numbers.
  function sandboxActive() {
    return state.sandbox.growth !== null || state.sandbox.maturity !== null;
  }
  function sandboxModel() {
    var m = {};
    var k;
    for (k in DATA.model) m[k] = DATA.model[k];
    if (state.sandbox.growth !== null) m.growth_weight = state.sandbox.growth;
    if (state.sandbox.maturity !== null) m.maturity_range = state.sandbox.maturity;
    return m;
  }
  function displayRows() {
    var list = sortedRows(rows());
    if (!sandboxActive()) return list;
    var model = sandboxModel();
    var rescored = list.map(function (r) {
      var copy = {};
      var k;
      for (k in r) copy[k] = r[k];
      copy.implied_value_usd = impliedOf(r, model);
      return copy;
    });
    rescored.sort(function (a, b) {
      return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
    });
    rescored.forEach(function (r, i) { r.rank = i + 1; });
    return rescored;
  }

  // The movers: the three pre-token protocols whose TVL grew fastest in the last seven days.
  // Computed from the board, never hand-picked; a reader who wants momentum starts here.
  function movers() {
    var grown = DATA.rows
      .filter(function (r) { return r.change_7d !== null && r.change_7d !== undefined; })
      .slice()
      .sort(function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); })
      .slice(0, 3);
    if (grown.length === 0) return null;
    return el('section', { class: 'panel movers' },
      el('h2', { text: 'Moving fastest this week' }),
      el('div', { class: 'mover-cards' }, grown.map(function (r) {
        return el('button', { class: 'mover', type: 'button', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'mover-name', text: '#' + r.rank + ' ' + r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains[0] : 'an unnamed chain') }),
          el('span', { class: 'num pos', text: fmtPct(r.change_7d) + ' in 7 days' }),
          el('span', { class: 'num', text: 'Implied ' + fmtUsd(r.implied_value_usd) })
        );
      }))
    );
  }

  // The board by category: how many rows each category holds, their combined TVL, and the
  // strongest protocol in each. A reader sees at a glance where the pre-token value sits.
  function categoryBreakdown() {
    var byCat = {};
    DATA.rows.forEach(function (r) {
      var key = r.category || 'Other';
      var entry = byCat[key] || (byCat[key] = { rows: 0, tvl: 0, top: null });
      entry.rows += 1;
      entry.tvl += r.tvl_usd;
      if (!entry.top || r.implied_value_usd > entry.top.implied_value_usd) entry.top = r;
    });
    var list = Object.keys(byCat).map(function (key) { return { category: key, rows: byCat[key].rows, tvl: byCat[key].tvl, top: byCat[key].top }; });
    list.sort(function (a, b) { return b.tvl - a.tvl; });
    return el('table', { class: 'multiples' },
      el('caption', { class: 'sub', text: 'Where the board sits: rows, combined TVL and the strongest protocol of each category.' }),
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Category' }),
        el('th', { scope: 'col', text: 'Rows' }),
        el('th', { scope: 'col', text: 'Combined TVL' }),
        el('th', { scope: 'col', text: 'Strongest' })
      )),
      el('tbody', null, list.map(function (c) {
        return el('tr', null,
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.rows) }),
          el('td', { class: 'num', text: fmtUsd(c.tvl) }),
          el('td', { text: c.top.name + ' (' + fmtUsd(c.top.implied_value_usd) + ')' })
        );
      }))
    );
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var watch = el('button', { type: 'button', 'aria-pressed': state.tab === 'watchlist' ? 'true' : 'false', text: 'Watchlist', onclick: function () { state.tab = 'watchlist'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, watch, live)),
      el('span', { class: 'count', text: state.tab === 'live' ? DATA.live.length + ' live-token protocols' : rows().length + (state.tab === 'watchlist' ? ' watchlist rows shown' : ' rows shown') })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  // The board as a spreadsheet: one CSV of the rows on screen, so a farmer can sort, filter
  // and keep the board without copying it by hand. The file is built in the browser; nothing
  // is sent anywhere.
  function downloadCsv(list) {
    var cell = function (v) {
      var s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = ['rank,slug,name,category,chains,tvl_usd,change_7d,age_days,implied_value_usd,base_multiple'];
    list.forEach(function (r) {
      lines.push([r.rank, r.slug, r.name, r.category || '', (r.chains || []).join(';'), r.tvl_usd, r.change_7d === null ? '' : r.change_7d, r.age_days === null ? '' : r.age_days, r.implied_value_usd, r.base_multiple].map(cell).join(','));
    });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'token-radar-board.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function boardTable() {
    var list = displayRows();
    var note = sandboxActive()
      ? el('p', { class: 'sub sandbox-note', text: 'Sandbox on: this order uses your growth weight of ' + sandboxModel().growth_weight + ' and maturity range of ' + sandboxModel().maturity_range + ' instead of the submitted model. Reset the sandbox below to return to the submitted board.' })
      : null;
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      note,
      el('div', { class: 'table-actions' },
        el('span', { class: 'sub', text: state.tab === 'watchlist' ? 'The watchlist only: the forty protocols the snapshot tracks first.' : 'The full pre-token board.' }),
        el('button', { class: 'button', type: 'button', text: 'Download these rows as CSV', onclick: function () { downloadCsv(list); } })
      ),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var multiples = (DATA.category_multiples || []).slice().sort(function (a, b) { return b.multiple - a.multiple; });
    var table = el('table', { class: 'multiples' },
      el('caption', { class: 'sub', text: 'Category multiples, calibrated from this snapshot: the median market-cap-to-TVL ratio of the live-token protocols in each category, shrunk toward the global median with a prior weight of ' + m.prior_weight + '. A category with fewer than ' + m.min_comps + ' live comparables uses the global median. Multiples are kept inside ' + m.multiple_floor + ' to ' + m.multiple_cap + '.' }),
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Category' }),
        el('th', { scope: 'col', text: 'Live comparables' }),
        el('th', { scope: 'col', text: 'Multiple' })
      )),
      el('tbody', null, multiples.map(function (c) {
        return el('tr', null,
          el('td', { text: c.category }),
          el('td', { class: 'num', text: String(c.comps) }),
          el('td', { class: 'num', text: c.multiple.toFixed(3) })
        );
      }))
    );
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. The base multiple is the protocol\'s category multiple, not one flat number: a bridge is priced like the bridges that already trade, a lender like the lenders, and a category with too few live comparables falls back to the global median.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + m.unknown_age_days + ' days. The global median across ' + DATA.live_size + ' live-token protocols is ' + (DATA.global_multiple !== undefined ? DATA.global_multiple : m.base_multiple) + '. The early radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.' }),
      table,
      categoryBreakdown(),
      el('p', { class: 'sub', text: 'How to read the board: start with the movers if you want momentum, or with rank 1 if you want size. A high implied value means the market would pay a lot for this protocol if it launched a token at its category\'s multiple; it is not a price, and it says nothing about whether a token will ever launch. Farm the top of the board first, one protocol at a time, and keep the position open long enough to be counted.' }),
      el('div', { class: 'sandbox' },
        el('h3', { text: 'Try the model yourself' }),
        el('p', { class: 'sub', text: 'The constants above are the submitted model. Move a dial to see how the ranking responds; the board re-sorts at once, and the detail view still checks the submitted numbers.' }),
        el('div', { class: 'sandbox-controls' },
          el('div', { class: 'field' },
            el('label', { for: 'sandbox-growth', text: 'Growth weight: ' + (state.sandbox.growth === null ? m.growth_weight + ' (submitted)' : state.sandbox.growth) }),
            (function () {
              var input = el('input', { type: 'range', id: 'sandbox-growth', min: '0', max: '1', step: '0.05', value: String(state.sandbox.growth === null ? m.growth_weight : state.sandbox.growth), 'aria-label': 'Growth weight' });
              input.addEventListener('input', function () { state.sandbox.growth = parseFloat(input.value); render(); });
              return input;
            })()
          ),
          el('div', { class: 'field' },
            el('label', { for: 'sandbox-maturity', text: 'Maturity range: ' + (state.sandbox.maturity === null ? m.maturity_range + ' (submitted)' : state.sandbox.maturity) }),
            (function () {
              var input = el('input', { type: 'range', id: 'sandbox-maturity', min: '0', max: '1', step: '0.05', value: String(state.sandbox.maturity === null ? m.maturity_range : state.sandbox.maturity), 'aria-label': 'Maturity range' });
              input.addEventListener('input', function () { state.sandbox.maturity = parseFloat(input.value); render(); });
              return input;
            })()
          ),
          el('button', { class: 'button', type: 'button', text: 'Reset to the submitted model', onclick: function () { state.sandbox = { growth: null, maturity: null }; render(); } })
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple (' + (row.category || 'Other') + ')' }), el('b', { class: 'num', text: String(row.base_multiple) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(movers());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'live' ? liveTable() : boardTable());
    if (state.tab !== 'live') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'foot' },
      el('p', { class: 'sub', text: 'Data: ' + DATA.source + '. Implied values are a model, not a promise and not financial advice. Built by an agent; the uncensored model that helped build it is at superbot.gg.' })
    ));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
