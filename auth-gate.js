/* OverCast RP - automatic applicant access
   Uses only the Supabase publishable key. Never put a service_role/secret key here.
*/
(function () {
  const SUPABASE_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-aKDZyBp1l5IRsGPmlGnsw_nPY_c827';
  const AUTH = SUPABASE_URL + '/auth/v1';
  const REST = SUPABASE_URL + '/rest/v1';
  const originalFetch = window.fetch.bind(window);

  async function jsonFetch(url, options) {
    const headers = Object.assign({
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json'
    }, options && options.headers ? options.headers : {});
    return originalFetch(url, Object.assign({}, options || {}, { headers }));
  }

  async function getApplication(userId, token) {
    const r = await originalFetch(
      REST + '/applications?user_id=eq.' + encodeURIComponent(userId) + '&select=id,fullname,email,status&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }
    );
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return rows[0] || null;
  }

  async function isAdmin(userId, token) {
    const r = await originalFetch(
      REST + '/admin_permissions?user_id=eq.' + encodeURIComponent(userId) + '&select=user_id,is_admin,is_super_admin&limit=1',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } }
    );
    if (!r.ok) return false;
    const rows = await r.json().catch(() => []);
    return !!(rows[0] && (rows[0].is_admin || rows[0].is_super_admin));
  }

  async function signUpOrLogin(email, password) {
    const signup = await jsonFetch(AUTH + '/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const signupData = await signup.json().catch(() => ({}));
    if (signup.ok && signupData.user && signupData.user.id) {
      return { userId: signupData.user.id, token: signupData.access_token || null, signup: true };
    }

    const login = await jsonFetch(AUTH + '/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const loginData = await login.json().catch(() => ({}));
    if (!login.ok || !loginData.user || !loginData.user.id) {
      throw new Error(loginData.error_description || loginData.msg || signupData.msg || signupData.message || 'Nije moguće napraviti nalog.');
    }
    return { userId: loginData.user.id, token: loginData.access_token, signup: false };
  }

  /* Add account fields to the existing application form without changing its design. */
  function addAccountFields() {
    const form = document.getElementById('applyForm');
    if (!form || document.getElementById('applyEmail')) return;
    const submit = document.getElementById('applyBtn');
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="field">
        <label for="applyEmail">Email</label>
        <input type="email" id="applyEmail" required autocomplete="email" placeholder="tvoj@email.com">
      </div>
      <div class="field">
        <label for="applyPassword">Lozinka</label>
        <input type="password" id="applyPassword" required minlength="6" autocomplete="new-password" placeholder="Minimum 6 znakova">
      </div>`;
    form.insertBefore(wrap, submit);
  }

  /* Intercept the existing application submit request and attach the Auth user_id. */
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();

    if (method === 'POST' && url.indexOf(REST + '/applications') === 0) {
      try {
        const body = init && init.body ? JSON.parse(init.body) : {};
        const email = (document.getElementById('applyEmail') || {}).value?.trim().toLowerCase();
        const password = (document.getElementById('applyPassword') || {}).value || '';
        if (!email || password.length < 6) {
          return new Response(JSON.stringify({ message: 'Unesi email i lozinku od najmanje 6 znakova.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const account = await signUpOrLogin(email, password);
        body.user_id = account.userId;
        body.email = email;

        /* The application can be inserted with the public key; user_id is then used by RLS. */
        return originalFetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_KEY,
            Authorization: 'Bearer ' + (account.token || SUPABASE_KEY),
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(body)
        });
      } catch (err) {
        return new Response(JSON.stringify({ message: err.message || 'Greška pri pravljenju naloga.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    /* Existing login handler already talks directly to Supabase. We validate the
       credentials, then only allow the dashboard if the user is an admin or their
       application has status Prihvaćena. */
    if (method === 'POST' && url.indexOf(AUTH + '/token?grant_type=password') === 0) {
      const realResponse = await originalFetch(input, init);
      if (!realResponse.ok) return realResponse;
      const data = await realResponse.clone().json().catch(() => ({}));
      const token = data.access_token;
      const userId = data.user && data.user.id;
      if (!token || !userId) return realResponse;

      const admin = await isAdmin(userId, token);
      if (admin) return realResponse;

      const application = await getApplication(userId, token);
      if (application && application.status === 'Prihvaćena') return realResponse;

      const message = application && application.status === 'Odbijena'
        ? 'Tvoja prijava je odbijena.'
        : application
          ? 'Tvoja prijava je još na čekanju.'
          : 'Nema pronađene prijave za ovaj nalog.';

      return new Response(JSON.stringify({ error: 'access_denied', error_description: message, msg: message }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return originalFetch(input, init);
  };

  window.addEventListener('DOMContentLoaded', function () {
    addAccountFields();
  });
  if (document.readyState !== 'loading') addAccountFields();

  window.OvercastAuthGate = {
    async checkAccess() {
      const token = localStorage.getItem('overcast_access_token');
      if (!token) return { loggedIn: false, allowed: false };
      const r = await originalFetch(AUTH + '/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
      if (!r.ok) return { loggedIn: false, allowed: false };
      const user = await r.json();
      const application = await getApplication(user.id, token);
      return { loggedIn: true, allowed: !!(application && application.status === 'Prihvaćena'), user, application };
    },
    logout() { localStorage.removeItem('overcast_access_token'); location.reload(); }
  };
})();
