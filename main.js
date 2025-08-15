/* Crested Critters – main site logic (cart compatible, clean build) */

/* =====================
   PRODUCT CATALOG
   ===================== */
const PRODUCTS = [
  {
    slug: "phatom-001",
    name: "Crested Gecko – Phatom",
    category: "geckos",
    morph: "Phantom Lilly White Male",
    price: "Not For Sale",
stock: 1,
    status: "for-sale",
    description: "Hatched 01/05/2024. Great structure and temperament. Current weight ~37g.",
    image: "images/phatom-001.jpg"
  },
  {
  "slug": "Dairy-Cows",
  "name": "Dairy Cows",
  "category": "isopods",
  "morph": "",
  "price": 20,
stock: 10,
  "status": "for-sale",
  "description": "Each Purchase you will receive 20 Dairy Cows. Dairy Cows are great starter isopods. They are prolific breeders, and eat what ever you throw at them.",
  "image": "images/Dairy-Cows.jpg"
},
{
  "slug": "Orange-Panda",
  "name": "Orange Panda",
  "category": "isopods",
  "morph": "",
  "price": 50,
  "status": "for-sale",
  "description": "Count=6  Orange panda's are great isopods fairly active once the colony is established",
  "image": "images/Orange-Panda.jpg"
},
{
  "slug": "SpringTails",
  "name": "SpringTails",
  "category": "isopods",
  "morph": "",
  "price": 10,
  "status": "for-sale",
  "description": "4oz container\nyou will receive a jam packed container of spring-tails sitting on horticulture charcoal. This things will only need to be purchased once if done correctly. They will reproduce quickly as long as you keep a food supply.",
  "image": "images/SpringTails.jpg"
},
{
  "slug": "Food Dish",
  "name": "Food Dish",
  "category": "supplies",
  "morph": "",
  "price": 2,
  "status": "for-sale",
  "description": "A nice little feeding dish to keep your isopod feed in one nice clean spot",
  "image": "images/feeding dish.jpg"
},
{
  "slug": "Leaf-Litter",
  "name": "Oak Leaf Litter",
  "category": "supplies",
  "morph": "",
  "price": 5,
  "status": "for-sale",
  "description": "1 gallon of nice crisp Oak leaves. The leaves are sterilized so no worries of live hitchhikers!",
  "image": "images/Oak Leaves.jpg"
},
{
  "slug": "Vent",
  "name": "Vent",
  "category": "supplies",
  "morph": "",
  "price": 5,
  "status": "for-sale",
  "description": "this is a pair of nice 1.5 inch vent for nice ventilation. This will not come with the mesh and will need to be installed",
  "image": "images/Vent.jpg"
},
{
  "slug": "Substrate",
  "name": "Substrate",
  "category": "supplies",
  "morph": "",
  "price": 15,
  "status": "for-sale",
  "description": "1 gallon of high qualty substrate. The substrate contains a nice topsoil mix, charcoal, small wood rot, and calcium powder",
  "image": "images/substrate.jpg"
}
];

// Expose globally for product page / PayPal modules
window.PRODUCTS = PRODUCTS;

/* =====================
   UTILITIES
   ===================== */
function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function formatPrice(v){
  if(typeof v === 'number') return `$${v.toFixed(2)}`;
  return v; // "Not For Sale" / "Coming Soon"
}
function productUrl(slug){ return `product.html?id=${encodeURIComponent(slug)}`; }

/* =====================
   NAV ACTIVE STATE
   ===================== */
(function setActiveNav(){
  const key = window.CC_ACTIVE;
  if(!key) return;
  const el = document.querySelector(`a[data-nav="${key}"]`);
  if(el) el.classList.add('active');
})();

/* =====================
   CARD TEMPLATE
   ===================== */
function cardHTML(p){
  const showMorph = p.morph && p.morph.trim() !== '';
  const hasPrice = typeof p.price === 'number';
  const flagged = !hasPrice; // Not For Sale / Coming Soon
  return `
    <a class="card" href="${productUrl(p.slug)}" aria-label="${p.name}">
      <div class="image-wrap">
        <img src="${p.image}" alt="${p.name}">
      </div>
      <div class="content">
        <div class="name">${p.name}</div>
        <div class="meta">
          ${showMorph ? `<span class="badge">${p.morph}</span>` : ``}
          ${flagged ? `<span class="flag">${formatPrice(p.price)}</span>` : ``}
          <span class="badge">${p.category}</span>
        </div>
        <div class="price">${hasPrice ? formatPrice(p.price) : ''}</div>
      </div>
    </a>
  `;
}

