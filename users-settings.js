/* OverCast RP — Settings / Users list
   Uses the secure Supabase Edge Function list-users.
   No service-role key is ever exposed here. */
(function () {
  const FUNCTION_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co/functions/v1/list-users';

  function getAccessToken() {
    // Supabase stores the browser session in a localStorage entry like:
    // sb-<project-ref>-auth-token
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (!key.includes('auth-token')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value && value.access_token) return value.access_token;
      } catch (_) {}
    }
    return null;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, function (c) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function findBody() {
    return document.getElementById('adminUsersBody');
  }

  function renderUsers(users) {
    const body = findBody();
    if (!body) return;

    if (!users.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:25px;">Nema registrovanih korisnika.</td></tr>';
      return;
    }

    body.innerHTML = users.map(function (u) {
      const admin = u.is_super_admin ? '👑 Super Admin' : (u.is_admin ? '🛡️ Admin' : '—');
      return '<tr data-id="' + esc(u.id) + '">' +
        '<td>' + esc(u.email || '—') + '</td>' +
        '<td>' + esc(u.fullname || '—') + '</td>' +
        '<td>' + esc(u.discord || '—') + '</td>' +
        '<td>' + esc(u.status || 'Nema prijave') + '</td>' +
        '<td>' + admin + '</td>' +
        '<td>' + esc(u.created_at ? new Date(u.created_at).toLocaleDateString('sr-Latn-ME') : '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  async function loadUsers() {
    const body = findBody();
    const status = document.getElementById('adminUsersStatusRow');
    if (!body) return;

    if (status) status.textContent = 'Učitavanje svih korisnika...';

    const token = getAccessToken();
    if (!token) {
      if (status) status.textContent = 'Nema aktivne sesije.';
      return;
    }

    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || ('Greška pri učitavanju (status ' + res.status + ').'));

      const users = data.users || [];
      renderUsers(users);
      if (status) status.textContent = 'Ukupno registrovanih korisnika: ' + users.length;
    } catch (err) {
      console.error('list-users:', err);
      if (status) status.textContent = err.message || 'Greška pri učitavanju korisnika.';
    }
  }

  function start() {
    if (!findBody()) return;

    // Load once after the existing page has initialized its Settings UI.
    setTimeout(loadUsers, 500);

    // When the Settings tab is opened, refresh the list.
    document.addEventListener('click', function (e) {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      setTimeout(function () {
        if (findBody()) loadUsers();
      }, 350);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
