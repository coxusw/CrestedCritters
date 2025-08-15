// Hardened Add-to-Cart (product page)
(function(){
  var RETRIES = 20; // ~2s total
  function ready(fn){ document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  function tryWire(){
    if(window.CC_ACTIVE !== 'product'){ return; }
    var btn = document.getElementById('addCartBtn');
    var qty = document.getElementById('qty');
    if(!btn){ console.warn('[CC] addCartBtn not found'); return; }
    if(!window.CC_CART || !window.CC_CART.add || !Array.isArray(window.PRODUCTS)){
      if(RETRIES-->0){ return setTimeout(tryWire, 100); }
      console.error('[CC] Cart or products not ready; cannot wire Add to Cart.');
      return;
    }
    var id = new URLSearchParams(location.search).get('id');
    var p = window.PRODUCTS.find(function(x){ return x.slug===id; }) || window.PRODUCTS[0];
    if(!p){ console.error('[CC] Product not found for slug', id); return; }
    if(typeof p.price !== 'number'){ console.warn('[CC] Product is not for sale (non-numeric price).'); return; }

    if(!btn._wired){
      btn._wired = true;
      btn.disabled = false;
      btn.addEventListener('click', function(){
        var q = Math.max(1, parseInt(qty && qty.value || '1', 10));
        window.CC_CART.add({ slug:p.slug, name:p.name, price:p.price, image:p.image, category:p.category, quantity:q });
        location.href = 'cart.html';
      });
    }
  }
  ready(tryWire);
})();
