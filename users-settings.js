/* OverCast RP — Settings / Users bridge
   Loads ALL registered users from public.users.
   It keeps the existing index.html/login flow untouched. */
(function () {
  const SUPABASE_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-aKDZyBp1l5IRsGPmlGnsw_nPY_c827';
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

  async function getJson(path, authorization) {
    const res = await originalFetch(SUPABASE_URL + path, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': authorization
      }
    });
    const data = await res.json().catch(function () { return []; });
    if (!res.ok) {
      throw new Error('Supabase ' + res.status + ': ' + (data.message || data.error || 'Greška pri učitavanju'));
    }
    return data;
  }

  async function loadAllUsers(input, init) {
    const authorization = getAuthHeader(input, init);
    if (!authorization) throw new Error('Nema aktivne administratorske sesije.');

    const [users, permissions, applications] = await Promise.all([
      getJson('/rest/v1/users?select=id,email,created_at&order=created_at.desc', authorization),
      getJson('/rest/v1/admin_permissions?select=user_id,is_admin,is_super_admin,can_view_applications', authorization),
      getJson('/rest/v1/applications?select=user_id,fullname,discord,case_id,status', authorization)
    ]);

    const permissionMap = {};
    (permissions || []).forEach(function (p) { permissionMap[p.user_id] = p; });

    const applicationMap = {};
    (applications || []).forEach(function (a) { applicationMap[a.user_id] = a; });

    return (users || []).map(function (u) {
      const p = permissionMap[u.id] || {};
      const a = applicationMap[u.id] || {};
      return {
        id: u.id,
        user_id: u.id,
        email: u.email || '',
        fullname: a.fullname || '',
        discord: a.discord || '',
        case_id: a.case_id || '',
        status: a.status || 'Nema prijave',
        created_at: u.created_at || null,
        is_admin: !!p.is_admin,
        is_super_admin: !!p.is_super_admin,
        can_view_applications: !!p.can_view_applications
      };
    });
  }

  // Existing index.html still asks for admin_permissions. Replace only that READ.
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
