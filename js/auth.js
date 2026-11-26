const db = window.supabaseClient;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showAuthAlert(elementId, message, type = "error") {
    const box = document.getElementById(elementId);
    if (!box) return;
    box.textContent = message;
    box.className = `alert-box ${type}`;
}

// Injecte la modale de profil une seule fois dans la page (fonctionne sur toutes les pages)
function ensureProfileModal() {
    if (document.getElementById("user-profile-modal")) return;

    const modalHtml = `
        <div id="user-profile-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
            <div class="modal-box profile-modal-box">
                <div class="modal-header">
                    <h2 id="profile-modal-title">🎅 Mon Profil Chau7</h2>
                    <button type="button" id="btn-close-profile-modal" class="btn-close">Fermer ✕</button>
                </div>
                <div id="profile-modal-body">
                    <p style="text-align:center; color:var(--text-muted); padding:1.5rem 0;">Chargement de ton profil...</p>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const modal = document.getElementById("user-profile-modal");
    const closeBtn = document.getElementById("btn-close-profile-modal");

    closeBtn.addEventListener("click", () => modal.classList.remove("open"));
    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("open");
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("open")) {
            modal.classList.remove("open");
        }
    });
}

// Ouvre la modale et charge toutes les informations du joueur connecté
async function openUserProfileModal() {
    ensureProfileModal();
    const modal = document.getElementById("user-profile-modal");
    const bodyEl = document.getElementById("profile-modal-body");

    bodyEl.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:1.5rem 0;">Chargement de tes informations... 🧦</p>`;
    modal.classList.add("open");

    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        modal.classList.remove("open");
        return;
    }

    const userId = session.user.id;
    const meta = session.user.user_metadata || {};

    // Requêtes parallèles : profil complet, classement global pour le rang, et logs personnels
    const [profileRes, rankingRes, logsRes] = await Promise.all([
        db.from("profiles")
            .select("prenom, nom, pseudo, filiere, email, points, current_streak, created_at")
            .eq("id", userId)
            .single(),
        db.from("profiles")
            .select("id, points")
            .order("points", { ascending: false }),
        db.from("point_logs")
            .select("reason, points_delta, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(15)
    ]);

    const p = profileRes.data || {};
    const pseudo = p.pseudo || meta.pseudo || "Joueur";
    const prenom = p.prenom || meta.prenom || "-";
    const nom = p.nom || meta.nom || "-";
    const filiere = p.filiere || meta.filiere || "-";
    const email = p.email || session.user.email || "-";
    const points = p.points ?? 0;
    const streak = p.current_streak ?? 0;

    // Calcul du rang dans le classement général
    const allPlayers = rankingRes.data || [];
    const rankIndex = allPlayers.findIndex((item) => item.id === userId);
    const rankDisplay = rankIndex !== -1 ? `#${rankIndex + 1} / ${allPlayers.length}` : "-";

    // Formatage de la date d'inscription
    const createdAtStr = p.created_at
        ? new Date(p.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "Novembre 2026";

    // Historique personnel des points
    const logs = logsRes.data || [];
    const logsHtml = logs.length === 0
        ? `<li class="log-item" style="color:var(--text-muted);">Aucun point enregistré pour l'instant. Valide un code secret sur l'accueil !</li>`
        : logs.map((log) => {
            const d = new Date(log.created_at).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
            });
            return `
                <li class="log-item">
                    <div>
                        <strong>${escapeHtml(log.reason)}</strong>
                        <div style="font-size:0.78rem; color:var(--text-muted);">${d}</div>
                    </div>
                    <span class="log-points">${log.points_delta >= 0 ? "+" : ""}${log.points_delta} pts 🧦</span>
                </li>
            `;
        }).join("");

    bodyEl.innerHTML = `
        <div class="profile-hero-banner">
            <div class="profile-avatar">🧦</div>
            <div>
                <div class="profile-pseudo-row">
                    <h3>${escapeHtml(pseudo)}</h3>
                    <span class="filiere-badge">${escapeHtml(filiere)}</span>
                </div>
                <p style="font-size:0.86rem; color:var(--text-muted);">${escapeHtml(prenom)} ${escapeHtml(nom)}</p>
            </div>
        </div>

        <div class="profile-stats-grid">
            <div class="profile-stat-card">
                <span class="stat-label">Score total</span>
                <strong class="stat-value" style="color:var(--red);">${points} pts</strong>
            </div>
            <div class="profile-stat-card">
                <span class="stat-label">Classement</span>
                <strong class="stat-value" style="color:var(--pine-dark);">${rankDisplay}</strong>
            </div>
            <div class="profile-stat-card">
                <span class="stat-label">Série active</span>
                <strong class="stat-value" style="color:var(--gold);">${streak} j 🔥</strong>
            </div>
        </div>

        <div class="profile-info-box">
            <div class="profile-info-row">
                <span>👤 <strong>Identité :</strong></span>
                <span>${escapeHtml(prenom)} ${escapeHtml(nom)}</span>
            </div>
            <div class="profile-info-row">
                <span>🎓 <strong>Filière N7 :</strong></span>
                <span>${escapeHtml(filiere)}</span>
            </div>
            <div class="profile-info-row">
                <span>📧 <strong>Email :</strong></span>
                <span>${escapeHtml(email)}</span>
            </div>
            <div class="profile-info-row">
                <span>📅 <strong>Inscrit le :</strong></span>
                <span>${createdAtStr}</span>
            </div>
        </div>

        <div class="profile-history-section">
            <h4>📜 Mes derniers gains de points</h4>
            <ul class="log-list">${logsHtml}</ul>
        </div>
    `;
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

    const { data: profile } = await db
        .from("profiles")
        .select("pseudo, filiere, points, prenom")
        .eq("id", session.user.id)
        .single();

    if (navGuest) navGuest.style.display = "none";
    if (navUser) {
        navUser.style.display = "flex";
        const meta = session.user.user_metadata || {};

        const pseudoEl = document.getElementById("user-pseudo") || document.getElementById("user-identifiant");
        if (pseudoEl) pseudoEl.textContent = profile?.pseudo || meta.pseudo || "Joueur";
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

        const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
        if (!turnstileToken) {
            showAuthAlert("auth-message", "Veuillez valider la vérification anti-robot.", "error");
            btn.disabled = false;
            btn.textContent = "S'inscrire 🎄";
            return;
        }

        try {
            const { data: existingPseudo } = await db
                .from("profiles")
                .select("id")
                .ilike("pseudo", pseudo)
                .maybeSingle();

            if (existingPseudo) {
                showAuthAlert("auth-message", "Ce pseudo public est déjà pris par un autre joueur.", "error");
                return;
            }

            const { data, error } = await db.auth.signUp({
                email,
                password,
                options: {
                    captchaToken: turnstileToken,
                    data: {
                        prenom,
                        nom,
                        filiere,
                        pseudo
                    }
                }
            });

            if (error) {
                showAuthAlert("auth-message", error.message, "error");
                return;
            }

            if (data.session) {
                showAuthAlert("auth-message", "Compte créé avec succès ! Redirection vers ton profil...", "success");
                setTimeout(() => window.location.href = "profile.html", 1000);
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

        const turnstileToken = document.querySelector('[name="cf-turnstile-response"]')?.value;
        if (!turnstileToken) {
            showAuthAlert("auth-message", "Veuillez valider la vérification anti-robot.", "error");
            btn.disabled = false;
            btn.textContent = "Se connecter 🧦";
            return;
        }

        try {
            const { error } = await db.auth.signInWithPassword({
                email,
                password,
                options: {
                    captchaToken: turnstileToken
                }
            });

                        if (error) {
                let msg = `Erreur : ${error.message}`;
                const resendBox = document.getElementById("resend-box");
                if (error.message.includes("Email not confirmed")) {
                    msg = "Compte non confirmé : clique sur le lien reçu par mail avant de te connecter.";
                    if (resendBox) resendBox.style.display = "block";
                } else {
                    if (resendBox) resendBox.style.display = "none";
                    if (error.message.includes("Invalid login credentials")) {
                        msg = "Email ou mot de passe incorrect.";
                    }
                }
                showAuthAlert("auth-message", msg, "error");
                return;
            }

            showAuthAlert("auth-message", "Connexion réussie ! Redirection vers ton profil...", "success");
            setTimeout(() => window.location.href = "profile.html", 700);
        } catch (err) {
            showAuthAlert("auth-message", "Impossible de joindre le serveur d'authentification.", "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Se connecter 🧦";
        }
    });
}

/// 4. Renvoi de l'email de confirmation (login.html)
const resendBtn = document.getElementById("btn-resend");
if (resendBtn) {
    resendBtn.addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim().toLowerCase();
        if (!email) {
            showAuthAlert("auth-message", "Saisis d'abord ton adresse email dans le formulaire.", "error");
            return;
        }
        resendBtn.disabled = true;
        resendBtn.textContent = "Envoi en cours...";
        try {
            const { error } = await db.auth.resend({
                type: "signup",
                email,
                options: {
                    captchaToken: document.querySelector('[name="cf-turnstile-response"]')?.value
                }
            });
            if (error) {
                showAuthAlert("auth-message", `Erreur lors du renvoi : ${error.message}`, "error");
            } else {
                showAuthAlert("auth-message", "Email de confirmation renvoyé ! Vérifie ta boîte de réception (et les spams). 📧", "success");
            }
        } catch (err) {
            showAuthAlert("auth-message", "Erreur réseau lors du renvoi de l'email.", "error");
        } finally {
            resendBtn.disabled = false;
            resendBtn.textContent = "Renvoyer l'email de confirmation 📧";
        }
    });
}

