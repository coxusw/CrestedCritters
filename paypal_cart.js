// Hardened cart checkout – renders table and totals even if previous scripts were out of order
(function(){
  const DEBUG = true;
  function log(){ if(DEBUG) console.log.apply(console, ['[CC-CART]', ...arguments]); }
  function warn(){ console.warn.apply(console, ['[CC-CART]', ...arguments]); }
  function err(){ console.error.apply(console, ['[CC-CART]', ...arguments]); }
  function $ (s, r=document){ return r.querySelector(s); }
  function onReady(fn){ document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }
  function loadPayPalSdk(clientId, currency, cb){
    if(!clientId || /YOUR_SANDBOX_CLIENT_ID/i.test(clientId)){ warn('Missing Sandbox Client ID'); return; }
    const s = document.createElement('script');
    s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) + "&currency=" + encodeURIComponent(currency||'USD') + "&intent=capture";
    s.onload = cb; s.onerror = ()=>err('Failed to load PayPal SDK'); document.head.appendChild(s);
  }
  function getCart(){ try{ return JSON.parse(localStorage.getItem('CC_CART')||'[]'); }catch(e){ return []; } }
  function calcTotals(items, shipKey){
    const methods = window.SHIPPING_METHODS||[];
    const method = methods.find(m=>m.key===shipKey) || methods[0] || {cost:0,taxable:false,paypalShippingPreference:'NO_SHIPPING'};
    const subtotal = items.reduce((a,b)=>a + (b.price * b.quantity), 0);
    const shipping = Number(method.cost||0);
    const taxBase = subtotal + ((method.taxable && (window.TAX_SHIPPING!==false)) ? shipping : 0);
    const tax = Number(((window.TAX_RATE||0) * taxBase).toFixed(2));
    const total = Number((subtotal + shipping + tax).toFixed(2));
    return {subtotal, shipping, tax, total, method};
  }

  onReady(function(){
    // must be on cart page
    if(window.CC_ACTIVE !== 'cart'){ warn('CC_ACTIVE not cart:', window.CC_ACTIVE); }

    const root = $('#cartRoot');
    const shipSelect = $('#shipMethod');
    const bSub=$('#bSub'), bShip=$('#bShip'), bTax=$('#bTax'), bTot=$('#bTot');

    // Render basic table
    function renderCart(){
      const items = getCart();
      if(items.length===0){
        root.innerHTML = '<p class="notice">Your cart is empty. <a href="index.html">Continue shopping</a>.</p>';
        $('#paypal-button-container').innerHTML = '';
        if(bSub){ bSub.textContent=bShip.textContent=bTax.textContent=bTot.textContent='$0.00'; }
        return;
      }
      const rows = items.map(it => `
        <tr>
          <td style="width:80px"><img src="${it.image}" alt="${it.name}" style="width:72px;height:54px;object-fit:cover;border-radius:8px;border:1px solid var(--border)"></td>
          <td><div class="name">${it.name}</div><div class="meta"><span class="badge">${it.category}</span></div></td>
          <td class="right">$${it.price.toFixed(2)}</td>
          <td><input class="qty-input" type="number" min="1" value="${it.quantity}" data-slug="${it.slug}"></td>
          <td class="right">$${(it.price * it.quantity).toFixed(2)}</td>
          <td class="right"><button data-remove="${it.slug}">Remove</button></td>
        </tr>
      `).join('');
      root.innerHTML = `
        <table class="cart-table">
          <thead><tr><th></th><th>Item</th><th class="right">Price</th><th>Qty</th><th class="right">Line</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      `;
      // listeners
      root.querySelectorAll('.qty-input').forEach(inp=>{
        inp.addEventListener('input', e=>{
          const slug = e.target.getAttribute('data-slug');
          const val = Math.max(1, parseInt(e.target.value||'1',10));
          const items = getCart();
          const i = items.findIndex(x=>x.slug===slug);
          if(i>=0){ items[i].quantity = val; localStorage.setItem('CC_CART', JSON.stringify(items)); }
          renderCart(); refreshTotals();
        });
      });
      root.querySelectorAll('button[data-remove]').forEach(btn=>{
        btn.addEventListener('click', e=>{
          const slug = e.target.getAttribute('data-remove');
          const items = getCart().filter(x=>x.slug!==slug);
          localStorage.setItem('CC_CART', JSON.stringify(items));
          renderCart(); refreshTotals();
        });
      });
    }

    // shipping select
    function initShipping(){
      const methods = window.SHIPPING_METHODS || [];
      if(!shipSelect){ warn('shipMethod select missing'); return; }
      shipSelect.innerHTML = methods.map(m=>{
        const sel = (m.key === (window.DEFAULT_SHIPPING_METHOD || 'standard')) ? 'selected' : '';
        return `<option value="${m.key}" ${sel}>${m.label}</option>`;
      }).join('');
      shipSelect.addEventListener('change', refreshTotals);
    }

    function refreshTotals(){
      const items = getCart();
      const shipKey = shipSelect ? (shipSelect.value || (window.DEFAULT_SHIPPING_METHOD || 'standard')) : (window.DEFAULT_SHIPPING_METHOD || 'standard');
      const calc = calcTotals(items, shipKey);
      if(bSub){ bSub.textContent = '$' + calc.subtotal.toFixed(2); }
      if(bShip){ bShip.textContent= '$' + calc.shipping.toFixed(2); }
      if(bTax){ bTax.textContent = '$' + calc.tax.toFixed(2); }
      if(bTot){ bTot.textContent = '$' + calc.total.toFixed(2); }
      return calc;
    }

    function renderPayPal(){
      const items = getCart();
      if(items.length===0) { $('#paypal-button-container').innerHTML=''; return; }
      const clientId = window.PAYPAL_CLIENT_ID;
      if(!clientId || /YOUR_SANDBOX_CLIENT_ID/i.test(clientId)){ warn('Sandbox Client ID missing'); return; }
      loadPayPalSdk(clientId, window.PAYPAL_CURRENCY||'USD', function(){
        paypal.Buttons({
          style:{layout:'vertical', shape:'rect'},
          createOrder: function(data, actions){
            const shipKey = shipSelect ? (shipSelect.value || (window.DEFAULT_SHIPPING_METHOD || 'standard')) : (window.DEFAULT_SHIPPING_METHOD || 'standard');
            const calc = calcTotals(items, shipKey);
            const pref = (calc.method && calc.method.paypalShippingPreference) || 'NO_SHIPPING';
            const orderItems = items.map(it => ({
              name: it.name,
              unit_amount: { value: it.price.toFixed(2), currency_code: window.PAYPAL_CURRENCY || 'USD' },
              quantity: String(Math.max(1, it.quantity||1))
            }));
            const payload = {
              purchase_units: [{
                amount: {
                  value: calc.total.toFixed(2),
                  currency_code: window.PAYPAL_CURRENCY || 'USD',
                  breakdown: {
                    item_total: { value: calc.subtotal.toFixed(2), currency_code: window.PAYPAL_CURRENCY || 'USD' },
                    shipping:   { value: calc.shipping.toFixed(2),  currency_code: window.PAYPAL_CURRENCY || 'USD' },
                    tax_total:  { value: calc.tax.toFixed(2),      currency_code: window.PAYPAL_CURRENCY || 'USD' }
                  }
                },
                items: orderItems,
                description: 'Crested Critters Order'
              }],
              application_context: {
                brand_name: "Crested Critters",
                shipping_preference: pref
              }
            };
            log('createOrder payload', payload);
            return actions.order.create(payload);
          },
          onApprove: function(data, actions){
            return actions.order.capture().then(function(details){
              const addr = details?.purchase_units?.[0]?.shipping?.address || null;
              const payerEmail = details?.payer?.email_address || '';
              const orderId = details.id;
              const shipKey = shipSelect ? (shipSelect.value || (window.DEFAULT_SHIPPING_METHOD || 'standard')) : (window.DEFAULT_SHIPPING_METHOD || 'standard');
              const calc = calcTotals(getCart(), shipKey);
              const items = getCart();

              try{
                sessionStorage.setItem('cc_last_order_cart', JSON.stringify({ orderId, items, totals: calc, shippingMethod: shipKey, payerEmail }));
              }catch(e){ warn('Could not store order summary', e); }

              try{
                if(window.GS_WEBHOOK && window.GS_WEBHOOK.trim() && !/YOUR_APPS_SCRIPT_WEB_APP_URL/i.test(window.GS_WEBHOOK)){
                  const payload = {
                    orderId,
                    items: items.map(it => ({slug:it.slug, name:it.name, unitPrice:it.price, quantity:it.quantity})),
                    totals: calc,
                    shippingMethod: shipKey,
                    payer: { email: payerEmail, given_name: details?.payer?.name?.given_name || '', surname: details?.payer?.name?.surname || '' },
                    shippingAddress: addr,
                    capturedAt: new Date().toISOString()
                  };
                  fetch(window.GS_WEBHOOK, { method:"POST", headers:{"Content-Type":"text/plain"}, body: JSON.stringify(payload) }).catch(e=>warn('Webhook error', e));
                }
              }catch(e){ warn('Webhook exception', e); }

              // clear cart & go
              localStorage.removeItem('CC_CART');
              window.location.href = "thankyou.html?orderId=" + encodeURIComponent(orderId);
            });
          },
          onCancel: function(){ window.location.href = "cancel.html"; },
          onError: function(e){ err('PayPal onError', e); alert("There was an error creating or capturing the order. Please try again."); }
        }).render('#paypal-button-container');
      });
    }

    // Boot
    renderCart();
    initShipping();
    refreshTotals();
    renderPayPal();
  });
})();
