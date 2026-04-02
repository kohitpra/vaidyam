
// ============================================================
// VAIDYAM — Shopify Storefront API Integration
// Store: website-999-avinash.myshopify.com
// ============================================================

const SHOP = {
  domain: 'website-999-avinash.myshopify.com',
  token: '7f481c5231b99d15b8bb7f73eca4e2e4',
  api: 'https://website-999-avinash.myshopify.com/api/2024-01/graphql.json',
};

// ── GQL helper ────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(SHOP.api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Storefront-Access-Token': SHOP.token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) console.error('GQL errors', json.errors);
  return json.data;
}

// ── Cart state ────────────────────────────────────────────────
let cart = null; // { id, checkoutUrl, totalQuantity, cost, lines }

function saveCart(c) { cart = c; sessionStorage.setItem('vd_cart', JSON.stringify(c)); }
function loadCart() { const s = sessionStorage.getItem('vd_cart'); if (s) cart = JSON.parse(s); }

// ── Queries & Mutations ───────────────────────────────────────
const Q_PRODUCTS = `{
  products(first: 20) {
    edges { node {
      id title descriptionHtml handle availableForSale
      priceRange { minVariantPrice { amount currencyCode } }
      compareAtPriceRange { minVariantPrice { amount } }
      images(first: 5) { edges { node { url altText } } }
      variants(first: 10) { edges { node {
        id title availableForSale
        price { amount currencyCode }
        compareAtPrice { amount }
        image { url }
      } } }
    } }
  }
}`;

const M_CART_CREATE = `
mutation cartCreate($lines: [CartLineInput!]) {
  cartCreate(input: { lines: $lines }) {
    cart { ...CartF }
    userErrors { field message }
  }
}`;

const M_CART_ADD = `
mutation cartAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart { ...CartF }
    userErrors { field message }
  }
}`;

const M_CART_UPDATE = `
mutation cartUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart { ...CartF }
  }
}`;

const M_CART_REMOVE = `
mutation cartRemove($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart { ...CartF }
  }
}`;

const CART_FRAGMENT = `
fragment CartF on Cart {
  id checkoutUrl totalQuantity
  cost { totalAmount { amount currencyCode } }
  lines(first: 20) { edges { node {
    id quantity
    merchandise { ... on ProductVariant {
      id title
      price { amount currencyCode }
      image { url }
      product { title handle }
    } }
  } } }
}`;

function injectFragment(m) { return m + CART_FRAGMENT; }

// ── Cart API ──────────────────────────────────────────────────
async function cartCreate(variantId, qty = 1) {
  const data = await gql(injectFragment(M_CART_CREATE), {
    lines: [{ merchandiseId: variantId, quantity: qty }]
  });
  return data?.cartCreate?.cart;
}
async function cartAdd(variantId, qty = 1) {
  const data = await gql(injectFragment(M_CART_ADD), {
    cartId: cart.id,
    lines: [{ merchandiseId: variantId, quantity: qty }]
  });
  return data?.cartLinesAdd?.cart;
}
async function cartUpdate(lineId, qty) {
  const data = await gql(injectFragment(M_CART_UPDATE), {
    cartId: cart.id,
    lines: [{ id: lineId, quantity: qty }]
  });
  return data?.cartLinesUpdate?.cart;
}
async function cartRemove(lineId) {
  const data = await gql(injectFragment(M_CART_REMOVE), {
    cartId: cart.id,
    lineIds: [lineId]
  });
  return data?.cartLinesRemove?.cart;
}

// ── Add to Cart (main action) ─────────────────────────────────
async function addToCart(variantId, btnEl) {
  if (!variantId) return;
  const orig = btnEl.innerHTML;
  btnEl.innerHTML = '<span class="spinner"></span> Adding...';
  btnEl.disabled = true;
  try {
    let updated;
    if (!cart) {
      updated = await cartCreate(variantId, 1);
    } else {
      updated = await cartAdd(variantId, 1);
    }
    saveCart(updated);
    renderCartDrawer();
    updateCartBubble();
    openCartDrawer();
    btnEl.innerHTML = '✅ Added!';
    setTimeout(() => { btnEl.innerHTML = orig; btnEl.disabled = false; }, 1800);
  } catch (e) {
    btnEl.innerHTML = '⚠️ Error';
    btnEl.disabled = false;
    console.error(e);
  }
}

