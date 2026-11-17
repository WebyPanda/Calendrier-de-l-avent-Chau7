# Architecture Base de Données SQL — Calendrier de l'Avent Chau7

**SGBD :** PostgreSQL (hébergé sur Supabase)  
**Période couverte :** 1er au 19 décembre 2026\[cite: 1]  
**Objectif :** Gérer les comptes étudiants, le planning multi-créneaux du calendrier de l'Avent, les codes QR/secrets et un historique public transparent des points gagnés (anti-triche et anti-favoritisme).

\---

## 1\. Vue d'ensemble des 4 tables

1. **`profiles`** : Comptes des étudiants (Prénom, Nom, Filière, Identifiant, Points).
2. **`advent\_events`** : Événements du calendrier (clé primaire composite sur le jour et le créneau).
3. **`secret\_codes`** : Codes secrets / QR codes distribués lors des animations.
4. **`point\_logs`** : Journal transparent de tous les gains de points (via QR code ou victoire d'épreuve) et verrou anti-doublon.

\---

## 2\. Structure détaillée des tables

### Table `profiles`

Liée nativement à l'authentification Supabase (`auth.users`).

|Colonne|Type|Contraintes|Description|
|-|-|-|-|
|`id`|`UUID`|`PRIMARY KEY`, `REFERENCES auth.users(id) ON DELETE CASCADE`|Identifiant unique Supabase Auth|
|`prenom`|`TEXT`|`NOT NULL`|Prénom de l'étudiant|
|`nom`|`TEXT`|`NOT NULL`|Nom de famille de l'étudiant|
|`filiere`|`TEXT`|`NOT NULL`|Filière N7 (`SN`, `MF2E`, `3EA`, `FISA`, `Autre`)|
|`identifiant`|`TEXT`|`UNIQUE`, `NOT NULL`|Pseudo / identifiant public affiché|
|`email`|`TEXT`|`UNIQUE`, `NOT NULL`|Adresse email de connexion|
|`points`|`INT`|`DEFAULT 0`|Solde actuel de points (mis à jour par trigger)|
|`created\_at`|`TIMESTAMPTZ`|`DEFAULT NOW()`|Date de création du compte|

\---

### Table `advent\_events`

Permet jusqu'à 4 événements par jour du 1er au 19 décembre 2026\[cite: 1].

|Colonne|Type|Contraintes|Description|
|-|-|-|-|
|`day\_number`|`INT`|`CHECK (day\_number BETWEEN 1 AND 19)`|Numéro de la case (1 à 19)\[cite: 1]|
|`slot`|`TEXT`|`CHECK (slot IN ('matin', 'midi', 'aprem', 'soir'))`|Créneau horaire strict|
|**`(day\_number, slot)`**|—|**`PRIMARY KEY`**|Clé primaire composite|
|`event\_date`|`DATE`|`GENERATED ALWAYS AS ('2026-12-01'::date + (day\_number - 1)) STORED`|Date calculée automatiquement|
|`title`|`TEXT`|`NOT NULL`|Titre de l'événement|
|`description`|`TEXT`|—|Détail de l'animation|
|`location`|`TEXT`|—|Lieu (ex. `Foyer N7`, `Insta @chau7.n7`, `Toulouse`)\[cite: 1]|
|`points\_hint`|`TEXT`|—|Indication de gain (ex. `+30 pts participation`)|
|`is\_revealed`|`BOOLEAN`|`DEFAULT FALSE`|`true` = visible par tous, `false` = verrouillé (`🔒`)\[cite: 1]|

\---

### Table `secret\_codes`

Stocke les codes validables manuellement ou via scan de QR code (`?code=XXXX`)\[cite: 1].

|Colonne|Type|Contraintes|Description|
|-|-|-|-|
|`code`|`TEXT`|`PRIMARY KEY`|Code en majuscules (ex. `CHAU7CREPES`)\[cite: 1]|
|`label`|`TEXT`|`NOT NULL`|Intitulé affiché dans les logs (ex. `Open Crêpes - 3 déc`)|
|`points\_reward`|`INT`|`NOT NULL`|Nombre de points attribués|
|`max\_uses`|`INT`|`DEFAULT 150`|Limite maximale d'utilisations|
|`expires\_at`|`TIMESTAMPTZ`|`NULLABLE`|Date/heure d'expiration optionnelle|

\---

### Table `point\_logs`

Assure la traçabilité publique des scores et empêche de valider deux fois le même code\[cite: 1].

|Colonne|Type|Contraintes|Description|
|-|-|-|-|
|`id`|`SERIAL`|`PRIMARY KEY`|Identifiant unique du log|
|`user\_id`|`UUID`|`REFERENCES profiles(id) ON DELETE CASCADE`, `NOT NULL`|Joueur concerné|
|`code`|`TEXT`|`REFERENCES secret\_codes(code) ON DELETE SET NULL`, `NULLABLE`|Code QR utilisé (`NULL` si gain manuel par victoire)|
|`reason`|`TEXT`|`NOT NULL`|Motif du gain (label du code ou victoire d'épreuve)|
|`points\_delta`|`INT`|`NOT NULL`|Points ajoutés (ou retirés)|
|`created\_at`|`TIMESTAMPTZ`|`DEFAULT NOW()`|Horodatage du gain|
|**`(user\_id, code)`**|—|**`UNIQUE`**|Empêche tout doublon sur un même code QR\[cite: 1]|

\---

## 3\. Automatisations \& Sécurité (SQL)

* **Row Level Security (RLS) :**

  * Lecture publique (`SELECT`) sur `profiles`, `advent\_events` et `point\_logs`.
  * **Aucune écriture directe (`INSERT` / `UPDATE` / `DELETE`) autorisée côté client** (toute gestion manuelle passe exclusivement par le dashboard Supabase sur PC).
* **Trigger `on\_auth\_user\_created` :**

  * Crée automatiquement la ligne dans `profiles` lors de l'inscription d'un utilisateur dans `auth.users`.
* **Trigger `on\_point\_log\_inserted` :**

  * Met à jour automatiquement `profiles.points = profiles.points + NEW.points\_delta` dès qu'une ligne est

