/* updated script.js — Pump.fun behavior (A-F features integrated)
   - Compatible with original HTML or updated HTML/CSS (auto-detects elements)
   - Skeleton loader, mini sparkline, live-dot indicator, trending marquee
   - Keeps Moralis/DexScreener logic + caching
*/

const MORALIS_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjkwM2E2YmNmLTgwNDYtNDAwYS1iMDcwLWM2YzhmN2NkOWJmOCIsIm9yZ0lkIjoiNDgxOTIwIiwidXNlcklkIjoiNDk1NzkzIiwidHlwZUlkIjoiNDU3ZDQ2NTAtNGVkZi00Y2Y2LThmYzAtMjMwMGFmMTFjNjk3IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NjM0MzE2MzUsImV4cCI6NDkxOTE5MTYzNX0.JAJQLalTtpg98JLyJNCpEc9sRLv_-XmdIU2iT8iN3Fk";
const LOCAL_PEPE = "./image/QmeSzchzEPqCU1jwTnsipwcBAeH7S4bmVvFGfF65iA1BY1.png";
const DEXSCREENER_TOKEN = (addr) => `https://api.dexscreener.com/latest/dex/tokens/${addr}`;

// image lazy + cache (keeps original behavior)
const imageCache = new Map();
const imgObserver = new IntersectionObserver((entries)=>{
  entries.forEach(e=>{
    if (!e.isIntersecting) return;
    const img = e.target;
    const src = img.dataset.src;
    if (src) img.src = src;
    imgObserver.unobserve(img);
  });
}, { rootMargin: "300px" });

async function resolveImageUrl(url){
  if (!url || url.includes("null") || url.includes("undefined")) return LOCAL_PEPE;
  if (imageCache.has(url)) return imageCache.get(url);
  return new Promise(resolve=>{
    const img = new Image();
    let done=false;
    img.onload = ()=>{ if(!done){ done=true; imageCache.set(url,url); resolve(url); } };
    img.onerror = ()=>{ if(!done){ done=true; imageCache.set(url,LOCAL_PEPE); resolve(LOCAL_PEPE); } };
    img.src = url;
    setTimeout(()=>{ if(!done){ done=true; imageCache.set(url,LOCAL_PEPE); resolve(LOCAL_PEPE); } }, 1600);
  });
}

