const db = window.supabaseClient;

function showAuthAlert(elementId, message, type = "error") {
    const box = document.getElementById(elementId);
    if (!box) return;
    box.textContent = message;
    box.className = `alert-box ${type}`;
}

// 1. Mise à jour de la barre de navigation selon la session active
async function refreshUserNavbar() {
    const navGuest = document.getElementById("nav-guest");
    const navUser = document.getElementById("nav-user");

    const { data: { session } } = await db.auth.getSession();

    if (!session) {
        if (navGuest) navGuest.style.display = "flex";
        if (navUser) navUser.style.display = "none";
        return null;
    }

    // Lecture du profil dans la table 'profiles' (SELECT public selon Archit_2.md)
    const { data: profile } = await db
        .from("profiles")
        .select("pseudo, filiere, points, prenom")
        .eq("id", session.user.id)
        .single();

    if (navGuest) navGuest.style.display = "none";
    if (navUser) {
        navUser.style.display = "flex";
        const meta = session.user.user_metadata || {};
        document.getElementById("user-pseudo").textContent = profile?.pseudo || meta.pseudo || "Joueur";
        document.getElementById("user-filiere").textContent = profile?.filiere || meta.filiere || "-";
        document.getElementById("user-points").textContent = profile?.points ?? 0;
    }

    return { session, profile };
}

// 2. Gestion de l'inscription (register.html)
const registerForm = document.getElementById("register-form");
if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("btn-register");
        btn.disabled = true;
        btn.textContent = "Création en cours...";

        const prenom = document.getElementById("prenom").value.trim();
        const nom = document.getElementById("nom").value.trim();
        const pseudo = document.getElementById("pseudo").value.trim();
        const filiere = document.getElementById("filiere").value;
        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;

        try {
            // Vérification préalable de l'unicité du pseudo
            const { data: existingPseudo } = await db
                .from("profiles")
                .select("id")
                .ilike("pseudo", pseudo)
                .maybeSingle();

            if (existingPseudo) {
                showAuthAlert("auth-message", "Ce pseudo est déjà pris par un autre joueur.", "error");
                return;
            }

            // Création dans auth.users : le trigger SQL 'on_auth_user_created' crée la ligne dans 'profiles'
            const { data, error } = await db.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        prenom,
                        nom,
                        pseudo,
                        filiere,
                        email
                    }
                }
            });

            if (error) {
                showAuthAlert("auth-message", error.message, "error");
                return;
            }

            if (data.session) {
                showAuthAlert("auth-message", "Compte créé avec succès ! Redirection vers le calendrier...", "success");
                setTimeout(() => window.location.href = "accueil.html", 1000);
            } else {
                showAuthAlert(
                    "auth-message",
                    "Inscription enregistrée ! Vérifie ta boîte mail pour confirmer ton compte avant de te connecter.",
                    "success"
                );
                registerForm.reset();
            }
        } catch (err) {
            showAuthAlert("auth-message", "Erreur réseau lors de l'inscription.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "S'inscrire 🎄";
        }
    });
}

// 3. Gestion de la connexion (login.html)
const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("btn-login");
        btn.disabled = true;
        btn.textContent = "Connexion...";

        const email = document.getElementById("email").value.trim().toLowerCase();
        const password = document.getElementById("password").value;

        try {
            const { error } = await db.auth.signInWithPassword({ email, password });

            if (error) {
                showAuthAlert("auth-message", "Email ou mot de passe incorrect (ou compte non confirmé).", "error");
                return;
            }

            showAuthAlert("auth-message", "Connexion réussie ! Redirection...", "success");
            setTimeout(() => window.location.href = "accueil.html", 700);
        } catch (err) {
            showAuthAlert("auth-message", "Impossible de joindre le serveur d'authentification.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Se connecter 🧦";
        }
    });
}

// 4. Déconnexion
const logoutBtn = document.getElementById("btn-logout");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
        await db.auth.signOut();
        window.location.href = "accueil.html";
    });
}

// Initialisation au chargement de chaque page
window.refreshUserNavbar = refreshUserNavbar;
document.addEventListener("DOMContentLoaded", refreshUserNavbar);