// 5. Mot de passe oublié (login.html)
const forgotBtn = document.getElementById("btn-forgot-password");
if (forgotBtn) {
    forgotBtn.addEventListener("click", async () => {
        const email = document.getElementById("email").value.trim().toLowerCase();
        if (!email) {
            showAuthAlert("auth-message", "Saisis d'abord ton adresse email dans le formulaire, puis clique sur 'Mot de passe oublié'.", "error");
            return;
        }
        forgotBtn.disabled = true;
        forgotBtn.textContent = "Envoi en cours...";
        try {
            const { error } = await db.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/html/profile.html",
                captchaToken: document.querySelector('[name="cf-turnstile-response"]')?.value
            });
            if (error) {
                showAuthAlert("auth-message", `Erreur : ${error.message}`, "error");
            } else {
                showAuthAlert("auth-message", "Email de réinitialisation envoyé ! Vérifie ta boîte de réception (et les spams). 🔑", "success");
            }
        } catch (err) {
            showAuthAlert("auth-message", "Erreur réseau lors de l'envoi.", "error");
        } finally {
            forgotBtn.disabled = false;
            forgotBtn.textContent = "Mot de passe oublié ? 🔑";
        }
    });
}

// 6. Changement de mot de passe + email (profile.html)
const btnChangePw = document.getElementById("btn-change-password");
const btnChangeEmail = document.getElementById("btn-change-email");
const accountForm = document.getElementById("account-form");
const passwordFields = document.getElementById("password-fields");
const emailFields = document.getElementById("email-fields");
const profileMessage = document.getElementById("profile-message");

