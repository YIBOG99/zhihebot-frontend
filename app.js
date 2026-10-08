const API_BASE = 'https://api.zhihebot.shop';
const CONFIG_ENDPOINT = '/public/config';
const state = { products: [], category: '全部', search: '', settings: {}, payments: {}, site: {} };
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function toast(msg, type='info'){const t=document.createElement('div');t.className=`toast ${type}`;t.textContent=msg;$('#toastWrap').appendChild(t);setTimeout(()=>t.remove(),2800)}
function money(v){const n=Number(v);return Number.isFinite(n)?`¥${n.toFixed(2)}`:'价格待定'}
function normalizeFaqs(p){
  const x=p?.faq ?? p?.faqs ?? p?.questions ?? [];
  if(Array.isArray(x)) return x.map(v=>Array.isArray(v)?{q:v[0],a:v[1]}:{q:v.q??v.question,a:v.a??v.answer}).filter(v=>v.q&&v.a);
  return [];
}
function normalizeProducts(data){
  const raw = Array.isArray(data) ? data : (data?.products || data?.data?.products || []);
  return raw.map((p,i)=>({
    id:p.id ?? p.productId ?? p.sku ?? i+1,
    name:p.name ?? p.title ?? 'AI 服务套餐',
    description:p.description ?? p.desc ?? '',
    detail:p.detail ?? p.content ?? p.longDescription ?? p.description ?? '',
    price:Number(p.price ?? p.amount ?? 0),
    originalPrice:Number(p.originalPrice ?? p.marketPrice ?? 0),
    category:p.category ?? p.type ?? 'AI 服务',
    stock:p.stock ?? p.inventory ?? p.quantity ?? '可购买',
    tag:p.tag ?? p.label ?? '精选',
    unit:p.unit ?? p.period ?? '起',
    delivery:p.delivery ?? p.deliveryMethod ?? p.shipment ?? '请以商品详情为准',
    image:p.image ?? p.imageUrl ?? p.cover ?? '',
    badges:Array.isArray(p.badges)?p.badges:[],
    features:Array.isArray(p.features)?p.features:[],
    notices:Array.isArray(p.notices)?p.notices:[],
    faqs:normalizeFaqs(p),
    sold:p.sold ?? p.sales ?? '',
    autoDelivery: p.autoDelivery ?? p.automatic ?? false,
    raw:p
  }));
}
function applySite(data){
  state.settings=data?.settings||{}; state.payments=data?.payments||{}; state.site=data?.site||data?.settings?.site||{};
  const brand = state.site?.name || state.settings?.siteName || '知禾商城';
  document.title = `${brand}｜AI 会员与数字服务`;
  $('#brandName').textContent = brand;
  $('#heroEyebrow').textContent = state.site?.eyebrow || state.settings?.heroEyebrow || 'AI 会员自助充值商城 · 24/7 在线';
  $('#heroTitle').innerHTML = esc(state.site?.heroTitle || state.settings?.heroTitle || '把 AI 会员，') + '<br><em>' + esc(state.site?.heroHighlight || state.settings?.heroHighlight || '简单买、快速用。') + '</em>';
  $('#heroSubtitle').textContent = state.site?.heroSubtitle || state.settings?.heroSubtitle || '精选 AI 会员与数字服务，商品详情、库存、价格与订单状态统一管理。手机打开也能快速完成购买。';
  $('#announcementText').textContent = state.site?.announcement || state.settings?.announcement || '知禾商城已上线，支持在线下单与订单查询';
  const favicon = state.site?.favicon || state.settings?.favicon;
  if(favicon){let l=document.querySelector('link[rel="icon"]');if(!l){l=document.createElement('link');l.rel='icon';document.head.appendChild(l)}l.href=favicon}
}
async function loadData(){
  try{
    const r=await fetch(`${API_BASE}${CONFIG_ENDPOINT}`,{cache:'no-store',headers:{Accept:'application/json'}});
    if(!r.ok) throw new Error(`config ${r.status}`);
    const data=await r.json();
    applySite(data);
    state.products=normalizeProducts(data);
  }catch(e){ console.warn(e); state.products=[]; toast('商品接口暂时无法访问，请检查 API', 'error'); }
  render();
}
function render(){
  const cats=['全部',...new Set(state.products.map(p=>p.category).filter(Boolean))];
  $('#productCount').textContent=state.products.length;
  $('#categoryCount').textContent=Math.max(0,cats.length-1);
  $('#heroCount').textContent=state.products.length;
  $('#categories').innerHTML=cats.map(c=>`<button class="category ${state.category===c?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  $$('.category').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;render()});
  const term=state.search.toLowerCase();
  let ps=state.category==='全部'?state.products:state.products.filter(p=>p.category===state.category);
  if(term) ps=ps.filter(p=>`${p.name} ${p.description} ${p.category}`.toLowerCase().includes(term));
  $('#productGrid').innerHTML=ps.map(card).join('');
  $('#emptyState').hidden=ps.length>0;
  $$('[data-buy]').forEach(b=>b.onclick=()=>openProduct(b.dataset.buy,true));
  $$('[data-detail]').forEach(b=>b.onclick=()=>openProduct(b.dataset.detail,false));
}
function card(p){
  const icon = p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" />` : `<span>${esc((p.category||'AI').slice(0,2))}</span>`;
  const stockText=typeof p.stock==='number'?`库存 ${p.stock}`:p.stock;
  const old=p.originalPrice>p.price?`<del>${money(p.originalPrice)}</del>`:'';
  return `<article class="product-card"><div class="product-media">${icon}<span class="product-tag">${esc(p.tag)}</span></div><div class="product-body"><div class="product-meta"><span>${esc(p.category)}</span>${p.sold?`<span>已售 ${esc(p.sold)}</span>`:''}</div><h3>${esc(p.name)}</h3><p>${esc(p.description||'商品详情请以产品页说明为准。')}</p><div class="product-foot"><div><div class="product-price">${money(p.price)} <small>${esc(p.unit)}</small></div>${old}</div><span class="stock-pill">${esc(stockText)}</span></div><div class="product-actions"><button class="secondary" data-detail="${esc(p.id)}">查看详情</button><button class="primary" data-buy="${esc(p.id)}">立即下单</button></div></div></article>`;
}
function productHtml(p, buyMode=false){
  const features=(p.features.length?p.features:['套餐与周期以订单页实际信息为准','库存与价格由后端实时提供','售后规则以商品详情为准']);
  const faqs=p.faqs.length?p.faqs:[{q:'下单后多久发货？',a:'不同商品处理方式不同，以商品详情或订单状态为准。'},{q:'库存不足还能购买吗？',a:'前端将尽量跟随后端库存状态展示，最终以下单时服务端校验为准。'}];
  return `<div class="modal-top"><span class="kicker">PRODUCT DETAIL</span><span class="modal-mini">${esc(p.category)}</span></div><h2>${esc(p.name)}</h2><p class="modal-desc">${esc(p.description)}</p><div class="detail-grid"><div class="detail-main"><div class="detail-price">${money(p.price)} <small>${esc(p.unit)}</small></div><div class="detail-line"><span>库存</span><b>${esc(p.stock)}</b></div><div class="detail-line"><span>交付</span><b>${esc(p.delivery)}</b></div>${p.autoDelivery?'<div class="auto-badge">⚡ 自动处理</div>':''}<div class="detail-copy">${formatText(p.detail||p.description)}</div><div class="feature-list">${features.map(f=>`<div>✓ ${esc(f)}</div>`).join('')}</div></div><div class="buy-side"><div class="notice-box"><strong>购买须知</strong><p>购买前请确认账号/套餐要求、交付方式及售后规则。支付以订单页显示金额为准。</p></div>${buyMode?`<div class="buy-form"><label>联系邮箱<input id="buyEmail" type="email" placeholder="用于接收订单信息" /></label><label>备注（可选）<textarea id="buyNote" rows="3" placeholder="如商品要求填写账号信息，请在这里备注"></textarea></label><button class="primary wide" id="createOrderBtn">提交订单</button><p class="fine">提交按钮只会请求你的 API，不会在前端保存账号密码。</p></div>`:'<button class="primary wide" id="detailBuyBtn">立即购买</button>'}</div></div><div class="modal-faq"><h3>商品 Q&A</h3>${faqs.map(x=>`<details><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</div>`;
}
function formatText(s){const str=String(s||'').trim();if(!str)return '';return `<div>${esc(str).replace(/\n/g,'<br>')}</div>`}
function openProduct(id,buyMode=false){const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;showModal(productHtml(p,buyMode));if(buyMode) bindCreateOrder(p); else $('#detailBuyBtn').onclick=()=>openProduct(id,true)}
function showModal(html){$('#modalBody').innerHTML=html;$('#modal').classList.add('show');$('#modal').setAttribute('aria-hidden','false')}
function closeModal(){$('#modal').classList.remove('show');$('#modal').setAttribute('aria-hidden','true')}
async function createOrder(p){
  const email=$('#buyEmail')?.value.trim()||''; const note=$('#buyNote')?.value.trim()||'';
  const body={productId:p.id,product: p.id, email, note, quantity:1};
  const btn=$('#createOrderBtn'); if(btn){btn.disabled=true;btn.textContent='提交中…'}
  try{
    const r=await fetch(`${API_BASE}/public/orders`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||`HTTP ${r.status}`);
    const orderId=d.id||d.orderId||d.order?.id||d.order?.orderId;
    closeModal();
    if(orderId){ $('#orderInput').value=orderId; location.hash='orders'; await queryOrder(orderId); toast('订单已创建','success'); }
    else { toast('订单已提交，请按后端返回结果查询','success'); }
  }catch(e){toast(`创建订单失败：${e.message}`,'error');if(btn){btn.disabled=false;btn.textContent='提交订单'}}
}
function bindCreateOrder(p){const b=$('#createOrderBtn');if(b)b.onclick=()=>createOrder(p)}
async function queryOrder(id){
  $('#orderResult').innerHTML='<div class="loading-line"><span></span>正在查询订单…</div>';
  try{
    const r=await fetch(`${API_BASE}/public/orders/${encodeURIComponent(id)}`,{cache:'no-store',headers:{Accept:'application/json'}}); const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||`查询失败（${r.status}）`);
    const o=d.order||d; const status=o.status||'已找到订单'; const amount=o.amount??o.total??o.price; const name=o.productName||o.product||''; const created=o.createdAt||o.created_at||'';
    $('#orderResult').innerHTML=`<div class="order-card"><div><span>订单号</span><b>${esc(id)}</b></div><div><span>状态</span><b class="status-text">${esc(status)}</b></div>${name?`<div><span>商品</span><b>${esc(name)}</b></div>`:''}${amount!=null?`<div><span>金额</span><b>${money(amount)}</b></div>`:''}${created?`<div><span>创建时间</span><b>${esc(created)}</b></div>`:''}</div>`;
  }catch(e){$('#orderResult').innerHTML=`<div class="order-error">${esc(e.message||'查询失败')}<br><small>请确认订单号正确，并确保 API 已提供 <code>GET /public/orders/:id</code>。</small></div>`}
}
async function redeem(){
  const code=$('#redeemCode').value.trim(); if(!code)return toast('请先输入卡密'); const email=$('#redeemEmail').value.trim(); const btn=$('#redeemBtn'); btn.disabled=true; btn.textContent='验证中…'; $('#redeemResult').textContent='正在请求后端…';
  try{
    const r=await fetch(`${API_BASE}/public/redeem`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({code,email})});
    const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.message||`HTTP ${r.status}`);
    $('#redeemResult').textContent=d.message||'兑换请求已提交，请按页面提示继续。'; toast('请求已提交','success');
  }catch(e){$('#redeemResult').textContent=`后端暂未开放兑换接口：${e.message}`;toast('当前后端可能还没有 /public/redeem','error')}
  finally{btn.disabled=false;btn.textContent='验证并继续'}
}
function setupFaq(){const list=[
  ['下单后多久能看到订单？','创建订单成功后会生成订单号。不同商品处理方式不同，具体以订单状态与商品详情为准。'],
  ['如果库存不足怎么办？','库存由后端返回；最终能否下单以服务端库存校验为准。需要补货时请联系客服。'],
  ['支付方式在哪里配置？','支付方式不写死在前端。你现有 API 的支付配置会从后端读取，前端只展示可用状态。'],
  ['购买后出现问题怎么办？','请先保存订单号，再联系售后并说明问题。商品售后范围与期限以商品详情为准。'],
  ['这个网站是官方平台吗？','知禾商城是独立第三方服务平台。页面中的品牌名称仅用于识别相关服务，相关商标归各自权利人所有。']
];
  $('#faqList').innerHTML=list.map((x,i)=>`<details class="faq-item" ${i===0?'open':''}><summary>${esc(x[0])}<span>＋</span></summary><p>${esc(x[1])}</p></details>`).join('');
}
function syncTheme(){const saved=localStorage.getItem('zhihe-theme'); if(saved==='light')document.documentElement.dataset.theme='light'; $('#themeBtn').textContent=document.documentElement.dataset.theme==='light'?'☾':'☼'}
function setup(){
  syncTheme(); setupFaq();
  $('#closeModal').onclick=closeModal; $('#modal').onclick=e=>{if(e.target.id==='modal')closeModal()};
  $('#menuBtn').onclick=()=>$('#mobileNav').classList.toggle('show');
  $$('.mobile-nav a').forEach(a=>a.onclick=()=>$('#mobileNav').classList.remove('show'));
  $('#orderBtn').onclick=()=>location.hash='orders'; $('#heroOrder').onclick=()=>location.hash='orders';
  $('#queryBtn').onclick=()=>{const id=$('#orderInput').value.trim(); if(!id)return toast('请先输入订单号'); queryOrder(id)};
  $('#productSearch').oninput=e=>{state.search=e.target.value;render()};
  $('#redeemBtn').onclick=redeem;
  $('#closeAnnouncement').onclick=()=>{$('#announcement').classList.add('hidden');localStorage.setItem('zhihe-announcement-hidden','1')};
  if(localStorage.getItem('zhihe-announcement-hidden')==='1')$('#announcement').classList.add('hidden');
  $('#langBtn').onclick=()=>toast('English UI can be added after the Chinese version is confirmed.');
  $('#themeBtn').onclick=()=>{const next=document.documentElement.dataset.theme==='light'?'':'light';if(next)document.documentElement.dataset.theme=next;else delete document.documentElement.dataset.theme;localStorage.setItem('zhihe-theme',next||'dark');syncTheme()};
}
setup(); loadData();
