// Screenshot-only demo state (this file exists only in the temporary screenshot copy).
try{ localStorage.setItem('fadex_splash_seen','1'); localStorage.setItem('fadex_theme','light'); }catch(e){}
window.addEventListener('load', function(){
  setTimeout(function(){
    document.documentElement.classList.add('native','native-ios'); document.body.classList.add('native','light');
    var ci=document.getElementById('clipperIntro'); if(ci) ci.style.display='none';
    var st=document.createElement('style');
    st.textContent='html,body{margin:0!important}html.native body,body{display:block!important;width:500px!important;overflow:hidden!important}.stage{padding:0!important;display:block!important;min-height:0!important;width:440px!important;height:956px!important}'
      +'#phone{position:fixed!important;left:30px!important;top:0!important;width:440px!important;height:956px!important;max-width:none!important;border-radius:0!important;transform:none!important;margin:0!important;box-shadow:none!important;border:0!important}'
      +'.statusbar{display:flex!important}.island{display:block!important}';
    document.head.appendChild(st);
    stack=['profile']; render();
    setTimeout(function(){
      document.querySelectorAll('.modal.show').forEach(function(m){m.classList.remove('show');});
      var av=document.getElementById('profAv');
      av.innerHTML='<img src="me.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">'; av.style.background='none'; av.style.overflow='hidden';
      document.getElementById('profName').textContent='Daniel Reyes';
      var ts=document.getElementById('themeSwitch'); if(ts) ts.classList.remove('on');
      // iPhone status bar + Dynamic Island, like a real device capture
      var sbar=document.createElement('div');
      sbar.style.cssText='position:fixed;left:30px;top:0;width:440px;height:56px;background:var(--bg);z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;color:#000';
      sbar.innerHTML='<div style="position:absolute;left:54px;top:19px;font-size:17px;font-weight:600;letter-spacing:-.2px">9:41</div>'
        +'<div style="position:absolute;left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000"></div>'
        +'<div style="position:absolute;right:30px;top:21px;display:flex;align-items:center;gap:6px">'
        +'<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#000"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="#000"/><rect x="10" y="3" width="3" height="9" rx="1" fill="#000"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#000"/></svg>'
        +'<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.6l2.3-2.6a3.4 3.4 0 0 0-4.6 0z" fill="#000"/><path d="M3.3 6.6a6.8 6.8 0 0 1 9.4 0l1.4-1.6a9 9 0 0 0-12.2 0z" fill="#000"/><path d="M.6 3.7a10.6 10.6 0 0 1 14.8 0L16 3A11.8 11.8 0 0 0 0 3z" fill="#000"/></svg>'
        +'<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="#000" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.4" fill="#000"/><path d="M25 4.5v4c.9-.3 1.5-1.1 1.5-2s-.6-1.7-1.5-2z" fill="#000" fill-opacity=".45"/></svg>'
        +'</div>';
      document.body.appendChild(sbar);
      document.documentElement.style.overflow='hidden';
      setTimeout(function(){ window.scrollTo(0,0); document.querySelectorAll('.screen,.body,#phone,.stage').forEach(function(e){e.scrollLeft=0;}); }, 100);
      document.getElementById('profSub').innerHTML='<div style="color:var(--dim);font-size:13px;font-weight:700">Gainesville, FL</div><div style="color:var(--faint);font-size:12px;margin-top:2px">Member since August 2026 · 6 cuts</div>';
      var heart='<svg width="11" height="11" viewBox="0 0 24 24" fill="#fff"><path d="M12 21C5 16 3 12 3 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 9 2.5C21 12 19 16 12 21z"/></svg>';
      function fav(img,n){return '<div class="favItem"><div class="fav-av" style="background:#222;overflow:visible"><img src="'+img+'" style="width:100%;height:100%;object-fit:cover;border-radius:21px"><div class="hb">'+heart+'</div></div><small>'+n+'</small></div>';}
      document.getElementById('favRow').innerHTML=fav('b1.jpg','Marco')+fav('b2.jpg','Jordan')
        +'<div class="favItem"><div class="favAdd"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 6v12M6 12h12"/></svg></div><small>Add new</small></div>';
    }, 400);
  }, 600);
});
