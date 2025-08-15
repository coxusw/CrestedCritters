
// Crested Critters Cart – localStorage-backed
(function(){
  const KEY = 'CC_CART';

  function getCart(){ try{ return JSON.parse(localStorage.getItem(KEY)||'[]'); }catch(e){ return []; } }
  function saveCart(items){ localStorage.setItem(KEY, JSON.stringify(items)); updateBadge(); }
  function clearCart(){ localStorage.removeItem(KEY); updateBadge(); }
  function addToCart(item){ // {slug,name,price,image,category,quantity}
    const cart = getCart();
    const idx = cart.findIndex(x => x.slug === item.slug);
    if(idx >= 0){
      cart[idx].quantity = Math.min(999, (cart[idx].quantity||1) + (item.quantity||1));
    }else{
      item.quantity = Math.max(1, item.quantity||1);
      cart.push(item);
    }
    saveCart(cart);
  }
  function removeFromCart(slug){
    const cart = getCart().filter(x => x.slug !== slug);
    saveCart(cart);
  }
  function setQty(slug, qty){
    const cart = getCart();
    const i = cart.findIndex(x=>x.slug===slug);
    if(i>=0){ cart[i].quantity = Math.max(1, Math.min(999, parseInt(qty||'1',10))); saveCart(cart); }
  }

  // Badge in navbar
  function updateBadge(){
    const cart = getCart();
    const count = cart.reduce((a,b)=>a+(b.quantity||1),0);
    let el = document.getElementById('ccCartBadge');
    if(!el){
      const nav = document.querySelector('.nav');
      if(nav){
        const link = document.createElement('a');
        link.href = 'cart.html';
        link.dataset.nav = 'cart';
        link.innerHTML = 'Cart <span id="ccCartBadge" class="badge"></span>';
        nav.appendChild(link);
        el = link.querySelector('#ccCartBadge');
      }
    }
    if(el) el.textContent = count;
  }

  // Expose globally
  window.CC_CART = {get:getCart, save:saveCart, clear:clearCart, add:addToCart, remove:removeFromCart, setQty:setQty, updateBadge:updateBadge};

  document.addEventListener('DOMContentLoaded', updateBadge);
})();
