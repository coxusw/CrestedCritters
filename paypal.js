// PayPal + shipping for Product page (robust)
(function(){
  const DEBUG = true;
  function log(){ if(DEBUG) console.log.apply(console, ['[CC-PROD]', ...arguments]); }
  function warn(){ console.warn.apply(console, ['[CC-PROD]', ...arguments]); }
  function err(){ console.error.apply(console, ['[CC-PROD]', ...arguments]); }
  function onReady(fn){ document.readyState!=='loading' ? fn() : document.addEventListener('DOMContentLoaded', fn); }

  function loadPayPalSdk(clientId, currency, cb){
    if(!clientId || /YOUR_SANDBOX_CLIENT_ID/i.test(clientId)){
      warn('PayPal Sandbox Client ID missing in js/config.js');
      return;
    }
    const s = document.createElement('script');
    s.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(clientId) + "&currency=" + encodeURIComponent(currency||'USD') + "&intent=capture";
    s.onload = cb; s.onerror = ()=>err('Failed to load PayPal SDK');
    document.head.appendChild(s);
  }

  onReady(function(){
    if(window.CC_ACTIVE !== 'product') return;

    const shipSelect = document.getElementById('shipMethod');
    const qtyInput   = document.getElementById('qty');
    const bSub = document.getElementById('bSub');
    const bShip= document.getElementById('bShip');
    const bTax = document.getElementById('bTax');
    const bTot = document.getElementById('bTot');

    // product lookup
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const list = (window.PRODUCTS || []);
    if(!Array.isArray(list) || !list.length){ err('window.PRODUCTS missing or empty'); return; }
    const p = list.find(x => x.slug === id) || list[0];
    if(!p){ err('Product not found'); return; }
    if(!document.getElementById('pName')){ warn('Old product.html? Missing page elements.'); return; }
    // fill static details (in case main.js didn't yet)
    document.getElementById('pImage').src = p.image;
    document.getElementById('pImage').alt = p.name;
    document.getElementById('pName').textContent = p.name;
    document.getElementById('pDesc').textContent = p.description || '';

    // shipping select
    const methods = window.SHIPPING_METHODS || [];
    if(shipSelect){
      shipSelect.innerHTML = methods.map(function(m){
        const sel = (m.key === (window.DEFAULT_SHIPPING_METHOD || 'standard')) ? 'selected' : '';
        return '<option value="'+m.key+'" '+sel+'>'+m.label+'</option>';
      }).join('');
    } else {
      warn('No shipMethod select found');
    }

    // totals
    if(typeof window.CC_calcTotals !== 'function'){
      err('window.CC_calcTotals missing'); return;
    }
    function refreshTotals(){
      const shipKey = shipSelect ? (shipSelect.value || (window.DEFAULT_SHIPPING_METHOD || 'standard')) : (window.DEFAULT_SHIPPING_METHOD || 'standard');
      const calc = window.CC_calcTotals(p, qtyInput ? qtyInput.value : 1, shipKey);
      if(bSub) bSub.textContent = '$' + calc.subtotal.toFixed(2);
      if(bShip) bShip.textContent= '$' + calc.shipping.toFixed(2);
      if(bTax) bTax.textContent = '$' + calc.tax.toFixed(2);
      if(bTot) bTot.textContent = '$' + calc.total.toFixed(2);
      return calc;
    }
    refreshTotals();
    shipSelect && shipSelect.addEventListener('change', refreshTotals);
    qtyInput && qtyInput.addEventListener('input', refreshTotals);

    // PayPal
    if(typeof p.price !== 'number'){
      warn('Non-numeric price (Coming Soon/Not For Sale). PayPal hidden.');
      return;
    }
    loadPayPalSdk(window.PAYPAL_CLIENT_ID, window.PAYPAL_CURRENCY||'USD', function(){
      if(typeof paypal === 'undefined'){ err('PayPal SDK failed to load'); return; }
      paypal.Buttons({
        style:{layout:'vertical', shape:'rect'},
        createOrder: function(data, actions){
          const calc = refreshTotals();
          const shipKey = shipSelect ? (shipSelect.value || (window.DEFAULT_SHIPPING_METHOD || 'standard')) : (window.DEFAULT_SHIPPING_METHOD || 'standard');
          const pref = (calc.method && calc.method.paypalShippingPreference) || 'NO_SHIPPING';
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
              items: [{
                name: p.name,
                unit_amount: { value: p.price.toFixed(2), currency_code: window.PAYPAL_CURRENCY || 'USD' },
                quantity: String(Math.max(1, parseInt(qtyInput && qtyInput.value || '1',10)))
              }],
              description: (p.description || '').slice(0,120)
            }],
            application_context: { brand_name: "Crested Critters", shipping_preference: pref }
          };
          log('createOrder payload', payload);
          return actions.order.create(payload);
        },
        onApprove: function(data, actions){
          return actions.order.capture().then(function(details){
            const orderId = details.id;
            // store summary for thankyou page
            try{
              const q = Math.max(1, parseInt(qtyInput && qtyInput.value || '1', 10));
              const calc = refreshTotals();
              sessionStorage.setItem('cc_last_order', JSON.stringify({
                orderId,
                product: { slug:p.slug, name:p.name, unitPrice:Number(p.price.toFixed(2)) },
                quantity: q,
                breakdown: { subtotal:calc.subtotal, shipping:calc.shipping, tax:calc.tax, total:calc.total }
              }));
            }catch(e){ warn('Could not store order summary', e); }
            window.location.href = "thankyou.html?orderId=" + encodeURIComponent(orderId);
          });
        },
        onCancel: function(){ window.location.href = "cancel.html"; },
        onError: function(e){ err('PayPal onError', e); alert("There was an error creating or capturing the order. Please try again."); }
      }).render('#paypal-button-container');
    });
  });
})();