/* =====================
   GRID RENDER
   ===================== */
function renderGrid(category){
  const root = $('#grid');
  if(!root) return;
  const list = PRODUCTS.filter(p => p.category === category);
  root.innerHTML = list.map(cardHTML).join('');
}

/* =====================
   HOME CAROUSEL
   ===================== */
function buildCarousel(){
  const shell = document.getElementById('homeCarousel'); // wrapper (fixed)
  const track = document.getElementById('homeTrack');    // scrolls
  if(!shell || !track) return;

  // Only numeric-price (in-stock) items on home
  const list = (window.PRODUCTS || []).filter(p => typeof p.price === 'number');

  // Render ONCE (no duplication)
  track.innerHTML = list.map(cardHTML).join('');
  const cards = Array.from(track.querySelectorAll('.card'));
  const GAP = 16; // must match CSS

  // Max 5 visible on wide screens, fewer on smaller widths
  function perView(){
    const w = shell.clientWidth;
    if (w < 520)  return 1;
    if (w < 900)  return 2;
    if (w < 1200) return 3;
    if (w < 1350) return 4;
    return 5; // requires .container max-width ~1500px
  }

  // Assign exact pixel width so cards never shrink
  function layout(){
    const n = perView(shell.clientWidth);
    const totalGaps = GAP * (n - 1);
    const cardW = Math.floor((shell.clientWidth - totalGaps) / n);
    cards.forEach(c => {
      c.style.flex = `0 0 ${cardW}px`;
      c.style.width = `${cardW}px`;
    });
    return cardW;
  }

  let index = 0;
  let CARD_W = layout();

  function maxIndex(){ return Math.max(0, cards.length - perView()); }
  function scrollToIndex(i){
    index = Math.max(0, Math.min(i, maxIndex()));
    track.scrollTo({ left: index * (CARD_W + GAP), behavior: 'smooth' });
  }

  const prevBtn = shell.querySelector('.prev');
  const nextBtn = shell.querySelector('.next');
  if (prevBtn) prevBtn.onclick = () => scrollToIndex(index - 1);
  if (nextBtn) nextBtn.onclick = () => scrollToIndex(index + 1);

  window.addEventListener('resize', () => {
    CARD_W = layout();
    scrollToIndex(index);
  });
}

/* =====================
   PRODUCT PAGE
   ===================== */
function renderProductPage(){
  const root = $('#productRoot');
  if(!root) return;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  const p = PRODUCTS.find(x => x.slug === id) || PRODUCTS[0];

  $('#pImage').src = p.image;
  $('#pImage').alt = p.name;
  $('#pName').textContent = p.name;
  $('#pDesc').textContent = p.description || '';
  const meta = [];
  if(p.morph) meta.push(`<span class="badge">${p.morph}</span>`);
  meta.push(`<span class="badge">${p.category}</span>`);
  if(typeof p.price === 'number') meta.push(`<span class="badge">Price: ${formatPrice(p.price)}</span>`);
  if(typeof p.price !== 'number') meta.push(`<span class="flag">${formatPrice(p.price)}</span>`);
  $('#pMeta').innerHTML = meta.join(' ');
}

/* =====================
   LIVE TOTALS (used by product + cart helpers)
   ===================== */
window.CC_calcTotals = function(p, qty, shipKey){
  qty = Math.max(1, parseInt(qty||'1',10));
  const methods = (window.SHIPPING_METHODS||[]);
  const method = methods.find(m=>m.key===shipKey) || methods[0] || {cost:0,taxable:false,paypalShippingPreference:'NO_SHIPPING'};
  const subtotal = p.price * qty;
  const shipping = Number(method.cost||0);
  const taxBase = subtotal + ((method.taxable && (window.TAX_SHIPPING!==false)) ? shipping : 0);
  const tax = Number(((window.TAX_RATE||0) * taxBase).toFixed(2));
  const total = Number((subtotal + shipping + tax).toFixed(2));
  return {subtotal, shipping, tax, total, method};
};

/* =====================
   BOOT
   ===================== */
document.addEventListener('DOMContentLoaded', () => {
  if(window.CC_ACTIVE === 'home') buildCarousel();
  if(window.CC_ACTIVE === 'geckos') renderGrid('geckos');
  if(window.CC_ACTIVE === 'isopods') renderGrid('isopods');
  if(window.CC_ACTIVE === 'tanks') renderGrid('tanks');
  if(window.CC_ACTIVE === 'supplies') renderGrid('supplies');
  if(window.CC_ACTIVE === 'product') renderProductPage();
});
