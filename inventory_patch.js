
/*! Crested Critters — Inventory Patch (stock-aware cart limits)
    Usage:
      1) Add `stock: <number>` to each product in your PRODUCTS array in js/main.js.
         Example: { slug:"phatom-001", name:"...", price:600, category:"geckos", stock: 3, ... }
      2) Include this file AFTER js/main.js on every page (product.html, cart.html, index.html, etc):
         <script src="js/inventory_patch.js"></script>
*/

(function(){
  function ready(fn){ document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  function getStock(slug){
    try{
      const p = (window.PRODUCTS||[]).find(x=>x.slug===slug);
      const s = Number(p && p.stock);
      return Number.isFinite(s) && s>=0 ? s : Infinity; // if not set, treat as unlimited
    }catch(e){ return Infinity; }
  }

  function getCart(){ try{ return JSON.parse(localStorage.getItem('CC_CART')||'[]'); }catch(e){ return []; } }
  function saveCart(items){ localStorage.setItem('CC_CART', JSON.stringify(items)); if(window.CC_CART && CC_CART.updateBadge) CC_CART.updateBadge(); }

  // Wrap CC_CART.add and CC_CART.setQty to enforce stock
  ready(function(){
    if(!window.CC_CART){ return; }

    const origAdd = CC_CART.add;
    const origSetQty = CC_CART.setQty;

    CC_CART.add = function(item){
      // item: {slug, quantity, ...}
      const stock = getStock(item.slug);
      if(stock <= 0){ alert('Sorry, this item is currently out of stock.'); return; }

      const cart = getCart();
      const idx = cart.findIndex(x=>x.slug===item.slug);
      const inCart = idx>=0 ? Number(cart[idx].quantity||1) : 0;
      const reqQty = Math.max(1, Number(item.quantity||1));
      const allowedAdd = Math.max(0, stock - inCart);

      if(allowedAdd <= 0){
        alert('You already have the maximum available stock for this item in your cart.');
        return;
      }
      const addQty = Math.min(reqQty, allowedAdd);

      if(idx>=0){
        cart[idx].quantity = inCart + addQty;
      }else{
        item.quantity = addQty;
        cart.push(item);
      }
      saveCart(cart);

      if(addQty < reqQty){
        alert('Some quantity was reduced to match available stock.');
      }
    };

    CC_CART.setQty = function(slug, qty){
      const stock = getStock(slug);
      const cart = getCart();
      const i = cart.findIndex(x=>x.slug===slug);
      if(i>=0){
        const newQty = Math.max(1, Math.min(Number(qty||1), stock===Infinity?999:stock));
        cart[i].quantity = newQty;
        saveCart(cart);
      }
    };
  });

  // Product page: set max on #qty and disable Add to Cart if stock is 0
  ready(function(){
    if(window.CC_ACTIVE !== 'product'){ return; }
    try{
      const id = new URLSearchParams(location.search).get('id');
      const s = getStock(id);
      const qty = document.getElementById('qty');
      const btn = document.getElementById('addCartBtn');
      if(qty && Number.isFinite(s) && s>0){
        qty.setAttribute('max', String(s));
        // If user types higher, we'll clamp at add-time too
      }
      if(btn && (s===0)){
        btn.disabled = true;
        btn.textContent = 'Out of Stock';
      }
    }catch(e){}
  });

  // Cart page: annotate inputs with "(max X in stock)" and clamp on input
  ready(function(){
    if(window.CC_ACTIVE !== 'cart'){ return; }
    try{
      // run once after cart renders (small delay to allow initial render)
      setTimeout(function annotate(){
        const inputs = document.querySelectorAll('.qty-input[data-slug]');
        inputs.forEach(function(inp){
          const slug = inp.getAttribute('data-slug');
          const s = getStock(slug);
          if(Number.isFinite(s)){
            inp.setAttribute('max', String(s));
            // add helper note if not present
            if(!inp._note){
              const note = document.createElement('div');
              note.className = 'small';
              note.style.opacity = '0.8';
              note.style.marginTop = '2px';
              note.textContent = '(max ' + s + ' in stock)';
              inp.parentElement && inp.parentElement.appendChild(note);
              inp._note = note;
            }else{
              inp._note.textContent = '(max ' + s + ' in stock)';
            }
          }
          // clamp on user edits (extra safety; CC_CART.setQty also clamps)
          inp.addEventListener('input', function(){
            const v = Math.max(1, parseInt(inp.value||'1',10));
            const maxv = Number.isFinite(s) ? s : 999;
            if(v>maxv){ inp.value = maxv; }
          });
        });
      }, 50);
    }catch(e){}
  });

})();
