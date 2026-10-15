// App Store screenshot demo — runs before the app's own scripts.
// Offline demo state: never reads or writes the real database.
(function () {
  window.DEMO_SCENE = new URLSearchParams(location.search).get('s') || 'home';
  try {
    localStorage.clear();
    localStorage.setItem('fadex_onboarded', '1');
    localStorage.setItem('fadex_splash_seen', '1');
    localStorage.setItem('fadex_theme', 'light');
    localStorage.setItem('fadex_radius', '10');
    localStorage.setItem('fadex_last_loc', JSON.stringify({ ll: [29.6497, -82.3393], city: 'Gainesville, FL', t: Date.now() }));
  } catch (e) {}
  const realFetch = window.fetch;
  window.fetch = function (u, o) {
    const url = String((u && u.url) || u);
    if (/\/api\/mapkit-token/.test(url)) return realFetch.call(this, 'https://catch-a-fade.onrender.com/api/mapkit-token', o);
    if (/supabase\.co|\/api\//.test(url)) return Promise.reject(new Error('demo'));
    return realFetch.call(this, u, o);
  };
  try {
    Object.defineProperty(navigator, 'geolocation', { value: {
      getCurrentPosition(ok, err) { err && err({ code: 1 }); }, watchPosition() { return 0; }, clearWatch() {}
    } });
  } catch (e) {}
})();
