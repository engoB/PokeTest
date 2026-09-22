const TCGDEX_BASE = "https://api.tcgdex.net/v2/fr";

let allSets = [];
let universalCards = [];
let currentCards = [];
let activeSetId = 'universal';
let specialFilter = 'all';
let renderLimit = 36;
let inspectedCardId = null;

let userCollection = JSON.parse(localStorage.getItem('pv_collection') || '{}');
let pricesCache = JSON.parse(localStorage.getItem('pv_prices') || '{}');

// Dictionnaire de correspondances phonétiques et sans accents
const ALIASES = {
  'elector': 'electhor',
  'flamigator': 'flamigator',
  'mewtwo': 'mewtwo',
  'tortank': 'tortank',
  'dracaufeu': 'dracaufeu'
};

function cleanStr(s) {
  if (!s) return '';
  let c = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  Object.entries(ALIASES).forEach(([a, t]) => {
    if (c.startsWith(a)) c = c.replace(a, t);
  });
  return c;
}

// Initialisation
async function init() {
  setupEventListeners();
  updatePortfolioHeader();

  try {
    const resSets = await fetch(`${TCGDEX_BASE}/sets`);
    allSets = await resSets.json();
    renderSetsList(allSets);

    const resCards = await fetch(`${TCGDEX_BASE}/cards`);
    universalCards = await resCards.json();
    currentCards = universalCards;
    renderGrid();
  } catch (err) {
    document.getElementById('counter-stats').textContent = "Erreur de connexion aux serveurs TCGdex";
  }
}

function renderSetsList(sets) {
  const container = document.getElementById('sets-list');
  container.innerHTML = sets.map(s => `
    <button onclick="selectSet('${s.id}', '${s.name.replace(/'/g, "\\'")}')" class="w-full text-left p-2 rounded-xl border border-white/5 hover:bg-white/5 flex items-center justify-between text-slate-300">
      <span class="truncate">${s.name}</span>
      <span class="text-[10px] text-slate-500">${s.cardCount?.total || ''}</span>
    </button>
  `).join('');
}

function filterSetsList() {
  const q = cleanStr(document.getElementById('filter-sets-input').value);
  renderSetsList(allSets.filter(s => cleanStr(s.name).includes(q) || cleanStr(s.id).includes(q)));
}

async function selectSet(setId, setName) {
  activeSetId = setId;
  document.getElementById('header-set-label').textContent = setName;
  document.getElementById('sidebar').classList.add('-translate-x-full');
  renderLimit = 36;

  if (setId === 'universal') {
    currentCards = universalCards;
    renderGrid();
    return;
  }

  document.getElementById('counter-stats').textContent = 'Chargement de l’extension...';
  try {
    const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
    const data = await res.json();
    currentCards = data.cards || [];
    renderGrid();
  } catch {
    document.getElementById('counter-stats').textContent = 'Erreur set indisponible';
  }
}

