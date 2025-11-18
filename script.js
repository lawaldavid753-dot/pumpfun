/* script.js — Pump.fun style behavior
   - DexScreener search for contract addresses
   - Create coin client-side preview (no backend)
   - Proper grid/list/graph toggles (pump.fun style B)
   - Caching + safer refresh to reduce Moralis CPU usage
*/

const MORALIS_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjkwM2E2YmNmLTgwNDYtNDAwYS1iMDcwLWM2YzhmN2NkOWJmOCIsIm9yZ0lkIjoiNDgxOTIwIiwidXNlcklkIjoiNDk1NzkzIiwidHlwZUlkIjoiNDU3ZDQ2NTAtNGVkZi00Y2Y2LThmYzAtMjMwMGFmMTFjNjk3IiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NjM0MzE2MzUsImV4cCI6NDkxOTE5MTYzNX0.JAJQLalTtpg98JLyJNCpEc9sRLv_-XmdIU2iT8iN3Fk";
const LOCAL_PEPE = "./image/QmeSzchzEPqCU1jwTnsipwcBAeH7S4bmVvFGfF65iA1BY1.png";
const DEXSCREENER_TOKEN = (addr) => `https://api.dexscreener.com/latest/dex/tokens/${addr}`;

// Simple image caching & lazy load
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

// Moralis fetch helper w/ timeout
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

// Build token object uniform shape
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

// Fetch Pump.fun endpoints (Moralis) with caching to reduce CPU
let MORALIS_CACHE = { ts: 0, data: [] };
async function fetchCombinedCoins(){
  const now = Date.now();
  // Use cached for 45s to reduce hitting free CPU too often
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

  // Sort by recency then liquidity
  const out = coins.sort((a,b)=>{
    const t = new Date(b.createdAt) - new Date(a.createdAt);
    return t !== 0 ? t : b.liquidity - a.liquidity;
  });

  MORALIS_CACHE = { ts: Date.now(), data: out };
  return out;
}

// OHLC fetch (Moralis)
async function fetchOHLC(mint){
  if (!mint) return null;
  const data = await moralisFetch(`https://solana-gateway.moralis.io/token/mainnet/ohlcv/${mint}?limit=120`);
  const arr = (data?.result || data || []).map(x => Number(x.close || x.c || 0)).filter(v=>v>0);
  return arr.length > 5 ? arr : null;
}

// DexScreener lookup
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

// small helpers
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
function drawSparkline(canvas, data){
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
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
  ctx.lineWidth = 1.4;
  ctx.stroke();
}

/* DOM references */
const DOM = {
  trending: document.getElementById("trendingRow"),
  filters: document.getElementById("filtersRow"),
  cards: document.getElementById("cardArea"),
  list: document.getElementById("listArea"),
  graph: document.getElementById("graphArea"),
  viewBtns: {
    cards: document.getElementById("viewCardsBtn"),
    list: document.getElementById("viewListBtn"),
    graph: document.getElementById("viewGraphBtn")
  },
  searchInput: document.getElementById("searchInput"),
  searchBtn: document.getElementById("searchBtn"),
  createBtn: document.getElementById("createBtn"),
  createModal: document.getElementById("createModal"),
  closeCreate: document.getElementById("closeCreate"),
  detailPanel: document.getElementById("detailPanel"),
  closeDetail: document.getElementById("closeDetail")
};

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

/* RENDER: trending */
async function renderTrending(coins){
  DOM.trending.innerHTML = "";
  const slice = (coins || []).slice(0,18);
  const imgs = await Promise.all(slice.map(c => resolveImageUrl(c.image)));
  slice.forEach((c,i)=>{
    const imgUrl = imgs[i] || LOCAL_PEPE;
    const el = document.createElement("div");
    el.className = "trend-card";
    el.innerHTML = `
      <img data-src="${imgUrl}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='54' height='54'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt="">
      <div>
        <div class="trend-title">${c.name}</div>
        <div style="color:var(--accent);font-weight:800">${fmtMC(c.mc)}</div>
        <div class="trend-small">${c.commentCount||0} replies • ${timeAgo(c.createdAt)}</div>
      </div>`;
    const imgEl = el.querySelector("img");
    if (imgEl) imgObserver.observe(imgEl);
    el.addEventListener("click", ()=> openDetail(c));
    DOM.trending.appendChild(el);
  });
}

