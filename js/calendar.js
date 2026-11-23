const supabaseCal = window.supabaseClient;

// ⚠️ Permet d'activer uniquement le Jour 1 dès aujourd'hui pour visualiser le rendu débloqué.
// Passe cette variable à `null` une fois les tests terminés pour n'utiliser que la règle J-7.
const PREVIEW_ACTIVE_DAY = 1;

const SLOT_ORDER = { matin: 1, midi: 2, aprem: 3, soir: 4 };
const SLOT_LABELS = {
    matin: "🌅 Matin (09h45 - 10h15)",
    midi: "☀️ Midi (12h - 14h)",
    aprem: "🌤️ Aprèm (15h45 - 16h15)",
    soir: "🌙 Soir (18h - 00h)"
};

function getSlotPosterCandidates(dayNumber, slot) {
    const cleanSlot = String(slot || "").trim().toLowerCase();
    const dayNames = [...new Set([String(dayNumber), String(dayNumber).padStart(2, "0")])];
    const extensions = ["jpg", "png", "jpeg", "webp"];
    const urls = [];

    for (const d of dayNames) {
        for (const ext of extensions) {
            urls.push(`../img/events/${d}-${cleanSlot}.${ext}`);
        }
    }
    return urls;
}

// Calcule la date de l'événement (1er au 19 déc 2026) et sa date d'activation (7 jours avant)
function getDaySchedule(dayNumber) {
    const eventDate = new Date(2026, 11, dayNumber, 0, 0, 0);      // Mois 11 = Décembre
    const unlockDate = new Date(2026, 11, dayNumber - 7, 0, 0, 0); // 1 semaine (7 jours) avant
    return { eventDate, unlockDate };
}

function formatFrenchDate(dateObj) {
    return dateObj.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
}

// Ouverture de la modale avec événements cliquables pour afficher tous leurs détails
function openDayModal(dayNumber, dayEvents, isUnlocked, unlockDate) {
    const modal = document.getElementById("day-modal");
    const titleEl = document.getElementById("modal-day-title");
    const container = document.getElementById("modal-slots-container");

    const { eventDate } = getDaySchedule(dayNumber);
    titleEl.textContent = `🧦 Jour ${dayNumber} — ${formatFrenchDate(eventDate)}`;

    if (!isUnlocked) {
        container.innerHTML = `
            <div class="locked-modal-info">
                <div style="font-size:2.4rem; margin-bottom:0.5rem;">🔒</div>
                <h3>Cette chaussette est encore fermée !</h3>
                <p style="margin-top:0.4rem; color:var(--text-muted);">
                    Conformément aux règles, cette journée s'activera automatiquement <strong>1 semaine avant</strong>, soit le :
                </p>
                <div class="unlock-date-badge">📅 ${formatFrenchDate(unlockDate)} à 00h00</div>
            </div>
        `;
        modal.classList.add("open");
        return;
    }

    if (!dayEvents || dayEvents.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);">Aucun événement renseigné pour cette journée pour le moment.</p>`;
        modal.classList.add("open");
        return;
    }

    const sorted = [...dayEvents].sort((a, b) => (SLOT_ORDER[a.slot] || 9) - (SLOT_ORDER[b.slot] || 9));

    container.innerHTML = `
        <p style="font-size:0.84rem; color:var(--text-muted); margin-bottom:0.85rem;">
            👆 Clique sur un événement ci-dessous pour afficher tous ses détails (lieu, description, affiche, gain de points).
        </p>
        ${sorted.map((ev, index) => `
            <article class="slot-item clickable-event" data-slot-index="${index}">
                <div class="slot-item-header">
                    <span class="slot-tag">${SLOT_LABELS[ev.slot] || ev.slot}</span>
                    <span class="slot-points">${ev.points_hint || "Points à gagner"}</span>
                </div>
                <div class="slot-title-row">
                    <h4>${ev.title}</h4>
                    <span class="expand-chevron">Détails ▾</span>
                </div>
                <div class="slot-details-drawer">
                    <p class="slot-desc">${ev.description || "Plus d'informations très bientôt sur @chau7.n7 !"}</p>
                    <div class="slot-poster-frame" style="display:none; margin:0.85rem auto; width:100%; max-width:260px; aspect-ratio:9/16; border-radius:14px; overflow:hidden; box-shadow:0 8px 20px rgba(0,0,0,0.18);">
                        <img class="slot-poster" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </div>
                    <div class="slot-meta-grid">
                        <span>📍 <strong>Lieu :</strong> ${ev.location || "Campus ENSEEIHT"}</span>
                        <span>📅 <strong>Date :</strong> ${ev.event_date || `2026-12-${String(dayNumber).padStart(2, "0")}`}</span>
                    </div>
                    <div class="slot-action-hint">
                        🎁 Un code secret ou QR code est distribué sur place ? Rentre-le dans l'encadré en haut de la page !
                    </div>
                </div>
            </article>
        `).join("")}
    `;

    container.querySelectorAll(".clickable-event").forEach((card, index) => {
        card.addEventListener("click", async () => {
            const wasOpen = card.classList.contains("expanded");
            container.querySelectorAll(".clickable-event").forEach((c) => c.classList.remove("expanded"));
            if (wasOpen) return;

            card.classList.add("expanded");
            if (card.dataset.posterChecked === "true") return;
            card.dataset.posterChecked = "true";

            const posterFrame = card.querySelector(".slot-poster-frame");
            const poster = card.querySelector(".slot-poster");
            if (!posterFrame || !poster) return;

            const candidates = getSlotPosterCandidates(dayNumber, sorted[index].slot);
            for (const url of candidates) {
                try {
                    const res = await fetch(url, { method: "HEAD" });
                    if (res.ok) {
                        poster.alt = `Visuel de l'événement ${sorted[index].title || "Chau7"}`;
                        poster.src = url;
                        posterFrame.style.display = "block";
                        return;
                    }
                } catch (e) {}
            }

            posterFrame.remove();
        });
    });

    modal.classList.add("open");
}