function getFilteredList() {
  const q = cleanStr(document.getElementById('search-input').value);
  const status = document.getElementById('status-select').value;
  const sort = document.getElementById('sort-select').value;

  return currentCards.filter(c => {
    const name = cleanStr(c.name);
    const matchQ = !q || name.includes(q) || name.replace(/th/g, 't').includes(q.replace(/th/g, 't')) || cleanStr(c.id).includes(q) || String(c.localId) === q;
    if (!matchQ) return false;

    const count = userCollection[c.id] || 0;
    if (status === 'owned' && count <= 0) return false;
    if (status === 'missing' && count > 0) return false;

    const p = pricesCache[c.id]?.trend || 0;
    const lowName = (c.name || '').toLowerCase();
    const rarity = (c.rarity || '').toLowerCase();

    switch (specialFilter) {
      case 'ex': return (lowName.includes(' ex') || lowName.includes('-ex') || lowName.endsWith('ex')) && !lowName.includes('m-') && !lowName.includes('méga');
      case 'mega': return lowName.includes('m-') || lowName.includes('méga') || lowName.includes('mega');
      case 'v_vmax': return lowName.includes(' v') || lowName.includes('vmax') || lowName.includes('vstar');
      case 'gx': return lowName.includes(' gx');
      case 'ar_sar': return rarity.includes('illustration') || rarity.includes('ar') || rarity.includes('sar');
      case 'secret': return rarity.includes('secr') || rarity.includes('gold');
      case 'over10': return p >= 10;
      case 'over50': return p >= 50;
      default: return true;
    }
  }).sort((a, b) => {
    const pa = pricesCache[a.id]?.trend || 0;
    const pb = pricesCache[b.id]?.trend || 0;
    if (sort === 'price-desc') return pb - pa;
    if (sort === 'price-asc') return pa - pb;
    if (sort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
    return (parseInt(String(a.localId).replace(/\D/g, ''), 10) || 0) - (parseInt(String(b.localId).replace(/\D/g, ''), 10) || 0);
  });
}

function renderGrid() {
  const list = getFilteredList();
  const displayed = list.slice(0, renderLimit);
  const grid = document.getElementById('cards-grid');

  document.getElementById('counter-stats').textContent = `${list.length} cartes affichées`;
  document.getElementById('load-more-wrap').classList.toggle('hidden', displayed.length >= list.length);

  grid.innerHTML = displayed.map(c => {
    const count = userCollection[c.id] || 0;
    const isOwned = count > 0;
    const price = pricesCache[c.id]?.trend ? `${pricesCache[c.id].trend.toFixed(2)} €` : '—';
    const img = c.image ? `${c.image}/low.webp` : `https://images.pokemontcg.io/${activeSetId}/${c.localId}.png`;

    return `
      <div class="bg-[#131b2e] border ${isOwned ? 'border-emerald-500' : 'border-white/10'} rounded-2xl p-2.5 flex flex-col justify-between gap-2 shadow-lg transition active:scale-[0.98]">
        <div onclick="openInspector('${c.id}')" class="relative aspect-[1/1.4] rounded-xl overflow-hidden bg-black/50 cursor-pointer flex items-center justify-center">
          <img src="${img}" alt="${c.name}" loading="lazy" onerror="this.onerror=null; this.src='${c.image ? c.image.replace('/fr/','/en/') + '/low.webp' : ''}';" class="w-full h-full object-contain">
          <span class="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold ${isOwned ? 'bg-black/85 text-amber-400' : 'bg-black/60 text-slate-300'}">${price}</span>
          ${isOwned ? `<span class="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-emerald-500 text-black font-black text-[10px]">x${count}</span>` : ''}
        </div>
        
        <div class="flex items-center justify-between gap-1">
          <div class="truncate">
            <p class="font-bold text-xs truncate text-white">${c.name}</p>
            <p class="text-[10px] text-slate-400">#${c.localId}</p>
          </div>
          <div class="flex items-center gap-1">
            ${isOwned ? `<button onclick="modCount('${c.id}', -1)" class="w-7 h-7 rounded-lg bg-white/10 text-white font-bold text-xs">-</button>` : ''}
            <button onclick="modCount('${c.id}', 1)" class="w-7 h-7 rounded-lg ${isOwned ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'} font-bold text-xs">+</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Récupération progressive des prix
  fetchMissingPrices(displayed.slice(0, 15));
}

async function fetchMissingPrices(cards) {
  for (const c of cards) {
    if (!pricesCache[c.id]) {
      try {
        const res = await fetch(`${TCGDEX_BASE}/cards/${c.id}`);
        const data = await res.json();
        const cm = data.pricing?.cardmarket || data.cardmarket?.prices || data.cardmarket;
        if (cm && (cm.trendPrice || cm.trend)) {
          pricesCache[c.id] = {
            trend: cm.trendPrice || cm.trend,
            avg30: cm.avg30 || cm.avg,
            low: cm.lowPrice || cm.low
          };
          localStorage.setItem('pv_prices', JSON.stringify(pricesCache));
          updatePortfolioHeader();
        }
      } catch {}
    }
  }
}

function modCount(id, delta) {
  const cur = userCollection[id] || 0;
  const next = cur + delta;
  if (next <= 0) delete userCollection[id];
  else userCollection[id] = next;

  localStorage.setItem('pv_collection', JSON.stringify(userCollection));
  renderGrid();
  updatePortfolioHeader();
}

function updatePortfolioHeader() {
  let total = 0;
  for (const [id, count] of Object.entries(userCollection)) {
    if (pricesCache[id]?.trend) total += pricesCache[id].trend * count;
  }
  document.getElementById('header-portfolio-val').textContent = total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

async function openInspector(id) {
  inspectedCardId = id;
  const modal = document.getElementById('modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('modal-title').textContent = 'Chargement...';

  try {
    const res = await fetch(`${TCGDEX_BASE}/cards/${id}`);
    const card = await res.json();
    
    document.getElementById('modal-title').textContent = card.name;
    document.getElementById('modal-sub').textContent = `${card.set?.name || ''} — #${card.localId}`;
    document.getElementById('modal-rarity').textContent = card.rarity || 'Standard';
    document.getElementById('modal-img').src = card.image ? `${card.image}/high.webp` : '';

    const cm = card.pricing?.cardmarket || card.cardmarket?.prices || card.cardmarket;
    const trend = cm?.trendPrice || cm?.trend || pricesCache[id]?.trend;
    document.getElementById('modal-price-trend').textContent = trend ? `${Number(trend).toFixed(2)} €` : 'N/C';
    document.getElementById('modal-price-avg').textContent = cm?.avg30 ? `${Number(cm.avg30).toFixed(2)} €` : 'N/C';
    document.getElementById('modal-price-low').textContent = cm?.lowPrice ? `${Number(cm.lowPrice).toFixed(2)} €` : 'N/C';
  } catch {
    document.getElementById('modal-title').textContent = 'Fiche indisponible';
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('modal').classList.remove('flex');
}

function setupEventListeners() {
  // Navigation tabs
  document.getElementById('tab-btn-collection').addEventListener('click', () => switchTab('collection'));
  document.getElementById('tab-btn-guide').addEventListener('click', () => switchTab('guide'));

  // Sidebar controls
  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
  });
  document.getElementById('btn-close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('-translate-x-full');
  });
  document.getElementById('btn-universal-set').addEventListener('click', () => {
    selectSet('universal', '🌐 Toutes les cartes');
  });

  // Filtres
  document.getElementById('filter-sets-input').addEventListener('input', filterSetsList);
  document.getElementById('search-input').addEventListener('input', () => {
    renderLimit = 36;
    renderGrid();
  });
  document.getElementById('status-select').addEventListener('change', renderGrid);
  document.getElementById('sort-select').addEventListener('change', renderGrid);

  // Chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      specialFilter = e.target.dataset.filter;
      document.querySelectorAll('.chip-btn').forEach(b => {
        b.className = 'chip-btn px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-white whitespace-nowrap';
      });
      e.target.className = 'chip-btn px-3 py-1.5 rounded-xl bg-indigo-600 text-white whitespace-nowrap';
      renderGrid();
    });
  });

  // Layout zoom
  document.getElementById('zoom-comfort').addEventListener('click', () => setLayout('comfort'));
  document.getElementById('zoom-giant').addEventListener('click', () => setLayout('giant'));
  document.getElementById('zoom-compact').addEventListener('click', () => setLayout('compact'));

  // Pagination
  document.getElementById('btn-load-more').addEventListener('click', () => {
    renderLimit += 36;
    renderGrid();
  });

  // Modale boutons
  document.getElementById('modal-btn-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  document.getElementById('modal-btn-add').addEventListener('click', () => {
    if (inspectedCardId) {
      modCount(inspectedCardId, 1);
      openInspector(inspectedCardId);
    }
  });
  document.getElementById('modal-btn-del').addEventListener('click', () => {
    if (inspectedCardId) {
      modCount(inspectedCardId, -1);
      openInspector(inspectedCardId);
    }
  });
}

function setLayout(mode) {
  const g = document.getElementById('cards-grid');
  ['zoom-comfort', 'zoom-giant', 'zoom-compact'].forEach(id => {
    document.getElementById(id).className = 'px-2 py-1 rounded text-slate-400 hover:text-white font-bold';
  });
  document.getElementById('zoom-' + mode).className = 'px-2 py-1 rounded bg-indigo-600 text-white font-bold';

  if (mode === 'compact') g.className = "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-2.5";
  else if (mode === 'giant') g.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6";
  else g.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4";
}

function switchTab(tab) {
  const isCol = tab === 'collection';
  document.getElementById('cards-view').classList.toggle('hidden', !isCol);
  document.getElementById('controls-section').classList.toggle('hidden', !isCol);
  document.getElementById('guide-view').classList.toggle('hidden', isCol);
  document.getElementById('tab-btn-collection').className = isCol ? 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white' : 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white';
  document.getElementById('tab-btn-guide').className = !isCol ? 'px-3 py-1.5 rounded-lg bg-indigo-600 text-white' : 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white';
}

init();