const supabaseLb = window.supabaseClient;
let allProfiles = [];

function renderLeaderboard(filiereFilter = "ALL") {
    const tbody = document.getElementById("leaderboard-body");
    if (!tbody) return;

    const filtered = filiereFilter === "ALL"
        ? allProfiles
        : allProfiles.filter((p) => p.filiere === filiereFilter);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">Aucun joueur inscrit dans cette filière pour le moment.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map((player, index) => `
        <tr>
            <td><strong>#${index + 1}</strong></td>
            <td>${player.pseudo}</td>
            <td><span class="filiere-badge">${player.filiere}</span></td>
            <td><strong>${player.points} pts</strong> 🧦</td>
        </tr>
    `).join("");
}

async function initLeaderboardPage() {
    const { data: profiles } = await supabaseLb
        .from("profiles")
        .select("id, pseudo, filiere, points")
        .order("points", { ascending: false });

    allProfiles = profiles || [];

    // Remplissage du Podium Top 3 général
    [1, 2, 3].forEach((rank) => {
        const p = allProfiles[rank - 1];
        if (!p) return;
        const idEl = document.getElementById(`top${rank}-pseudo`);
        const filEl = document.getElementById(`top${rank}-filiere`);
        const ptsEl = document.getElementById(`top${rank}-points`);
        if (idEl) idEl.textContent = p.pseudo;
        if (filEl) filEl.textContent = p.filiere;
        if (ptsEl) ptsEl.textContent = p.points;
    });

    renderLeaderboard("ALL");

    // Filtres par filière (Archit_2.md : 3EA, SN, MF2E, FISA, Autre)
    document.querySelectorAll("#filiere-filters .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll("#filiere-filters .filter-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderLeaderboard(btn.dataset.filiere);
        });
    });

    // Journal public transparent 'point_logs'
    const logsList = document.getElementById("point-logs-list");
    if (logsList) {
        const { data: logs } = await supabaseLb
            .from("point_logs")
            .select("reason, points_delta, created_at, profiles(pseudo, filiere)")
            .order("created_at", { ascending: false })
            .limit(25);

        if (!logs || logs.length === 0) {
            logsList.innerHTML = `<li class="log-item" style="color:var(--text-muted);">Aucun gain de points enregistré pour le moment.</li>`;
        } else {
            logsList.innerHTML = logs.map((log) => {
                const dateStr = new Date(log.created_at).toLocaleString("fr-FR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                });
                return `
                    <li class="log-item">
                        <div>
                            <strong>${log.profiles?.pseudo || "Joueur"}</strong>
                            <span class="filiere-badge">${log.profiles?.filiere || "-"}</span>
                            <div style="color:var(--text-muted); font-size:0.8rem;">${log.reason} • ${dateStr}</div>
                        </div>
                        <span class="log-points">${log.points_delta >= 0 ? "+" : ""}${log.points_delta} pts 🧦</span>
                    </li>
                `;
            }).join("");
        }
    }
}

document.addEventListener("DOMContentLoaded", initLeaderboardPage);