/* RENDER: cards (grid) */
async function renderCards(page){
  DOM.cards.innerHTML = "";
  if (!page || !page.length) return;
  const imgs = await Promise.all(page.map(c => resolveImageUrl(c.image)));
  for (let i=0;i<page.length;i++){
    const c = page[i];
    const imgUrl = imgs[i] || LOCAL_PEPE;
    const node = document.createElement("div");
    node.className = "card";
    node.innerHTML = `
      <div class="card-thumb"><img data-src="${imgUrl}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='92' height='92'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt=""></div>
      <div class="card-body">
        <div style="display:flex;justify-content:space-between;gap:12px">
          <div>
            <div class="card-title">${c.name}</div>
            <div class="card-sub">${c.symbol} • ${c.description ? c.description.slice(0,80) : ""}${c.description && c.description.length>80 ? "…" : ""}</div>
            <div class="creator-row" style="margin-top:10px">
              <img class="creator-avatar" data-src="${c.pfp}" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26'%3E%3Crect width='100%' height='100%' fill='%230f1113'/%3E%3C/svg%3E" alt="">
              <div>
                <div style="font-size:13px;color:var(--muted)">${c.username}</div>
                <div style="font-size:12px;color:var(--muted)">${timeAgo(c.createdAt)}</div>
              </div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="mc">${fmtMC(c.mc)}</div>
            <div class="change-display" style="margin-top:8px;color:${c.change>=0? "#10b981" : "#ff6b6b"};font-weight:800">
              ${c.change>=0 ? "↑" : "↓"} ${Math.abs(c.change).toFixed(1)}%
            </div>
          </div>
        </div>
        <div class="ath-bar"><div class="ath-fill" style="width:0%"></div></div>
      </div>
    `;
    node.querySelectorAll("img").forEach(img=> imgObserver.observe(img));
    node.addEventListener("click", ()=> openDetail(c));
    DOM.cards.appendChild(node);

    // async fetch prices + comments
    (async ()=>{
      let prices = STATE.cache.prices.get(c.mint);
      if (!prices){
        const fetched = await fetchOHLC(c.mint);
        if (fetched && fetched.length) prices = fetched;
        else prices = Array.from({length:40},(_,ii)=> (c.priceUsd||0.01)*(1+(Math.random()-0.5)*0.1));
        STATE.cache.prices.set(c.mint, prices);
      }
      const current = prices[prices.length-1] || 0;
      const prev = prices[prices.length-2] || current || 1;
      c.change = prev !== 0 ? ((current - prev)/prev * 100) : 0;
      const changeEl = node.querySelector(".change-display");
      if (changeEl){ changeEl.style.color = c.change>=0 ? "#10b981" : "#ff6b6b"; changeEl.innerText = `${c.change>=0 ? "↑" : "↓"} ${Math.abs(c.change).toFixed(1)}%`; }
      const ath = Math.max(...prices);
      const fillEl = node.querySelector(".ath-fill");
      if (fillEl){ const pct = ath>0 ? Math.min(100, Math.round((current/ath)*100)) : 0; fillEl.style.width = pct + "%"; }
      if (!STATE.cache.comments.has(c.mint)){
        // cheap comment fallback (shyft RPC might be heavy)
        STATE.cache.comments.set(c.mint, 0);
        c.commentCount = 0;
      } else c.commentCount = STATE.cache.comments.get(c.mint) || 0;
    })();
  }
}