// Chargement de la grille des 19 jours depuis Supabase
async function loadAdventCalendar() {
    const grid = document.getElementById("calendar-grid");
    if (!grid) return;

    const { data: eventsData, error } = await supabaseCal
        .from("advent_events")
        .select("day_number, slot, event_date, title, description, location, points_hint, is_revealed");

    const eventsByDay = {};
    if (!error && eventsData) {
        eventsData.forEach((ev) => {
            if (!eventsByDay[ev.day_number]) eventsByDay[ev.day_number] = [];
            eventsByDay[ev.day_number].push(ev);
        });
    }
    const now = new Date();
    const patterns = ["snowflake", "dots", "stripes"];
    grid.innerHTML = "";

    for (let day = 1; day <= 19; day++) {
        const { eventDate, unlockDate } = getDaySchedule(day);
        const dayEvents = eventsByDay[day] || [];

        const isUnlocked = dayEvents.some((ev) => ev.is_revealed) || day === PREVIEW_ACTIVE_DAY;
        const isToday = now.toDateString() === eventDate.toDateString();

        const card = document.createElement("article");
        card.className = `day-card ${isUnlocked ? "unlocked" : "locked"} ${isToday ? "today" : ""}`;
        card.dataset.day = day;

        const sockSvg = window.createSockSVG(
            62, 72,
            isUnlocked ? "#c82323" : "#991b1b",
            "#fbf6eb",
            isUnlocked ? "#175235" : "#f5b041",
            isUnlocked ? "OUVERT" : "",
            patterns[day % 3]
        );

        if (isUnlocked) {
            const firstTitle = dayEvents[0]?.title || "Événements débloqués";
            const badgesHtml = dayEvents
                .sort((a, b) => (SLOT_ORDER[a.slot] || 9) - (SLOT_ORDER[b.slot] || 9))
                .map((ev) => `<span class="badge">${ev.slot}</span>`)
                .join("");

            card.innerHTML = `
                <div class="day-top">
                    <span class="day-number">${day}</span>
                    <span class="day-date">${day} déc. • Actif</span>
                </div>
                <div class="day-illustration">${sockSvg}</div>
                <div class="day-title">${firstTitle}</div>
                <div class="slot-badges">${badgesHtml || '<span class="badge">Voir</span>'}</div>
            `;
        } else {
            const unlockShort = unlockDate.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
            card.innerHTML = `
                <div class="day-top">
                    <span class="day-number">${day}</span>
                    <span class="day-date">${day} déc.</span>
                </div>
                <div class="day-illustration">${sockSvg}</div>
                <div class="day-unlock-row">
                    <div class="day-title">Ouverture le ${unlockShort}</div>
                    <span class="lock-badge" title="Déblocage 7 jours avant">🔒</span>
                </div>
            `;
        }

        card.addEventListener("click", (e) => {
            if (window.burstMagic) window.burstMagic(e.clientX, e.clientY);
            openDayModal(day, dayEvents, isUnlocked, unlockDate);
        });

        grid.appendChild(card);
    }
}

