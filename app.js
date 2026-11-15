/* ==============================================================================
   CHAU7 CALENDRIER DE L'AVENT - MULTI-PAGE APP LOGIC
   ============================================================================== */

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('DOMContentLoaded', async () => {
    initSnow();
    const { data: { session } } = await supabase.auth.getSession();
    const path = window.location.pathname;

    if (path.includes('profile.html')) {
        if (!session) {
            window.location.href = 'login.html';
            return;
        }
        loadProfileData(session.user);
    } else if (path.includes('calendar.html')) {
        loadCalendar();
    }

    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.onsubmit = handleAuthSubmit;
    }
});

function initSnow() {
    const snowContainer = document.createElement('div');
    snowContainer.className = 'fixed inset-0 pointer-events-none z-30 overflow-hidden';
    document.body.appendChild(snowContainer);
    const chars = ['❄', '❅', '❆', '✨', '⭐'];
    for (let i = 0; i < 25; i++) {
        const span = document.createElement('span');
        span.className = 'snowflake';
        span.innerText = chars[Math.floor(Math.random() * chars.length)];
        span.style.left = Math.random() * 100 + 'vw';
        span.style.animationDuration = (Math.random() * 5 + 3) + 's';
        snowContainer.appendChild(span);
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const pseudo = document.getElementById('auth-pseudo').value;
    const isRegister = document.getElementById('auth-form-title').innerText.includes('INSCRIPTION');

    if (isRegister) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { alert(error.message); return; }
        await supabase.from('profiles').insert([{ id: data.user.id, email, pseudo, points: 0 }]);
        alert('Compte créé ! Connecte-toi.');
        toggleAuthMode();
    } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { alert(error.message); return; }
        window.location.href = 'calendar.html';
    }
}

async function loadProfileData(user) {
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!profile) return;

    document.getElementById('profile-pseudo').innerText = profile.pseudo;
    document.getElementById('profile-email').innerText = profile.email;
    document.getElementById('profile-points').innerText = profile.points;

    if (profile.points === 0) {
        document.getElementById('profile-rank').innerText = 'Non classé';
    } else {
        const { data: allProfiles } = await supabase.from('profiles').select('id, points').order('points', { ascending: false });
        const rank = allProfiles.findIndex(p => p.id === user.id) + 1;
        document.getElementById('profile-rank').innerText = #;
    }
}

async function loadCalendar() {
    const { data } = await supabase.from('advent_events').select('*').order('day_number', { ascending: true });
    const grid = document.getElementById('calendar-grid');
    if (!grid || !data) return;

    grid.innerHTML = data.map(ev => 
        <div class="card-festive rounded-xl p-3 text-center aspect-square flex flex-col items-center justify-center ">
            <span class="text-xl font-bold"></span>
            <span class="text-[10px] mt-1"></span>
        </div>
    ).join('');
}

function toggleAuthMode() {
    const title = document.getElementById('auth-form-title');
    const isReg = title.innerText.includes('CONNEXION');
    title.innerText = isReg ? 'INSCRIPTION DE NOËL' : 'CONNEXION DE NOËL';
    document.getElementById('pseudo-field-wrapper').classList.toggle('hidden', !isReg);
    document.getElementById('auth-toggle-btn').innerText = isReg ? 'Déjà un compte ? Se connecter' : 'Pas encore de compte ?';
}

function handleLogout() {
    supabase.auth.signOut();
    window.location.href = 'login.html';
}
