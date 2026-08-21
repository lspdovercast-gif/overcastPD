/* OverCast RP — Settings / Users bridge
   The existing index.html already has the users table and its loadAdminUsers().
   We only replace the READ of admin_permissions with the secure list-users
   Edge Function. PATCH requests still go directly to admin_permissions. */
(function () {
  const SUPABASE_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-aKDZyBp1l5IRsGPmlGnsw_nPY_c827';
  const FUNCTION_URL = SUPABASE_URL + '/functions/v1/list-users';
  const originalFetch = window.fetch.bind(window);

  function getUrl(input) {
    return typeof input === 'string' ? input : (input && input.url) || '';
  }

  function getMethod(input, init) {
    return ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
  }

  function isUsersRead(input, init) {
    return getMethod(input, init) === 'GET' &&
      /\/rest\/v1\/admin_permissions\?select=\*/i.test(getUrl(input));
  }

  function getAuthHeader(input, init) {
    const headers = new Headers((init && init.headers) || (input && input.headers) || {});
    return headers.get('Authorization') || '';
  }

  async function loadAllUsers(input, init) {
    const authorization = getAuthHeader(input, init);
    if (!authorization) {
      throw new Error('Nema aktivne administratorske sesije.');
    }

    const res = await originalFetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': authorization
      },
      body: '{}'
    });

    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      throw new Error(data.error || ('Greška pri učitavanju korisnika (status ' + res.status + ').'));
    }

    return (data.users || []).map(function (u) {
      return {
        id: u.id,
        user_id: u.id,
        email: u.email || '',
        fullname: u.fullname || '',
        discord: u.discord || '',
        case_id: u.case_id || '',
        status: u.status || 'Nema prijave',
        created_at: u.created_at || null,
        is_admin: !!u.is_admin,
        is_super_admin: !!u.is_super_admin,
        can_view_applications: !!u.can_view_applications
      };
    });
  }

  window.fetch = async function (input, init) {
    if (isUsersRead(input, init)) {
      try {
        const users = await loadAllUsers(input, init);
        return new Response(JSON.stringify(users), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error('Settings users:', err);
        return new Response(JSON.stringify({ error: err.message || 'Greška' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return originalFetch(input, init);
  };
})();
