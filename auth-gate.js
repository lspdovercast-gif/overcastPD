/* OverCast RP - applicant access gate
   Applicants create their own Supabase account while submitting the application.
   Access to the panel is granted only when applications.status = 'Prihvaćena'. */
(function () {
  const originalFetch = window.fetch.bind(window);

  async function findApplicationByUser(userId, token) {
    const url = SUPABASE_URL + '/rest/v1/applications?user_id=eq.' + encodeURIComponent(userId) + '&select=id,fullname,status,email&limit=1';
    const res = await originalFetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  }

  window.fetchMyProfile = async function (userId) {
    const fallback = { can_view_applications: false, is_admin: false, is_super_admin: false, fullname: null, rank: null };
    if (!userId || !accessToken) throw new Error('Neispravan nalog.');

    const adminRes = await originalFetch(
      SUPABASE_URL + '/rest/v1/admin_permissions?user_id=eq.' + encodeURIComponent(userId) + '&select=can_view_applications,is_admin,is_super_admin,fullname,rank',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + accessToken } }
    );
    if (adminRes.ok) {
      const admins = await adminRes.json();
      if (admins[0] && (admins[0].is_admin || admins[0].is_super_admin || admins[0].can_view_applications)) {
        return admins[0];
      }
    }

    const app = await findApplicationByUser(userId, accessToken);
    if (!app) throw new Error('Nema pronađene prijave za ovaj nalog. Prvo pošalji prijavu.');
    if (app.status !== 'Prihvaćena') {
      if (app.status === 'Odbijena') throw new Error('Tvoja prijava je odbijena.');
      throw new Error('Tvoja prijava je još na čekanju. Sačekaj da bude prihvaćena.');
    }

    return {
      can_view_applications: false,
      is_admin: false,
      is_super_admin: false,
      fullname: app.fullname || userEmail,
      rank: 'LSPD'
    };
  };

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = ((init && init.method) || (typeof input !== 'string' && input && input.method) || 'GET').toUpperCase();

    if (method === 'POST' && url.indexOf(SUPABASE_URL + '/rest/v1/applications') === 0) {
      const body = init && init.body ? JSON.parse(init.body) : {};
      const email = (document.getElementById('applyEmail')?.value || '').trim().toLowerCase();
      const password = document.getElementById('applyPassword')?.value || '';

      if (!email || password.length < 6) {
        return new Response(JSON.stringify({ message: 'Unesi ispravan email i lozinku (minimum 6 znakova).' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      const signup = await originalFetch(SUPABASE_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
        body: JSON.stringify({ email, password })
      });
      const signupData = await signup.json().catch(() => ({}));

      if (!signup.ok && !String(signupData.msg || signupData.message || '').toLowerCase().includes('already')) {
        return new Response(JSON.stringify({ message: signupData.msg || signupData.message || 'Nije moguće napraviti nalog.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      let token = signupData.access_token;
      let userId = signupData.user && signupData.user.id;

      if (!token) {
        const login = await originalFetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
          body: JSON.stringify({ email, password })
        });
        const loginData = await login.json().catch(() => ({}));
        if (!login.ok || !loginData.access_token) {
          return new Response(JSON.stringify({ message: 'Nalog je napravljen, ali email mora biti potvrđen prije slanja prijave.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        token = loginData.access_token;
        userId = loginData.user && loginData.user.id;
      }

      body.user_id = userId;
      body.email = email;
      return originalFetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + token,
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(body)
      });
    }

    return originalFetch(input, init);
  };
})();