// ── Cart Bubble ───────────────────────────────────────────────
function updateCartBubble() {
  const qty = cart?.totalQuantity || 0;
  document.querySelectorAll('.cart-bubble').forEach(b => {
    b.textContent = qty;
    b.style.display = qty > 0 ? 'flex' : 'none';
  });
}

// ── Cart Drawer ───────────────────────────────────────────────
function openCartDrawer() { document.getElementById('cartDrawer').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); }
function closeCartDrawer() { document.getElementById('cartDrawer').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); }

function renderCartDrawer() {
  const body = document.getElementById('cartBody');
  const footer = document.getElementById('cartFooter');
  if (!cart || cart.totalQuantity === 0) {
    body.innerHTML = `<div class="cart-empty"><span style="font-size:48px">🌿</span><p style="margin-top:12px;color:var(--t2)">Your cart is empty</p><a href="#product" class="btn-orange" style="margin-top:20px;" onclick="closeCartDrawer()">Shop Now</a></div>`;
    footer.innerHTML = '';
    return;
  }
  const lines = cart.lines.edges.map(e => e.node);
  body.innerHTML = lines.map(line => {
    const v = line.merchandise;
    const img = v.image?.url || '';
    const price = formatPrice(v.price.amount, v.price.currencyCode);
    const total = formatPrice(parseFloat(v.price.amount) * line.quantity, v.price.currencyCode);
    return `
    <div class="cart-item" data-line="${line.id}">
      <div class="cart-item-img" style="${img ? `background-image:url('${img}');background-size:cover;background-position:center;` : 'background:var(--bor);'}"></div>
      <div class="cart-item-info">
        <div class="cart-item-title">${v.product.title}</div>
        <div class="cart-item-variant">${v.title !== 'Default Title' ? v.title : ''}</div>
        <div class="cart-item-price">${price} × ${line.quantity} = <strong>${total}</strong></div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${line.id}', ${line.quantity - 1})">−</button>
          <span class="qty-num">${line.quantity}</span>
          <button class="qty-btn" onclick="changeQty('${line.id}', ${line.quantity + 1})">+</button>
          <button class="remove-btn" onclick="removeLine('${line.id}')">🗑</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const total = formatPrice(cart.cost.totalAmount.amount, cart.cost.totalAmount.currencyCode);
  footer.innerHTML = `
    <div class="cart-total-row"><span>Total</span><strong>${total}</strong></div>
    <a href="${cart.checkoutUrl}" class="btn-orange" style="width:100%;justify-content:center;margin-top:16px;font-size:15px;" id="checkoutBtn">🔒 Checkout Securely</a>
    <p style="font-size:11px;color:var(--tm);text-align:center;margin-top:10px;">🚚 Free delivery above ₹499 · COD Available</p>`;
}

async function changeQty(lineId, newQty) {
  if (newQty < 1) { await removeLine(lineId); return; }
  const updated = await cartUpdate(lineId, newQty);
  saveCart(updated); renderCartDrawer(); updateCartBubble();
}
async function removeLine(lineId) {
  const updated = await cartRemove(lineId);
  saveCart(updated); renderCartDrawer(); updateCartBubble();
}

function formatPrice(amount, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : currency;
  return `${symbol}${parseFloat(amount).toFixed(0)}`;
}

// ── Render Products ───────────────────────────────────────────
function renderProducts(products) {
  const grid = document.getElementById('shopifyProductGrid');
  if (!grid) return;
  if (!products.length) {
    grid.innerHTML = `<p style="color:var(--t2);text-align:center;grid-column:1/-1;">No products found in store.</p>`;
    return;
  }
  grid.innerHTML = products.map(p => {
    const img = p.images.edges[0]?.node.url || '';
    const price = parseFloat(p.priceRange.minVariantPrice.amount);
    const compare = parseFloat(p.compareAtPriceRange.minVariantPrice.amount);
    const curr = p.priceRange.minVariantPrice.currencyCode;
    const varId = p.variants.edges[0]?.node.id || '';
    const hasDisc = compare > 0 && compare > price;
    const disc = hasDisc ? Math.round((1 - price / compare) * 100) : 0;
    const avail = p.availableForSale;
    return `
    <div class="product-card card reveal">
      <div class="product-card-img" style="${img ? `background-image:url('${img}');background-size:contain;background-repeat:no-repeat;background-position:center;background-color:#1a0a05;` : 'background:radial-gradient(circle,#6B3A1F,#1a0a05);'}">
        ${avail ? '<span class="badge-sale">LIVE</span>' : '<span class="badge-sold">SOLD OUT</span>'}
        ${hasDisc ? `<span class="badge-disc">${disc}% OFF</span>` : ''}
      </div>
      <div class="product-card-body">
        <h3 class="product-card-title">${p.title}</h3>
        <p class="product-card-desc">${p.descriptionHtml.replace(/<[^>]+>/g, '').slice(0, 80)}${p.descriptionHtml.length > 80 ? '…' : ''}</p>
        <div class="product-card-price-row">
          <span class="product-price">${formatPrice(price, curr)}</span>
          ${hasDisc ? `<span class="product-compare">${formatPrice(compare, curr)}</span>` : ''}
        </div>
        <div class="product-card-actions">
          <button class="btn-orange" style="flex:1;justify-content:center;" ${!avail ? 'disabled' : ''} onclick="addToCart('${varId}', this)">
            ${avail ? '🛒 Add to Cart' : 'Out of Stock'}
          </button>
          <a href="https://${SHOP.domain}/products/${p.handle}" target="_blank" class="btn-ghost" style="padding:13px 16px;">↗</a>
        </div>
      </div>
    </div>`;
  }).join('');
  // Re-observe new elements for scroll reveal
  document.querySelectorAll('#shopifyProductGrid .reveal').forEach(el => revObs && revObs.observe(el));
}

// ── Inject Cart Drawer HTML ───────────────────────────────────
function injectCartUI() {
  // Overlay
  const overlay = document.createElement('div');
  overlay.id = 'cartOverlay';
  overlay.onclick = closeCartDrawer;
  document.body.appendChild(overlay);

  // Drawer
  const drawer = document.createElement('div');
  drawer.id = 'cartDrawer';
  drawer.innerHTML = `
    <div class="cart-header">
      <h2 class="cart-title">🛒 Your Cart</h2>
      <button class="cart-close" onclick="closeCartDrawer()">✕</button>
    </div>
    <div id="cartBody" class="cart-body"></div>
    <div id="cartFooter" class="cart-footer"></div>`;
  document.body.appendChild(drawer);

  // Cart styles
  const style = document.createElement('style');
  style.textContent = `
  #cartOverlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:1998;display:none;backdrop-filter:blur(4px);}
  #cartOverlay.open{display:block;}
  #cartDrawer{position:fixed;top:0;right:0;width:420px;max-width:100vw;height:100%;background:#1a0a05;border-left:1px solid #2e1508;z-index:1999;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .35s cubic-bezier(.4,0,.2,1);}
  #cartDrawer.open{transform:translateX(0);}
  .cart-header{display:flex;align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid #2e1508;}
  .cart-title{font-family:'Playfair Display',serif;font-size:22px;color:#F5ECD7;}
  .cart-close{background:none;border:none;color:#E8720C;font-size:22px;cursor:pointer;line-height:1;}
  .cart-body{flex:1;overflow-y:auto;padding:20px 24px;}
  .cart-footer{padding:20px 24px;border-top:1px solid #2e1508;}
  .cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;text-align:center;}
  .cart-item{display:flex;gap:14px;padding:16px 0;border-bottom:1px solid #2e1508;}
  .cart-item:last-child{border-bottom:none;}
  .cart-item-img{width:70px;height:70px;border-radius:8px;background:#2e1508;flex-shrink:0;}
  .cart-item-info{flex:1;}
  .cart-item-title{font-weight:700;font-size:14px;color:#F5ECD7;margin-bottom:2px;}
  .cart-item-variant{font-size:11px;color:#6B5040;margin-bottom:4px;}
  .cart-item-price{font-size:13px;color:#A89070;margin-bottom:8px;}
  .cart-item-controls{display:flex;align-items:center;gap:8px;}
  .qty-btn{width:28px;height:28px;border-radius:6px;border:1px solid #2e1508;background:#1f0e07;color:#E8720C;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s;}
  .qty-btn:hover{border-color:#E8720C;background:#2e1508;}
  .qty-num{font-size:14px;color:#F5ECD7;min-width:20px;text-align:center;}
  .remove-btn{background:none;border:none;cursor:pointer;font-size:15px;color:#6B5040;margin-left:4px;transition:.2s;}
  .remove-btn:hover{color:#E8720C;}
  .cart-total-row{display:flex;justify-content:space-between;align-items:center;font-size:16px;color:#F5ECD7;}
  .cart-total-row strong{font-size:20px;color:#E8720C;}
  /* Product section */
  #shopifyProductGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px;}
  .product-card{padding:0;overflow:hidden;display:flex;flex-direction:column;}
  .product-card-img{height:220px;position:relative;display:flex;align-items:flex-start;justify-content:flex-end;flex-direction:row;gap:6px;padding:12px;}
  .badge-sale{background:#E8720C;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;letter-spacing:.5px;}
  .badge-sold{background:#6B5040;color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;}
  .badge-disc{background:#1a3a1a;color:#4CAF50;font-size:10px;font-weight:700;padding:3px 8px;border-radius:4px;}
  .product-card-body{padding:20px;flex:1;display:flex;flex-direction:column;gap:8px;}
  .product-card-title{font-family:'Playfair Display',serif;font-size:18px;color:#F5ECD7;}
  .product-card-desc{font-size:13px;color:#A89070;line-height:1.6;flex:1;}
  .product-card-price-row{display:flex;align-items:center;gap:10px;}
  .product-price{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:700;color:#F5ECD7;}
  .product-compare{font-size:14px;text-decoration:line-through;color:#6B5040;}
  .product-card-actions{display:flex;gap:10px;margin-top:4px;}
  /* Nav cart btn */
  .cart-nav-btn{position:relative;background:none;border:1px solid #2e1508;border-radius:6px;padding:9px 16px;color:#A89070;cursor:pointer;font-family:'Lato',sans-serif;font-size:14px;transition:.2s;display:flex;align-items:center;gap:6px;}
  .cart-nav-btn:hover{border-color:#E8720C;color:#F5ECD7;}
  .cart-bubble{position:absolute;top:-7px;right:-7px;width:18px;height:18px;border-radius:50%;background:#E8720C;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;display:none;}
  .spinner{width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;display:inline-block;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @media(max-width:767px){
    #shopifyProductGrid{grid-template-columns:1fr;}
    #cartDrawer{width:100%;}
  }
  @media(min-width:768px) and (max-width:1023px){
    #shopifyProductGrid{grid-template-columns:repeat(2,1fr);}
  }`;
  document.head.appendChild(style);
}

// ── Inject "Shop" Section into page ──────────────────────────
function injectShopSection() {
  const existing = document.getElementById('shopSection');
  if (existing) return;
  const sec = document.createElement('section');
  sec.id = 'shopSection';
  sec.className = 'section reveal';
  sec.style.background = 'var(--bg2)';
  sec.innerHTML = `
    <div class="container">
      <div style="text-align:center;margin-bottom:16px;">
        <span class="section-label">LIVE STORE</span>
        <h2 class="section-heading">Shop Our <span class="italic-highlight">Sacred</span> Collection</h2>
        <p style="font-size:15px;color:var(--t2);max-width:500px;margin:0 auto;">Real products from our Shopify store — add to cart and checkout securely.</p>
      </div>
      <div id="shopifyProductGrid">
        <div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--t2);">
          <div class="spinner" style="width:32px;height:32px;border-width:3px;margin:0 auto;"></div>
          <p style="margin-top:16px;">Loading products…</p>
        </div>
      </div>
    </div>`;
  // Insert after product section
  const productSec = document.getElementById('product');
  if (productSec && productSec.parentNode) {
    productSec.parentNode.insertBefore(sec, productSec.nextSibling);
  } else {
    document.querySelector('main').appendChild(sec);
  }
}

// ── Patch Navbar ──────────────────────────────────────────────
function patchNavbar() {
  const nav = document.querySelector('.navbar');
  if (!nav) return;
  const buyBtn = nav.querySelector('.btn-orange');
  if (buyBtn) {
    const cartBtn = document.createElement('button');
    cartBtn.className = 'cart-nav-btn';
    cartBtn.innerHTML = `🛒 Cart <span class="cart-bubble">0</span>`;
    cartBtn.onclick = () => { loadCart(); renderCartDrawer(); openCartDrawer(); };
    buyBtn.parentNode.insertBefore(cartBtn, buyBtn);
  }
}

// ── Mount Product Section (replaces static HTML with live Shopify data) ─────
function mountProductSection(product) {
  const loading = document.getElementById('prod-loading');
  const layout = document.getElementById('prod-layout');
  const errEl = document.getElementById('prod-error');

  if (!product) {
    if (loading) loading.style.display = 'none';
    if (errEl) errEl.style.display = 'block';
    return;
  }

  // ── Section title
  const titleEl = document.getElementById('prod-section-title');
  if (titleEl) titleEl.innerHTML = `${product.title} <span class="italic-highlight">Hair Oil</span>`;

  // ── Product image (left column)
  const imgWrap = document.getElementById('prod-img-wrap');
  const imgLabel = document.getElementById('prod-img-label');
  const thumbs = document.getElementById('prod-thumbs');
  const images = product.images.edges.map(e => e.node);

  if (imgWrap) {
    if (images.length > 0) {
      // Show main image
      imgWrap.style.background = 'none';
      imgWrap.style.border = '2px solid #E8720C';
      imgWrap.style.boxShadow = '0 0 60px rgba(232,114,12,.25)';
      imgWrap.innerHTML = `<img src="${images[0].url}" alt="${images[0].altText || product.title}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;

      // Thumbnail strip (if multiple images)
      if (thumbs && images.length > 1) {
        thumbs.innerHTML = images.map((img, i) =>
          `<div onclick="document.querySelector('#prod-img-wrap img').src='${img.url}'" style="width:52px;height:52px;border-radius:8px;border:2px solid ${i === 0 ? '#E8720C' : '#2e1508'};overflow:hidden;cursor:pointer;transition:.2s;flex-shrink:0;background:#1a0a05;">
            <img src="${img.url}" style="width:100%;height:100%;object-fit:cover;"/>
           </div>`
        ).join('');
        // Update thumb active border on click
        thumbs.querySelectorAll('div').forEach((t, i) => {
          t.addEventListener('click', () => {
            thumbs.querySelectorAll('div').forEach(x => x.style.borderColor = '#2e1508');
            t.style.borderColor = '#E8720C';
          });
        });
      }
    } else {
      // Fallback: SVG placeholder
      imgWrap.innerHTML = `<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="#E8720C" stroke-width="1.5"><path d="M12 2C6 2 3 7 3 12s3 7 9 10c6-3 9-5 9-10S18 2 12 2z"/><path d="M12 6c-1 2 .5 5 0 7s-2 3-2 3"/></svg><span style="font-family:'Playfair Display',serif;font-style:italic;font-size:15px;color:#C9A84C;">Sacred Herbs</span>`;
    }
    if (imgLabel) imgLabel.textContent = product.title;
  }

  // ── Description
  const desc = document.getElementById('prod-description');
  if (desc) {
    const plainText = product.descriptionHtml.replace(/<[^>]+>/g, '').trim();
    desc.textContent = plainText ||
      'A potent blend of 54 Ayurvedic herbs cold-pressed into a single bottle. Deeply nourishes your scalp, strengthens roots, and brings back the hair you were born with.';
  }

  // ── Variants as size pills
  const variantsEl = document.getElementById('prod-variants');
  const priceRow = document.getElementById('prod-price-row');
  const atcBtn = document.getElementById('prod-atc-btn');
  const variants = product.variants.edges.map(e => e.node);

  let selectedVariant = variants.find(v => v.availableForSale) || variants[0];

  function updatePrice(variant) {
    if (!priceRow) return;
    const price = parseFloat(variant.price.amount);
    const compare = variant.compareAtPrice ? parseFloat(variant.compareAtPrice.amount) : 0;
    const curr = variant.price.currencyCode;
    const hasDisc = compare > 0 && compare > price;
    const disc = hasDisc ? Math.round((1 - price / compare) * 100) : 0;
    priceRow.innerHTML = `
      <span class="price-main">${formatPrice(price, curr)}</span>
      ${hasDisc ? `<span class="price-old">${formatPrice(compare, curr)}</span><span class="badge-off">${disc}% OFF</span>` : ''}`;
  }

  function selectVariant(variant, allPills) {
    selectedVariant = variant;
    // Update active pill
    allPills.forEach(p => p.classList.remove('active'));
    allPills.find(p => p.dataset.variantId === variant.id)?.classList.add('active');
    // Update price
    updatePrice(variant);
    // Update image if variant has one
    const vImg = variant.image?.url;
    const mainImg = document.querySelector('#prod-img-wrap img');
    if (vImg && mainImg) mainImg.src = vImg;
    // Update ATC button
    if (atcBtn) {
      atcBtn.disabled = !variant.availableForSale;
      atcBtn.innerHTML = variant.availableForSale ? '🛒 ADD TO CART' : '⚠️ Out of Stock';
    }
  }

  if (variantsEl && variants.length > 0) {
    variantsEl.innerHTML = variants.map(v =>
      `<button class="size-pill${v.id === selectedVariant?.id ? ' active' : ''}${!v.availableForSale ? ' sold-out-pill' : ''}" data-variant-id="${v.id}" ${!v.availableForSale ? 'title="Out of Stock"' : ''}>
        ${v.title === 'Default Title' ? product.title.split(' ')[0] : v.title}
        ${!v.availableForSale ? ' <span style="font-size:9px;opacity:.6;">(sold out)</span>' : ''}
       </button>`
    ).join('');

    const pills = [...variantsEl.querySelectorAll('.size-pill')];
    pills.forEach((pill, i) => {
      pill.addEventListener('click', () => selectVariant(variants[i], pills));
    });

    // Init price for selected variant
    updatePrice(selectedVariant);
  }

  // ── Add to Cart button
  if (atcBtn) {
    atcBtn.disabled = !selectedVariant?.availableForSale;
    atcBtn.innerHTML = selectedVariant?.availableForSale ? '🛒 ADD TO CART' : '⚠️ Out of Stock';
    atcBtn.addEventListener('click', () => {
      if (selectedVariant?.availableForSale) addToCart(selectedVariant.id, atcBtn);
    });
  }

  // ── Show layout, hide loader
  if (loading) loading.style.display = 'none';
  if (layout) layout.style.display = 'grid';
}

// ── Boot ──────────────────────────────────────────────────────
window.revObs = null; // will be set by main page's IntersectionObserver

document.addEventListener('DOMContentLoaded', async () => {
  loadCart();
  injectCartUI();
  patchNavbar();
  // injectShopSection(); // Hidden: duplicate product grid not needed
  updateCartBubble();

  // Re-wire reveal observer after shop section is injected
  setTimeout(() => {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    document.querySelectorAll('.reveal:not(.visible)').forEach(el => obs.observe(el));
    window.revObs = obs;
  }, 200);

  // Fetch & render products (shared fetch for both product section + grid)
  try {
    const data = await gql(Q_PRODUCTS);
    const products = data?.products?.edges?.map(e => e.node) || [];

    // 1. Mount the hero product section with the FIRST product
    mountProductSection(products[0] || null);

    // 2. Render full product grid ("Shop Our Sacred Collection" section)
    renderProducts(products);
  } catch (err) {
    console.error('Failed to fetch products', err);
    mountProductSection(null);
    const grid = document.getElementById('shopifyProductGrid');
    if (grid) grid.innerHTML = `<p style="color:var(--t2);text-align:center;grid-column:1/-1;">Unable to load products. Please try again.</p>`;
  }
});
