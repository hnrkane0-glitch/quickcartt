/* QuickCart marketing pages: shared nav, footer, reveal-on-scroll, router-safe navigation. */
(function(){
  'use strict';
  var PAGES=[['Features','/features'],['See it live','/demo'],['How it works','/how-it-works'],['Pricing','/pricing'],['FAQ','/faq'],['Contact','/contact']];
  window.qcGo=function(path){
    if(window.parent&&window.parent!==window&&window.parent.qcNavigate){window.parent.qcNavigate(path);return;}
    window.location.href=path;   // pretty paths (/features, /login …) are served by vercel.json / the app router
  };
  function go(p){return function(e){e.preventDefault();window.qcGo(p);};}
  var page=document.body.getAttribute('data-page')||'';
  function el(tag,cls,html){var n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;}
  function nav(){
    var host=document.getElementById('site-nav');if(!host)return;
    var n=el('nav','sx-nav'),inn=el('div','sx-nav-in');
    var logo=el('a','sx-logo','<span class="sx-mark">Q</span>QuickCart');logo.href='/';logo.onclick=go('/');
    var links=el('div','sx-links');
    PAGES.forEach(function(p){var a=el('a',p[1]==='/'+page?'on':'',p[0]);a.href=p[1];a.onclick=function(e){links.classList.remove('open');go(p[1])(e);};links.appendChild(a);});
    var r=el('div','sx-nav-r');
    var lg=el('button','sx-ghost sx-d-only','Log in');lg.onclick=function(){window.qcGo('/login');};
    var st=el('button','sx-btn sm','Start free <span>→</span>');st.onclick=function(){window.qcGo('/register');};
    var bg=el('button','sx-burger','<i></i><i></i><i></i>');bg.setAttribute('aria-label','Menu');bg.onclick=function(){links.classList.toggle('open');};
    r.appendChild(lg);r.appendChild(st);r.appendChild(bg);
    inn.appendChild(logo);inn.appendChild(links);inn.appendChild(r);n.appendChild(inn);host.appendChild(n);
  }
  function foot(){
    var host=document.getElementById('site-foot');if(!host)return;
    var h='<footer class="sx-foot"><div class="sx-wrap"><div class="sx-foot-in"><div><a class="sx-logo" href="/" data-go="/"><span class="sx-mark">Q</span>QuickCart</a><p>Nigeria’s smart commerce platform — online store, POS, inventory and accounting in one.</p></div>'+
    '<div><h4>Product</h4>'+PAGES.slice(0,4).map(function(p){return '<a href="'+p[1]+'" data-go="'+p[1]+'">'+p[0]+'</a>';}).join('')+'</div>'+
    '<div><h4>Support</h4><a href="/faq" data-go="/faq">FAQ</a><a href="/contact" data-go="/contact">Contact us</a><a href="/login" data-go="/login">Log in</a><a href="/register" data-go="/register">Start free trial</a></div>'+
    '<div><h4>Company</h4><a href="/terms" data-go="/terms">Terms of Service</a><a href="/privacy" data-go="/privacy">Privacy Policy</a><a href="mailto:hnrkane@gmail.com">hnrkane@gmail.com</a></div></div>'+
    '<div class="sx-foot-b">© '+new Date().getFullYear()+' QuickCart Nigeria. All rights reserved.</div></div></footer>';
    host.innerHTML=h;
    host.querySelectorAll('[data-go]').forEach(function(a){a.onclick=go(a.getAttribute('data-go'));});
  }
  /* any element with data-go="/path" navigates inside the app */
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-go]');if(t&&!t.closest('#site-foot')){e.preventDefault();window.qcGo(t.getAttribute('data-go'));}});
  function reveal(){
    var els=[].slice.call(document.querySelectorAll('.sx-rv'));
    if(!('IntersectionObserver' in window)){els.forEach(function(x){x.classList.add('in');});return;}
    var io=new IntersectionObserver(function(es){es.forEach(function(en){if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}});},{threshold:.12});
    els.forEach(function(x){io.observe(x);});
  }
  function init(){nav();foot();reveal();try{window.parent.postMessage({title:document.title.replace(/ — QuickCart$/,'')},'*');}catch(e){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
