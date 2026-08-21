/* OverCast RP - Applicant access gate */
(function () {
  const SUPABASE_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-aKDZyBp1l5IRsGPmlGnsw_nPY_c827';
  const API = SUPABASE_URL + '/rest/v1';
  const AUTH = SUPABASE_URL + '/auth/v1';

  async function supa(path, options = {}) {
    const headers = Object.assign({ apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, options.headers || {});
    return fetch(path, Object.assign({}, options, { headers }));
  }

  window.OvercastAuthGate = {
    async login(email, password) {
      const r = await supa(AUTH + '/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error_description || data.msg || data.message || 'Pogrešan email ili lozinka.');
      localStorage.setItem('overcast_access_token', data.access_token);
      return data;
    },
    async getApplication(userId, token) {
      const r = await fetch(API + '/applications?user_id=eq.' + encodeURIComponent(userId) + '&select=id,fullname,email,status&limit=1', {
        headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token }
      });
      if (!r.ok) return null;
      const rows = await r.json();
      return rows[0] || null;
    },
    async checkAccess() {
      const token = localStorage.getItem('overcast_access_token');
      if (!token) return { loggedIn: false, allowed: false, reason: 'Nisi prijavljen.' };
      const r = await fetch(AUTH + '/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
      if (!r.ok) {
        localStorage.removeItem('overcast_access_token');
        return { loggedIn: false, allowed: false, reason: 'Sesija je istekla.' };
      }
      const user = await r.json();
      const application = await this.getApplication(user.id, token);
      if (!application) return { loggedIn: true, allowed: false, reason: 'Nema pronađene prijave za ovaj nalog.', user, application: null };
      if (application.status === 'Prihvaćena') return { loggedIn: true, allowed: true, reason: '', user, application };
      if (application.status === 'Odbijena') return { loggedIn: true, allowed: false, reason: 'Tvoja prijava je odbijena.', user, application };
      return { loggedIn: true, allowed: false, reason: 'Tvoja prijava je još na čekanju.', user, application };
    },
    logout() { localStorage.removeItem('overcast_access_token'); location.reload(); }
  };
})();