function showProfileMsg(text, type) {
    if (!profileMessage) return;
    profileMessage.textContent = text;
    profileMessage.className = `profile-message visible ${type}`;
}

if (btnChangePw && accountForm) {
    btnChangePw.addEventListener("click", () => {
        const opening = accountForm.style.display === "none";
        accountForm.style.display = opening ? "block" : "none";
        passwordFields.style.display = opening ? "block" : "none";
        emailFields.style.display = "none";
    });
}

if (btnChangeEmail && accountForm) {
    btnChangeEmail.addEventListener("click", () => {
        const opening = accountForm.style.display === "none";
        accountForm.style.display = opening ? "block" : "none";
        emailFields.style.display = opening ? "block" : "none";
        passwordFields.style.display = "none";
    });
}

const btnSavePw = document.getElementById("btn-save-password");
if (btnSavePw) {
    btnSavePw.addEventListener("click", async () => {
        const newPw = document.getElementById("new-password").value;
        if (!newPw || newPw.length < 6) {
            showProfileMsg("Le mot de passe doit faire au moins 6 caractères.", "error");
            return;
        }
        btnSavePw.disabled = true;
        btnSavePw.textContent = "Enregistrement...";
        try {
            const { error } = await db.auth.updateUser({ password: newPw });
            if (error) {
                showProfileMsg(`Erreur : ${error.message}`, "error");
            } else {
                showProfileMsg("Mot de passe modifié avec succès ! 🔑", "success");
                document.getElementById("new-password").value = "";
                accountForm.style.display = "none";
            }
        } catch (err) {
            showProfileMsg("Erreur réseau lors du changement de mot de passe.", "error");
        } finally {
            btnSavePw.disabled = false;
            btnSavePw.textContent = "Enregistrer le nouveau mot de passe";
        }
    });
}

const btnSaveEmail = document.getElementById("btn-save-email");
if (btnSaveEmail) {
    btnSaveEmail.addEventListener("click", async () => {
        const newEmail = document.getElementById("new-email").value.trim().toLowerCase();
        if (!newEmail || !newEmail.includes("@")) {
            showProfileMsg("Saisis une adresse e-mail valide.", "error");
            return;
        }
        btnSaveEmail.disabled = true;
        btnSaveEmail.textContent = "Envoi en cours...";
        try {
            const { error } = await db.auth.updateUser({ email: newEmail });
            if (error) {
                showProfileMsg(`Erreur : ${error.message}`, "error");
            } else {
                showProfileMsg("Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour valider le changement. 📧", "success");
                document.getElementById("new-email").value = "";
            }
        } catch (err) {
            showProfileMsg("Erreur réseau lors du changement d'email.", "error");
        } finally {
            btnSaveEmail.disabled = false;
            btnSaveEmail.textContent = "Envoyer la confirmation à la nouvelle adresse";
        }
    });
}

// 7. Déconnexion
const logoutBtn = document.getElementById("btn-logout");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await db.auth.signOut();
        window.location.href = "accueil.html";
    });
}

window.refreshUserNavbar = refreshUserNavbar;
window.openUserProfileModal = openUserProfileModal;
document.addEventListener("DOMContentLoaded", refreshUserNavbar);