/* RENDER: list */
async function renderList(page){
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
            <div style="font-weight:900">${c.name} <span style="color:var(--muted);font-weight:700"> ${c.symbol}</span></div>
            <div class="list-meta">${c.description ? c.description.slice(0,120) : ""}</div>
          </div>
          <div class="list-right">
            <div style="font-weight:900">${fmtMC(c.mc)}</div>
            <div style="color:var(--muted);font-size:13px">${timeAgo(c.createdAt)}</div>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px">
          <canvas class="spark-canvas" style="width:160px;height:40px;border-radius:6px;background:#000"></canvas>
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

/* RENDER: graph grid (bigger graphs for overview) */
async function renderGraph(page){
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
          <div style="font-weight:900">${c.name} <span style="color:var(--muted);font-weight:700">${c.symbol}</span></div>
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

/* APPLY filters & pagination & view */
async function applyFilters(){
  let list = STATE.coins.filter(c => STATE.nsfw || !c.nsfw);
  if (STATE.filter === "Trending") list.sort((a,b)=> b.liquidity - a.liquidity);
  else if (STATE.filter === "Active") list.sort((a,b)=> (b.commentCount||0) - (a.commentCount||0));
  else if (STATE.filter === "Newborn") list.sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
  else list.sort((a,b)=> new Date(b.createdAt) - new Date(a.createdAt));

  const perPage = Math.ceil(list.length / 4) || list.length || 1;
  STATE.pages = [];
  for (let i=0;i<4;i++) STATE.pages.push(list.slice(i*perPage, (i+1)*perPage));

  DOM.cards.style.display = STATE.view === "cards" ? "grid" : "none";
  DOM.list.style.display = STATE.view === "list" ? "flex" : "none";
  DOM.graph.style.display = STATE.view === "graph" ? "grid" : "none";

  if (STATE.view === "cards") await renderCards(STATE.pages[STATE.tab]||[]);
  else if (STATE.view === "list") await renderList(STATE.pages[STATE.tab]||[]);
  else if (STATE.view === "graph") await renderGraph(STATE.pages[STATE.tab]||[]);

  await renderTrending(STATE.coins);
}

/* DETAIL PANEL creation & open */
function createDetailPanel(){
  const panel = DOM.detailPanel;
  return panel;
}

async function openDetail(coin){
  const panel = createDetailPanel();
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

/* SEARCH logic: DexScreener first if looks like address */
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

  let found = STATE.coins.find(c => c.mint.toLowerCase() === q.toLowerCase() || c.symbol.toLowerCase() === q.toLowerCase() || c.name.toLowerCase() === q.toLowerCase());
  if (!found){
    const fresh = await fetchCombinedCoins();
    STATE.coins = fresh;
    found = STATE.coins.find(c => c.mint.toLowerCase() === q.toLowerCase() || c.symbol.toLowerCase() === q.toLowerCase() || c.name.toLowerCase() === q.toLowerCase());
  }
  if (found) openDetail(found);
  else {
    const panel = createDetailPanel();
    panel.style.display = "flex";
    panel.querySelector("#detailName").innerText = "Not found";
    panel.querySelector("#detailDesc").innerText = `No token matching "${q}" was found.`;
    panel.querySelector("#detailImg").src = LOCAL_PEPE;
    panel.querySelector("#detailMC").innerText = "";
    panel.querySelector("#detailLiquidity").innerText = "";
    panel.querySelector("#detailMint").innerText = q;
  }
}

/* UI setup */
function setup(){
  // filters
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

  // NSFW toggle
  const nsfwToggle = document.getElementById("nsfwToggle");
  if (nsfwToggle) nsfwToggle.onchange = (e)=>{ STATE.nsfw = e.target.checked; applyFilters(); };

  // view toggles
  Object.entries(DOM.viewBtns).forEach(([key,btn])=>{
    if (!btn) return;
    btn.onclick = ()=>{
      STATE.view = key;
      Object.values(DOM.viewBtns).forEach(b => b && b.classList.remove("active"));
      btn.classList.add("active");
      applyFilters();
    };
  });

  // tabs
  document.querySelectorAll(".tab-btn").forEach((btn,i)=>{
    btn.onclick = ()=>{
      document.querySelectorAll(".tab-btn").forEach(x=>x.classList.remove("active"));
      btn.classList.add("active");
      STATE.tab = i;
      applyFilters();
    };
  });

  // search
  DOM.searchBtn.onclick = async ()=> await handleSearch(DOM.searchInput.value.trim());
  DOM.searchInput.addEventListener("keydown", async (e)=>{ if (e.key === "Enter") await handleSearch(DOM.searchInput.value.trim()); });

  // modal create
  if (DOM.createBtn) DOM.createBtn.onclick = ()=>{ DOM.createModal.classList.add("open"); DOM.createModal.style.display = "flex"; DOM.createModal.setAttribute("aria-hidden","false"); document.body.style.overflow = "hidden"; };
  if (DOM.closeCreate) DOM.closeCreate.onclick = ()=>{ DOM.createModal.classList.remove("open"); DOM.createModal.style.display = "none"; DOM.createModal.setAttribute("aria-hidden","true"); document.body.style.overflow = ""; };
  DOM.createModal.onclick = (e)=>{ if (e.target === DOM.createModal){ DOM.createModal.classList.remove("open"); DOM.createModal.style.display = "none"; DOM.createModal.setAttribute("aria-hidden","true"); document.body.style.overflow = ""; } };

  // create image preview
  const upload = document.getElementById("imageUpload");
  const preview = document.getElementById("createPreview");
  let uploadedData = null;
  if (upload){
    upload.addEventListener("change", (e)=>{
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{ uploadedData = reader.result; preview.src = uploadedData; };
      reader.readAsDataURL(f);
    });
  }

  // create submit
  const submit = document.getElementById("createSubmit");
  if (submit) submit.onclick = ()=>{
    const name = document.getElementById("coinName").value.trim() || "Local Token";
    const sym = document.getElementById("coinSymbol").value.trim() || "LCL";
    const desc = document.getElementById("coinDesc") ? document.getElementById("coinDesc").value.trim() : "";
    const img = uploadedData || preview.src || LOCAL_PEPE;
    const newCoin = {
      name, symbol: sym, image: img, mint: "local-"+Date.now(), pfp: img,
      username: walletShort("local-"+Date.now()), mc: 0, change: 0, createdAt: new Date().toISOString(),
      commentCount: 0, nsfw: false, description: desc || "User created (client-only)", liquidity: 0, priceUsd: 0
    };
    STATE.coins.unshift(newCoin);
    DOM.createModal.classList.remove("open"); DOM.createModal.style.display = "none"; DOM.createModal.setAttribute("aria-hidden","true"); document.body.style.overflow = "";
    applyFilters();
  };

  // close detail
  const closeDetail = document.getElementById("closeDetail");
  if (closeDetail) closeDetail.onclick = ()=> { DOM.detailPanel.style.display = "none"; };
  DOM.detailPanel.onclick = (e)=> { if (e.target === DOM.detailPanel) DOM.detailPanel.style.display = "none"; };
}

/* INIT */
(async function init(){
  setup();
  console.log("Loading Pump.fun data...");
  STATE.coins = await fetchCombinedCoins();
  console.log("Loaded", STATE.coins.length, "tokens");
  await applyFilters();

  // Refresh policy - gentle to Moralis free CPU
  setInterval(async ()=>{
    const fresh = await fetchCombinedCoins();
    // naive shallow compare length to reduce heavy re-renders
    if (fresh.length !== STATE.coins.length){
      STATE.coins = fresh;
      await applyFilters();
    } else {
      // update cached array only (still avoid re-render)
      STATE.coins = fresh;
    }
  }, 120_000); // refresh every 2 minutes
})();