// Moralis helper
async function moralisFetch(url){
  try{
    const res = await fetch(url, { headers: { "X-API-Key": MORALIS_API_KEY, Accept: "application/json" }, signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } catch(e){
    console.warn("Moralis error:", e?.message || e, url);
    return null;
  }
}

// Build coin object (keeps original mapping)
function buildCoin(item){
  const mint = item.tokenAddress || item.mint || item.address || item.baseToken?.address || "";
  const fdv = Number(item.fullyDilutedValuation || item.marketCap || 0);
  const priceUsd = Number(item.priceUsd || item.price || 0);
  const liquidity = Number(item.liquidity || item.volume || 0);
  return {
    name: item.name || item.baseToken?.name || "Unknown",
    symbol: item.symbol || item.baseToken?.symbol || (mint?mint.slice(0,6).toUpperCase():"TKN"),
    image: item.logo || item.tokenImageUrl || item.baseToken?.tokenImageUrl || LOCAL_PEPE,
    mint,
    pfp: LOCAL_PEPE,
    username: walletShort(mint),
    mc: fdv,
    change: 0,
    createdAt: item.createdAt || item.graduatedAt || new Date().toISOString(),
    commentCount: 0,
    nsfw: false,
    description: item.description || item.baseToken?.name || "Pump.fun token",
    liquidity,
    priceUsd
  };
}

/* MORALIS CACHING (same as before) */
let MORALIS_CACHE = { ts: 0, data: [] };
async function fetchCombinedCoins(){
  const now = Date.now();
  if (MORALIS_CACHE.data.length && (now - MORALIS_CACHE.ts) < 45_000){
    return MORALIS_CACHE.data;
  }

  const endpoints = [
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/new?limit=50",
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/bonding?limit=50",
    "https://solana-gateway.moralis.io/token/mainnet/exchange/pumpfun/graduated?limit=50"
  ];
  const results = await Promise.allSettled(endpoints.map(url=>moralisFetch(url)));
  const raw = [];
  results.forEach((r,i)=>{
    if (r.status === "fulfilled" && r.value){
      const data = r.value.result || r.value || [];
      data.forEach(it => (it.source = endpoints[i].split("/").pop()));
      raw.push(...data);
    } else {
      console.warn("Endpoint failed:", endpoints[i]);
    }
  });

  const seen = new Set();
  const coins = [];
  for (const it of raw){
    const mint = it.tokenAddress || it.mint || "";
    if (!mint || seen.has(mint)) continue;
    seen.add(mint);
    coins.push(buildCoin(it));
  }

  const out = coins.sort((a,b)=>{
    const t = new Date(b.createdAt) - new Date(a.createdAt);
    return t !== 0 ? t : b.liquidity - a.liquidity;
  });

  MORALIS_CACHE = { ts: Date.now(), data: out };
  return out;
}

// OHLC (same)
async function fetchOHLC(mint){
  if (!mint) return null;
  const data = await moralisFetch(`https://solana-gateway.moralis.io/token/mainnet/ohlcv/${mint}?limit=120`);
  const arr = (data?.result || data || []).map(x => Number(x.close || x.c || 0)).filter(v=>v>0);
  return arr.length > 5 ? arr : null;
}

// DexScreener lookup (same)
async function fetchDexscreenerToken(address){
  try{
    const url = DEXSCREENER_TOKEN(address);
    const res = await fetch(url);
    if (!res.ok) throw new Error("Dexscreener " + res.status);
    const json = await res.json();
    if (json && json.pairs && json.pairs.length){
      const pair = json.pairs[0];
      return {
        baseToken: {
          name: pair.baseToken.name,
          symbol: pair.baseToken.symbol,
          address: pair.baseToken.address,
          tokenImageUrl: pair.baseToken.tokenImageUrl
        },
        liquidity: pair.liquidity?.usd || 0,
        priceUsd: pair.priceUsd || 0
      };
    }
    return null;
  } catch(e){
    console.warn("Dexscreener failed", e);
    return null;
  }
}

/* helpers (same) */
function fmtMC(n){
  if (!n || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function walletShort(addr){ return addr && addr.length>8 ? `${addr.slice(0,4)}…${addr.slice(-4)}` : "—"; }
function timeAgo(date){
  const sec = Math.floor((Date.now() - new Date(date)) / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m`;
  if (sec < 86400) return `${Math.floor(sec/3600)}h`;
  return `${Math.floor(sec/86400)}d`;
}

// improved sparkline draw (handles mini and large)
function drawSparkline(canvas, data){
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  ctx.setTransform(1,0,0,1,0,0); // reset any scaling
  ctx.clearRect(0,0,w,h);
  ctx.scale(2,2);
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const up = data[data.length-1] >= data[0];
  ctx.beginPath();
  data.forEach((v,i)=>{
    const x = (i / (data.length-1)) * (w / 2);
    const y = ((max - v) / range) * (h / 2);
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  });
  ctx.strokeStyle = up ? "#10b981" : "#ff6b6b";
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/* -------------------------
   Flexible DOM mapping
   tries old IDs first, then fallback selectors
   ------------------------- */
const DOM = {
  trending: document.getElementById("trendingRow") || document.querySelector(".trending-row") || null,
  filters: document.getElementById("filtersRow") || document.querySelector(".filter-left") || document.querySelector(".filters") || null,
  cards: document.getElementById("cardArea") || document.getElementById("cardsContainer") || document.getElementById("cardArea") || document.querySelector(".grid-cards") || document.getElementById("cardArea"),
  list: document.getElementById("listArea") || document.querySelector(".list-view"),
  graph: document.getElementById("graphArea") || document.querySelector(".graph-grid"),
  viewBtns: {
    cards: document.getElementById("viewCardsBtn"),
    list: document.getElementById("viewListBtn"),
    graph: document.getElementById("viewGraphBtn")
  },
  searchInput: document.getElementById("searchInput") || document.querySelector('input[placeholder*="Search"]'),
  searchBtn: document.getElementById("searchBtn") || document.querySelector('button[title="Search"], button:contains("Search")'),
  createBtn: document.getElementById("createBtn") || document.querySelector('.green-btn'),
  createModal: document.getElementById("createModal") || document.querySelector('.create-modal'),
  closeCreate: document.getElementById("closeCreate") || document.querySelector('#closeCreate'),
  detailPanel: document.getElementById("detailPanel") || document.querySelector('#detailPanel'),
  closeDetail: document.getElementById("closeDetail") || document.querySelector('#closeDetail')
};

// If some required nodes are missing, warn but continue
if (!DOM.cards) console.warn("cards container not found (cardArea | cardsContainer | .grid-cards). Some UI will not render.");
if (!DOM.viewBtns.cards) console.warn("view buttons (viewCardsBtn) not found — view toggles may not work.");

/* STATE */
const STATE = {
  coins: [],
  pages: [[],[],[],[]],
  tab: 0,
  view: "cards",
  filter: "Latest",
  nsfw: false,
  cache: { prices: new Map(), comments: new Map() }
};
const FILTERS = ["Latest","Trending","Active","Newborn"];

/* ---------- Helper UI small components ---------- */

// skeleton row (used while loading cards)
function renderSkeletonGrid(count=8){
  if (!DOM.cards) return;
  DOM.cards.innerHTML = "";
  for (let i=0;i<count;i++){
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <div style="width:92px;height:92px;border-radius:12px;overflow:hidden" class="skeleton"></div>
        <div style="flex:1">
          <div style="height:16px;width:50%;margin-bottom:8px" class="skeleton"></div>
          <div style="height:12px;width:30%;margin-bottom:8px" class="skeleton"></div>
          <div style="height:8px;width:80%;" class="skeleton"></div>
        </div>
      </div>
    `;
    DOM.cards.appendChild(div);
  }
}

// build trending marquee duplication to create infinite feel
function startTrendingMarquee(){
  if (!DOM.trending) return;
  // if already duplicated, skip
  const wrapper = DOM.trending;
  wrapper.style.display = "flex";
  wrapper.style.gap = "22px";
  // if there are few items, duplicate them for smooth scroll
  const items = Array.from(wrapper.children);
  if (items.length && wrapper.dataset.marquee !== "1"){
    const cloneCount = Math.max(1, Math.ceil(40 / items.length));
    for (let i=0;i<cloneCount;i++){
      items.forEach(it=>{
        const c = it.cloneNode(true);
        wrapper.appendChild(c);
      });
    }
    wrapper.dataset.marquee = "1";
    // CSS-based marquee is preferred; minimal JS needed
  }
}

/* RENDER: trending (keeps original UI but also enables marquee) */
async function renderTrending(coins){
  if (!DOM.trending) return;
  DOM.trending.innerHTML = "";
  const slice = (coins || []).slice(0,18);
  const imgs = await Promise.all(slice.map(c => resolveImageUrl(c.image)));
  slice.forEach((c,i)=>{
    const imgUrl = imgs[i] || LOCAL_PEPE;
    const el = document.createElement("div");
    el.className = "trend-card";
    el.style.minWidth = "220px";
    el.style.display = "flex";
    el.style.gap = "10px";
    el.style.alignItems = "flex-start";
    el.style.cursor = "pointer";
    el.innerHTML = `
      <img data-src="${imgUrl}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='54' height='54'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt="">
      <div>
        <div style="font-weight:900;font-size:15px">${c.name}</div>
        <div style="color:var(--accent);font-weight:800">${fmtMC(c.mc)}</div>
        <div style="color:var(--muted);font-size:13px;margin-top:6px">${c.commentCount||0} replies • ${timeAgo(c.createdAt)}</div>
      </div>`;
    const imgEl = el.querySelector("img");
    if (imgEl) imgObserver.observe(imgEl);
    el.addEventListener("click", ()=> openDetail(c));
    DOM.trending.appendChild(el);
  });
  // start marquee duplication if applicable
  startTrendingMarquee();
}

/* RENDER: cards (grid) with mini sparkline and live-dot */
async function renderCards(page){
  if (!DOM.cards) return;
  DOM.cards.innerHTML = "";
  if (!page || !page.length) return;
  // show skeleton then fill as data arrives
  renderSkeletonGrid(Math.min(8, page.length));

  // preload images concurrently
  const imgs = await Promise.all(page.map(c => resolveImageUrl(c.image)));
  // clear skeletons and render actual cards
  DOM.cards.innerHTML = "";
  for (let i=0;i<page.length;i++){
    const c = page[i];
    const imgUrl = imgs[i] || LOCAL_PEPE;
    const node = document.createElement("div");
    node.className = "card";
    node.innerHTML = `
      <div style="display:flex;gap:12px;align-items:flex-start">
        <div class="card-thumb" style="width:92px;height:92px;border-radius:12px;overflow:hidden;flex-shrink:0">
          <img data-src="${imgUrl}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='92' height='92'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt="">
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
            <div style="max-width:65%">
              <div style="font-weight:900;font-size:16px">${escapeHtml(c.name)}</div>
              <div style="color:var(--muted);font-size:13px;margin-top:6px">${escapeHtml(c.symbol)} • ${escapeHtml((c.description||"").slice(0,80))}${c.description && c.description.length>80 ? "…" : ""}</div>
              <div class="creator-row" style="display:flex;gap:8px;align-items:center;margin-top:10px">
                <img class="creator-avatar" data-src="${c.pfp}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" style="width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.04)">
                <div>
                  <div style="font-size:13px;color:var(--muted)">${escapeHtml(c.username)}</div>
                  <div style="font-size:12px;color:var(--muted)">${timeAgo(c.createdAt)}</div>
                </div>
              </div>
            </div>

            <div style="text-align:right;min-width:110px">
              <div style="font-weight:900">${fmtMC(c.mc)}</div>
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:8px">
                <div class="change-display" style="font-weight:800">${c.change>=0 ? "↑" : "↓"} ${Math.abs(c.change).toFixed(1)}%</div>
                <div class="live-dot" title="Recent movement" style="width:8px;height:8px;border-radius:50%;background:${c.change>=0? "#10b981" : "#ff6b6b"};box-shadow:0 0 8px ${c.change>=0? "#10b981" : "#ff6b6b"}"></div>
              </div>
            </div>
          </div>

          <div style="margin-top:10px">
            <canvas class="mini-spark" style="width:100%;height:44px;border-radius:6px;background:transparent"></canvas>
            <div class="ath-bar" style="margin-top:8px;height:8px;background:#0f0f0f;border-radius:8px;overflow:hidden">
              <div class="ath-fill" style="height:100%; background:linear-gradient(90deg,var(--accent),var(--accent-2)); width:0%; transition:width .4s ease;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    // observe images
    node.querySelectorAll("img").forEach(img=> imgObserver.observe(img));
    // click opens detail
    node.addEventListener("click", ()=> openDetail(c));
    DOM.cards.appendChild(node);

    // fill dynamic values (prices, sparkline, ath) async
    (async ()=>{
      let prices = STATE.cache.prices.get(c.mint);
      if (!prices){
        const fetched = await fetchOHLC(c.mint);
        if (fetched && fetched.length) prices = fetched;
        else prices = Array.from({length:40},(_,ii)=> (c.priceUsd||0.01)*(1+(Math.random()-0.5)*0.1));
        STATE.cache.prices.set(c.mint, prices);
      }
      // compute change & update UI
      const current = prices[prices.length-1] || 0;
      const prev = prices[prices.length-2] || current || 1;
      c.change = prev !== 0 ? ((current - prev)/prev * 100) : 0;
      const changeEl = node.querySelector(".change-display");
      if (changeEl){ changeEl.style.color = c.change>=0 ? "#10b981" : "#ff6b6b"; changeEl.innerText = `${c.change>=0 ? "↑" : "↓"} ${Math.abs(c.change).toFixed(1)}%`; }
      const liveDot = node.querySelector(".live-dot");
      if (liveDot) { liveDot.style.background = c.change>=0 ? "#10b981" : "#ff6b6b"; liveDot.style.boxShadow = `0 0 8px ${c.change>=0 ? "#10b981" : "#ff6b6b"}`; }

      const mini = node.querySelector(".mini-spark");
      if (mini) drawSparkline(mini, prices.slice(-40));
      const ath = Math.max(...prices);
      const fillEl = node.querySelector(".ath-fill");
      if (fillEl){ const pct = ath>0 ? Math.min(100, Math.round((current/ath)*100)) : 0; fillEl.style.width = pct + "%"; }

      if (!STATE.cache.comments.has(c.mint)){
        STATE.cache.comments.set(c.mint, 0);
        c.commentCount = 0;
      } else c.commentCount = STATE.cache.comments.get(c.mint) || 0;
    })();
  }
}

/* RENDER: list (keeps original style, draw sparkline) */
async function renderList(page){
  if (!DOM.list) return;
  DOM.list.innerHTML = "";
  if (!page || !page.length) return;
  for (const c of page){
    const img = await resolveImageUrl(c.image);
    const row = document.createElement("div");
    row.className = "list-row";
    row.innerHTML = `
      <div class="list-thumb"><img data-src="${img}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt=""></div>
      <div class="list-main">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div style="display:flex;flex-direction:column">
            <div style="font-weight:900">${escapeHtml(c.name)} <span style="color:var(--muted);font-weight:700"> ${escapeHtml(c.symbol)}</span></div>
            <div class="list-meta">${escapeHtml(c.description ? c.description.slice(0,120) : "")}</div>
          </div>
          <div class="list-right">
            <div style="font-weight:900">${fmtMC(c.mc)}</div>
            <div style="color:var(--muted);font-size:13px">${timeAgo(c.createdAt)}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <canvas class="spark-canvas" style="width:160px;height:40px;border-radius:6px;background:transparent"></canvas>
        </div>
      </div>
    `;
    row.querySelectorAll("img").forEach(imgEl => imgObserver.observe(imgEl));
    row.addEventListener("click", ()=> openDetail(c));
    DOM.list.appendChild(row);

    (async ()=>{
      let prices = STATE.cache.prices.get(c.mint);
      if (!prices){
        const fetched = await fetchOHLC(c.mint);
        prices = fetched && fetched.length ? fetched : Array.from({length:40},(_,ii)=> (c.priceUsd||0.01)*(1+(Math.random()-0.5)*0.1));
        STATE.cache.prices.set(c.mint, prices);
      }
      const canvas = row.querySelector("canvas");
      if (canvas) drawSparkline(canvas, prices.slice(-40));
      if (!STATE.cache.comments.has(c.mint)){ STATE.cache.comments.set(c.mint, 0); c.commentCount = 0; } else c.commentCount = STATE.cache.comments.get(c.mint)||0;
    })();
  }
}

/* RENDER: graph (larger sparklines) */
async function renderGraph(page){
  if (!DOM.graph) return;
  DOM.graph.innerHTML = "";
  if (!page || !page.length) return;
  for (const c of page){
    const img = await resolveImageUrl(c.image);
    const card = document.createElement("div");
    card.className = "graph-card";
    card.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <img data-src="${img}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" style="width:48px;height:48px;border-radius:8px;object-fit:cover">
        <div>
          <div style="font-weight:900">${escapeHtml(c.name)} <span style="color:var(--muted);font-weight:700">${escapeHtml(c.symbol)}</span></div>
          <div style="color:var(--muted);font-size:13px;margin-top:6px">${fmtMC(c.mc)} • ${timeAgo(c.createdAt)}</div>
        </div>
      </div>
      <div style="margin-top:10px;height:64px"><canvas class="graph-spark" style="width:100%;height:64px"></canvas></div>
    `;
    card.querySelectorAll("img").forEach(i => imgObserver.observe(i));
    DOM.graph.appendChild(card);

    (async ()=>{
      let prices = STATE.cache.prices.get(c.mint);
      if (!prices){
        const fetched = await fetchOHLC(c.mint);
        prices = fetched && fetched.length ? fetched : Array.from({length:40},(_,ii)=> (c.priceUsd||0.01)*(1+(Math.random()-0.5)*0.1));
        STATE.cache.prices.set(c.mint, prices);
      }
      const canvas = card.querySelector(".graph-spark");
      if (canvas) drawSparkline(canvas, prices.slice(-40));
    })();
  }
}

/* APPLY filters & paginate & view */
async function applyFilters(){
  let list = STATE.coins.filter(c => STATE.nsfw || !c.nsfw);
  if (STATE.filter === "Trending") list.sort((a,b)=> b.liquidity - a.liquidity);
  else if (STATE.filter === "Active") list.sort((a,b)=> (b.commentCount||0) - (a.commentCount||0));
  else if (STATE.filter === "Newborn") list.sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  else list.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

  const perPage = Math.ceil(list.length / 4) || list.length || 1;
  STATE.pages = [];
  for (let i=0;i<4;i++) STATE.pages.push(list.slice(i*perPage, (i+1)*perPage));

  // show/hide views (if DOM exists)
  if (DOM.cards) DOM.cards.style.display = STATE.view === "cards" ? "" : "none";
  if (DOM.list) DOM.list.style.display = STATE.view === "list" ? "" : "none";
  if (DOM.graph) DOM.graph.style.display = STATE.view === "graph" ? "" : "none";

  if (STATE.view === "cards") await renderCards(STATE.pages[STATE.tab]||[]);
  else if (STATE.view === "list") await renderList(STATE.pages[STATE.tab]||[]);
  else if (STATE.view === "graph") await renderGraph(STATE.pages[STATE.tab]||[]);

  await renderTrending(STATE.coins);
}

/* DETAIL PANEL open (keeps same behavior) */
function createDetailPanel(){
  const panel = DOM.detailPanel;
  return panel;
}

async function openDetail(coin){
  const panel = createDetailPanel();
  if (!panel) return;
  panel.style.display = "flex";
  panel.querySelector("#detailImg").src = coin.image || LOCAL_PEPE;
  panel.querySelector("#detailName").innerText = coin.name;
  panel.querySelector("#detailSymbol").innerText = coin.symbol;
  panel.querySelector("#detailMC").innerText = fmtMC(coin.mc);
  panel.querySelector("#detailLiquidity").innerText = `Liquidity: ${coin.liquidity||0}`;
  panel.querySelector("#detailMint").innerText = coin.mint || "—";
  panel.querySelector("#detailDesc").innerText = coin.description || "";

  let prices = STATE.cache.prices.get(coin.mint);
  if (!prices){
    const fetched = await fetchOHLC(coin.mint);
    prices = fetched && fetched.length ? fetched : Array.from({length:80},(_,ii)=> (coin.priceUsd||0.01)*(1+(Math.random()-0.5)*0.1));
    STATE.cache.prices.set(coin.mint, prices);
  }
  const canvas = panel.querySelector("#detailSpark");
  if (canvas) drawSparkline(canvas, prices.slice(-80));
}

/* SEARCH helpers */
function isMaybeAddress(q){ if (!q) return false; return /^0x[0-9a-fA-F]{20,64}$/.test(q) || q.length>24; }

async function handleSearch(q){
  if (!q) return;
  if (isMaybeAddress(q)){
    const token = await fetchDexscreenerToken(q);
    if (token){
      const coin = buildCoin(Object.assign({}, token, {
        tokenAddress: token.baseToken.address,
        logo: token.baseToken.tokenImageUrl,
        name: token.baseToken.name,
        symbol: token.baseToken.symbol,
        priceUsd: token.priceUsd,
        liquidity: token.liquidity
      }));
      openDetail(coin);
      return;
    }
  }

  let found = STATE.coins.find(c => (c.mint||"").toLowerCase() === q.toLowerCase() || (c.symbol||"").toLowerCase() === q.toLowerCase() || (c.name||"").toLowerCase() === q.toLowerCase());
  if (!found){
    const fresh = await fetchCombinedCoins();
    STATE.coins = fresh;
    found = STATE.coins.find(c => (c.mint||"").toLowerCase() === q.toLowerCase() || (c.symbol||"").toLowerCase() === q.toLowerCase() || (c.name||"").toLowerCase() === q.toLowerCase());
  }
  if (found) openDetail(found);
  else {
    const panel = createDetailPanel();
    if (!panel) return;
    panel.style.display = "flex";
    panel.querySelector("#detailName").innerText = "Not found";
    panel.querySelector("#detailDesc").innerText = `No token matching "${q}" was found.`;
    panel.querySelector("#detailImg").src = LOCAL_PEPE;
    panel.querySelector("#detailMC").innerText = "";
    panel.querySelector("#detailLiquidity").innerText = "";
    panel.querySelector("#detailMint").innerText = q;
  }
}

/* UI setup - binds to whichever selectors exist */
function setup(){
  // render filter buttons if a container exists (original code expected DOM.filters)
  if (DOM.filters){
    // try to detect if it's older .filters container (buttons with class .filter-btn)
    const isOldFilters = DOM.filters.classList.contains("filters") || DOM.filters.classList.contains("filter-left") || DOM.filters.id === "filtersRow";
    if (isOldFilters){
      const filtersHtml = FILTERS.map(f => `<button class="filter-btn ${f==="Latest"?"active":""}">${f}</button>`).join("");
      DOM.filters.innerHTML = filtersHtml;
      DOM.filters.querySelectorAll(".filter-btn").forEach(btn=>{
        btn.onclick = ()=>{
          DOM.filters.querySelectorAll(".filter-btn").forEach(x=>x.classList.remove("active"));
          btn.classList.add("active");
          STATE.filter = btn.textContent.trim();
          applyFilters();
        };
      });
    } else {
      // fallback: nothing to do
    }
  }

  // NSFW toggle
  const nsfwToggle = document.getElementById("nsfwToggle") || document.querySelector('input[type="checkbox"]');
  if (nsfwToggle) nsfwToggle.onchange = (e)=>{ STATE.nsfw = e.target.checked; applyFilters(); };

  // view toggles (icons)
  Object.entries(DOM.viewBtns).forEach(([key,btn])=>{
    if (!btn) return;
    btn.onclick = ()=>{
      STATE.view = key;
      Object.values(DOM.viewBtns).forEach(b => b && b.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
    };
  });

  // tabs (if present)
  document.querySelectorAll(".tab-btn").forEach((btn,i)=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".tab-btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      STATE.tab = i;
      applyFilters();
    };
  });

  // search
  if (DOM.searchBtn && DOM.searchInput){
    DOM.searchBtn.onclick = async ()=> await handleSearch(DOM.searchInput.value.trim());
    DOM.searchInput.addEventListener("keydown", async (e)=>{ if (e.key === "Enter") await handleSearch(DOM.searchInput.value.trim()); });
  }

  // create modal toggles (if present)
  if (DOM.createBtn && DOM.createModal){
    DOM.createBtn.onclick = ()=>{ DOM.createModal.classList.add("open"); DOM.createModal.style.display = "flex"; DOM.createModal.setAttribute("aria-hidden","false"); document.body.style.overflow = "hidden"; };
    if (DOM.closeCreate) DOM.closeCreate.onclick = ()=>{ DOM.createModal.classList.remove("open"); DOM.createModal.style.display = "none"; DOM.createModal.setAttribute("aria-hidden","true"); document.body.style.overflow = ""; };
    DOM.createModal.onclick = (e)=>{ if (e.target === DOM.createModal){ DOM.createModal.classList.remove("open"); DOM.createModal.style.display = "none"; DOM.createModal.setAttribute("aria-hidden","true"); document.body.style.overflow = ""; } };
  }

  // create form preview + submission (if elements exist)
  const upload = document.getElementById("imageUpload");
  const preview = document.getElementById("createPreview");
  let uploadedData = null;
  if (upload && preview){
    upload.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{ uploadedData = reader.result; preview.src = uploadedData; };
      reader.readAsDataURL(f);
    });
  }

  const submit = document.getElementById("createSubmit") || document.getElementById("goLiveBtn");
  if (submit){
    submit.onclick = ()=>{
      const nameEl = document.getElementById("coinName");
      const symbolEl = document.getElementById("coinSymbol");
      const descEl = document.getElementById("coinDesc");
      const name = nameEl ? nameEl.value.trim() : "Local Token";
      const sym = symbolEl ? symbolEl.value.trim() : "LCL";
      const desc = descEl ? descEl.value.trim() : "";
      const img = uploadedData || (preview ? preview.src : LOCAL_PEPE) || LOCAL_PEPE;
      const newCoin = {
        name, symbol: sym, image: img, mint: "local-"+Date.now(), pfp: img,
        username: walletShort("local-"+Date.now()), mc: 0, change: 0, createdAt: new Date().toISOString(),
        commentCount: 0, nsfw: false, description: desc || "User created (client-only)", liquidity: 0, priceUsd: 0
      };
      STATE.coins.unshift(newCoin);
      if (DOM.createModal){
        DOM.createModal.classList.remove("open");
        DOM.createModal.style.display = "none";
        DOM.createModal.setAttribute("aria-hidden","true");
        document.body.style.overflow = "";
      }
      applyFilters();
    };
  }

  // detail close
  const closeDetail = document.getElementById("closeDetail");
  if (closeDetail) closeDetail.onclick = ()=> { if (DOM.detailPanel) DOM.detailPanel.style.display = "none"; };
  if (DOM.detailPanel) DOM.detailPanel.onclick = (e)=> { if (e.target === DOM.detailPanel) DOM.detailPanel.style.display = "none"; };
}

/* INIT */
(async function init(){
  setup();
  // show skeleton while loading
  if (DOM.cards) renderSkeletonGrid(6);

  console.log("Loading Pump.fun data...");
  STATE.coins = await fetchCombinedCoins();
  console.log("Loaded", STATE.coins.length, "tokens");
  await applyFilters();

  // gentle refresh
  setInterval(async ()=>{
    const fresh = await fetchCombinedCoins();
    // shallow compare
    if (fresh.length !== STATE.coins.length){
      STATE.coins = fresh;
      await applyFilters();
    } else {
      STATE.coins = fresh;
    }
  }, 120_000);
})();

/* -------------------------
   Utility: escape HTML
   protect against accidental injection in name/descriptions
   ------------------------- */
function escapeHtml(str){
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (s)=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" })[s]);
}