// Validation d'un code secret / QR code via fonction RPC sécurisée
const codeForm = document.getElementById("secret-code-form");
if (codeForm) {
    codeForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById("code-message");
        const input = document.getElementById("secret-code-input");
        const btn = document.getElementById("btn-submit-code");
        const codeValue = input.value.trim().toUpperCase();

        if (!codeValue) return;

        const { data: { session } } = await supabaseCal.auth.getSession();
        if (!session) {
            msgBox.textContent = "Connecte-toi d'abord à ton compte pour enregistrer tes points !";
            msgBox.className = "alert-box error";
            return;
        }

        btn.disabled = true;
        btn.textContent = "Vérification...";

        try {
            // Appel de la fonction RPC PostgreSQL côté Supabase
            const { data, error } = await supabaseCal.rpc("claim_event_code", {
                input_code: codeValue
            });

            if (error) {
                msgBox.textContent = error.message || "Code invalide, expiré ou déjà utilisé.";
                msgBox.className = "alert-box error";
            } else {
                msgBox.textContent = data?.message || `Bravo ! Code ${codeValue} validé, tes points ont été ajoutés ! 🎉`;
                msgBox.className = "alert-box success";
                input.value = "";
                if (window.refreshUserNavbar) await window.refreshUserNavbar();
                await loadSidebarWidgets();
            }
        } catch (err) {
            msgBox.textContent = "Erreur lors de la validation du code.";
            msgBox.className = "alert-box error";
        } finally {
            btn.disabled = false;
            btn.textContent = "Valider 🧦";
        }
    });
}

// Chargement du mini-podium et des derniers logs dans la barre latérale de accueil.html
async function loadSidebarWidgets() {
    const top1El = document.getElementById("sidebar-top1");
    if (!top1El) return;

    const { data: topUsers } = await supabaseCal
        .from("profiles")
        .select("pseudo, points")
        .order("points", { ascending: false })
        .limit(3);

    if (topUsers) {
        if (topUsers[0]) document.getElementById("sidebar-top1").textContent = `${topUsers[0].pseudo} (${topUsers[0].points})`;
        if (topUsers[1]) document.getElementById("sidebar-top2").textContent = `${topUsers[1].pseudo} (${topUsers[1].points})`;
        if (topUsers[2]) document.getElementById("sidebar-top3").textContent = `${topUsers[2].pseudo} (${topUsers[2].points})`;
    }

    const logsList = document.getElementById("sidebar-logs-list");
    const { data: logs } = await supabaseCal
        .from("point_logs")
        .select("reason, points_delta, profiles(pseudo)")
        .order("created_at", { ascending: false })
        .limit(5);

    if (logs && logs.length > 0 && logsList) {
        logsList.innerHTML = logs.map((log) => `
            <li class="log-item">
                <span><strong>${log.profiles?.pseudo || "Joueur"}</strong> — ${log.reason}</span>
                <span class="log-points">+${log.points_delta} pts 🧦</span>
            </li>
        `).join("");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadAdventCalendar();
    loadSidebarWidgets();
});