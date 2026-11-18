# Architecture & Spécifications SQL — Calendrier de l'Avent Chau7

Ce document détaille la structure exacte de la base de données **Supabase (PostgreSQL)** et les appels SDK (`@supabase/supabase-js`) à utiliser côté front-end.

> **Règle d'or :** Le front-end n'effectue **aucune écriture directe** (`INSERT`, `UPDATE`, `DELETE`) sur les tables. Tout est sécurisé par RLS (Row Level Security) et passe exclusivement par `supabase.auth` ou par les fonctions serveur `supabase.rpc(...)`.

---

## 1. Structure des Tables

### A. `profiles` (Comptes joueurs & Streak)

Créée automatiquement par un trigger SQL lors de l'inscription d'un utilisateur.

| Colonne | Type | Contraintes | Description & Usage Front-end |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` (FK `auth.users`) | ID unique de l'utilisateur |
| `prenom` | `TEXT` | `NOT NULL` | Prénom de l'étudiant |
| `nom` | `TEXT` | `NOT NULL` | Nom de famille |
| `filiere` | `TEXT` | `NOT NULL` | Filière N7 (`SN`, `MF2E`, `3EA`, `FISA`, `Autre`) |
| `pseudo` | `TEXT` | `UNIQUE`, `NOT NULL` | Pseudo affiché dans le classement (Leaderboard) |
| `email` | `TEXT` | `UNIQUE`, `NOT NULL` | Email utilisé pour la connexion |
| `points` | `INT` | `DEFAULT 0` | Score total du joueur (calculé automatiquement) |
| `current_streak` | `INT` | `DEFAULT 0` | Nombre de jours consécutifs de check-in |
| `last_checkin_date` | `DATE` | `NULLABLE` | Date du dernier check-in (`YYYY-MM-DD`) — sert à griser le bouton si égal à aujourd'hui |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Date d'inscription |

### B. `advent_events` (Planning du 1er au 19 décembre 2026)

Contient jusqu'à **4 créneaux par jour**. Les images associées sont hébergées dans le dépôt Git (ex: `/events/01-matin.jpg`) pour préserver la bande passante.

| Colonne | Type | Contraintes | Description & Usage Front-end |
| :--- | :--- | :--- | :--- |
| `day_number` | `INT` | `CHECK (1..19)` | Numéro de la case du calendrier (1 à 19) |
| `slot` | `TEXT` | `CHECK ('matin', 'midi', 'aprem', 'soir')` | Créneau horaire strict |
| **`(day_number, slot)`** | — | **`PRIMARY KEY`** | Clé primaire composite |
| `event_date` | `DATE` | `GENERATED` (`2026-12-01` + `day_number - 1`) | Date réelle calculée automatiquement |
| `title` | `TEXT` | `NOT NULL` | Titre de l'animation |
| `description` | `TEXT` | `NULLABLE` | Détail de l'événement |
| `location` | `TEXT` | `NULLABLE` | Lieu (`Foyer N7`, `Insta @chau7.n7`, `Toulouse`...) |
| `points_hint` | `TEXT` | `NULLABLE` | Teasing des points à gagner (affichable même si verrouillé) |
| `secret_code` | `TEXT` | `UNIQUE`, `NOT NULL` | **⚠️ Colonne masquée (`REVOKE SELECT`)** : invisible côté client pour éviter la triche dans l'inspecteur |
| `points_reward` | `INT` | `DEFAULT 0` | Points rapportés par le code de l'event |
| `is_revealed` | `BOOLEAN` | `DEFAULT FALSE` | `true` = contenu visible ; `false` = case verrouillée (`🔒`) |

### C. `point_logs` (Historique transparent des gains)

Trace chaque point gagné (code event, check-in quotidien ou récompense manuelle) et empêche les doublons.

| Colonne | Type | Contraintes | Description & Usage Front-end |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Identifiant unique du log |
| `user_id` | `UUID` | `NOT NULL` (FK `profiles.id`) | Joueur concerné |
| `event_code` | `TEXT` | `NULLABLE` | Code de l'event validé (`NULL` si check-in ou gain manuel) |
| `reason` | `TEXT` | `NOT NULL` | Libellé lisible affiché dans l'historique du joueur |
| `points_delta` | `INT` | `NOT NULL` | Nombre de points gagnés |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Date et heure exactes du gain |
| **`(user_id, event_code)`** | — | **`UNIQUE`** | Empêche de valider 2 fois le même event |

---

## 2. Intégration SDK Front-end (`@supabase/supabase-js`)

### 1. Inscription (`signUp`)

Il est impératif de passer `prenom`, `nom`, `filiere` et `pseudo` dans `options.data` pour que le trigger SQL crée correctement la ligne dans `profiles`.

```javascript
const { data, error } = await supabase.auth.signUp({
  email: email,
  password: password,
  options: {
    data: {
      prenom: prenom,
      nom: nom,
      filiere: filiere, // 'SN', 'MF2E', '3EA', 'FISA', 'Autre'
      pseudo: pseudo
    }
  }
});
```

### 2. Lecture des données (Calendrier, Classement, Historique)

Toutes ces requêtes sont autorisées en lecture publique (`SELECT`) :

```javascript
// Récupérer les événements (remarque : secret_code n'est pas renvoyé par sécurité)
const { data: events } = await supabase
  .from('advent_events')
  .select('day_number, slot, event_date, title, description, location, points_hint, points_reward, is_revealed')
  .order('day_number', { ascending: true });

// Récupérer le classement (Leaderboard)
const { data: leaderboard } = await supabase
  .from('profiles')
  .select('id, pseudo, filiere, points, current_streak')
  .order('points', { ascending: false });

// Récupérer l'historique des points d'un joueur (transparence totale)
const { data: logs } = await supabase
  .from('point_logs')
  .select('reason, points_delta, created_at')
  .eq('user_id', userId)
  .order('created_at', { ascending: false });
```

### 3. Valider le code secret d'un événement (`claim_event_code`)

Utilisé pour le champ de saisie manuelle **et** pour la détection automatique d'un QR code dans l'URL (`?code=XXXX`).

* Le code n'est valide **que le jour même de l'événement** (expire automatiquement à `23h59` heure de Paris).
* Renvoie toujours un objet JSON `{ success: boolean, message: string, points?: number }`.

```javascript
const { data, error } = await supabase.rpc('claim_event_code', {
  input_code: code
});

if (data.success) {
  // Afficher toast succès : data.message
  // Rafraîchir le profil et les logs
} else {
  // Afficher toast erreur : data.message
}
```

### 4. Bouton Check-in quotidien / Streak (`daily_checkin`)

* Ouvert du **1er au 19 décembre 2026**.
* Barème progressif automatique sur 19 jours consécutifs = **100 points au total** :
  * Jours 1 à 5 : `+2 pts/j`
  * Jours 6 à 10 : `+4 pts/j`
  * Jours 11 à 15 : `+6 pts/j`
  * Jours 16 à 18 : `+9 pts/j`
  * Jour 19 : `+13 pts`
* Si un jour est manqué, `current_streak` repart à `1` au prochain check-in.

```javascript
const { data, error } = await supabase.rpc('daily_checkin');

if (data.success) {
  // Afficher data.message + mettre à jour la flamme (data.streak)
} else {
  // Afficher data.message
}
```
