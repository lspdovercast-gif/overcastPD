/* OverCast RP — applicant access gate */
(function () {
  const SUPABASE_URL = 'https://rjusdokmtdnwvsuvxjow.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_-aKDZyBp1l5IRsGPmlGnsw_nPY_c827';
  const AUTH = SUPABASE_URL + '/auth/v1';
  const REST = SUPABASE_URL + '/rest/v1';
  const nativeFetch = window.fetch.bind(window);

  async function authRequest(path, body) {
    const r = await nativeFetch(AUTH + path, { method:'POST', headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY}, body:JSON.stringify(body) });
    const data = await r.json().catch(()=>({}));
    return {r,data};
  }
  async function getApplication(userId, token) {
    const r=await nativeFetch(REST+'/applications?user_id=eq.'+encodeURIComponent(userId)+'&select=id,status&limit=1',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(!r.ok)return null; const rows=await r.json().catch(()=>[]); return rows[0]||null;
  }
  async function getPermission(userId, token) {
    const r=await nativeFetch(REST+'/admin_permissions?user_id=eq.'+encodeURIComponent(userId)+'&select=is_admin,is_super_admin&limit=1',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});
    if(!r.ok)return null; const rows=await r.json().catch(()=>[]); return rows[0]||null;
  }
  function showApplyError(message){const el=document.getElementById('applyError');if(el){el.textContent=message;el.classList.add('show');}}

  async function createOrLogin(email,password){
    const signup=await authRequest('/signup',{email,password});
    if(signup.r.ok && signup.data.user){
      if(!signup.data.access_token) throw new Error('Nalog je napravljen. Potvrdi email koji ti je poslao Supabase, pa se prijavi.');
      return signup.data;
    }
    if(signup.r.status===429) throw new Error('Supabase je privremeno ograničio nove naloge. Sačekaj nekoliko minuta i pokušaj samo jednom.');
    const msg=signup.data.error_description||signup.data.msg||signup.data.message||'';
    if(/already registered|already exists|user exists|registered/i.test(msg)){
      const login=await authRequest('/token?grant_type=password',{email,password});
      if(!login.r.ok||!login.data.access_token) throw new Error(login.data.error_description||login.data.msg||'Postojeći nalog nije moguće prijaviti.');
      return login.data;
    }
    throw new Error(msg||('Supabase signup greška (status '+signup.r.status+').'));
  }

  function installApplicationHandler(){
    const form=document.getElementById('applyForm'); if(!form)return;
    form.addEventListener('submit',async function(e){
      e.preventDefault(); e.stopImmediatePropagation();
      const btn=document.getElementById('applyBtn'),body=document.getElementById('applyBody'),success=document.getElementById('applySuccess');
      if(btn){btn.disabled=true;btn.textContent='Slanje u toku...';}
      const fullname=document.getElementById('applyName')?.value.trim()||'',discord=document.getElementById('applyDiscord')?.value.trim()||'',age=document.getElementById('applyAge')?.value.trim()||'',goal=document.getElementById('applyGoal')?.value.trim()||'',experience=document.getElementById('applyExperience')?.value.trim()||'',motivation=document.getElementById('applyMotivation')?.value.trim()||'';
      const email=window.prompt('Unesi email za nalog:');
      if(!email){if(btn){btn.disabled=false;btn.textContent='Pošalji prijavu';}return;}
      const password=window.prompt('Unesi lozinku (minimum 6 znakova):');
      if(!password||password.length<6){showApplyError('Lozinka mora imati najmanje 6 znakova.');if(btn){btn.disabled=false;btn.textContent='Pošalji prijavu';}return;}
      try{
        const auth=await createOrLogin(email.trim().toLowerCase(),password);
        const res=await nativeFetch(REST+'/applications',{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,Authorization:'Bearer '+auth.access_token,Prefer:'return=minimal'},body:JSON.stringify({user_id:auth.user.id,case_id:'APP-'+Date.now().toString().slice(-6),fullname,discord,contact:discord,age,goal,experience,motivation,scenario:motivation,status:'Na čekanju'})});
        if(!res.ok){const detail=await res.text().catch(()=> '');console.error('Application insert:',res.status,detail);throw new Error('Greška pri čuvanju prijave (status '+res.status+').');}
        localStorage.setItem('overcast_access_token',auth.access_token);localStorage.setItem('overcast_user_id',auth.user.id);
        if(body)body.style.display='none'; if(success){success.style.display='block';const p=success.querySelector('p');if(p)p.textContent='Prijava je uspješno poslata. Status: Na čekanju. Kada bude prihvaćena, moći ćeš se prijaviti u LSPD panel.';}
      }catch(err){console.error(err);showApplyError(err.message||'Greška pri slanju prijave.');}
      finally{if(btn){btn.disabled=false;btn.textContent='Pošalji prijavu';}}
    },true);
  }

  window.OvercastAuthGate={getApplication,checkAccess:async function(){const token=localStorage.getItem('overcast_access_token');if(!token)return{loggedIn:false,allowed:false};const r=await nativeFetch(AUTH+'/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}});if(!r.ok)return{loggedIn:false,allowed:false};const user=await r.json(),perm=await getPermission(user.id,token),app=await getApplication(user.id,token),admin=!!(perm&&(perm.is_admin||perm.is_super_admin));return{loggedIn:true,allowed:admin||!!(app&&app.status==='Prihvaćena'),user,application:app};},logout:function(){localStorage.removeItem('overcast_access_token');localStorage.removeItem('overcast_user_id');location.reload();}};
  document.addEventListener('DOMContentLoaded',installApplicationHandler);
})();
