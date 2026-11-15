-- ==============================================================================
-- CHAU7 CALENDRIER DE L'AVENT - SUPABASE DATABASE SCHEMA & RLS POLICIES
-- ==============================================================================

-- 1. PROFILES TABLE (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    pseudo TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    points INT DEFAULT 0 CHECK (points >= 0),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. ADVENT EVENTS TABLE (19 days of December)
CREATE TABLE IF NOT EXISTS public.advent_events (
    day_number INT PRIMARY KEY CHECK (day_number BETWEEN 1 AND 19),
    event_date DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT 'Foyer N7 / Toulouse',
    time_slot TEXT NOT NULL DEFAULT '12:30 - 13:30',
    is_revealed BOOLEAN DEFAULT false NOT NULL
);

-- 3. SECRET CODES TABLE
CREATE TABLE IF NOT EXISTS public.secret_codes (
    code TEXT PRIMARY KEY,
    points_reward INT NOT NULL CHECK (points_reward > 0),
    max_uses INT DEFAULT 100 NOT NULL,
    current_uses INT DEFAULT 0 NOT NULL,
    expires_at TIMESTAMPTZ
);

-- 4. POINT CLAIMS TABLE (tracking which user claimed which code)
CREATE TABLE IF NOT EXISTS public.point_claims (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    code TEXT REFERENCES public.secret_codes(code) ON DELETE CASCADE NOT NULL,
    claimed_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_user_code UNIQUE (user_id, code)
);

-- ==============================================================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secret_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_claims ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS POLICIES
-- ==============================================================================

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Advent events policies (Everyone can read events, only authenticated admin/service role can update)
CREATE POLICY "Advent events are viewable by everyone" ON public.advent_events
    FOR SELECT USING (true);

CREATE POLICY "Admins can update advent events" ON public.advent_events
    FOR ALL USING (auth.role() = 'service_role' OR auth.uid() IN (SELECT id FROM public.profiles WHERE email LIKE '%@chau7.n7%' AND points >= 0)); -- Can adjust admin check or use service role

-- Secret codes policies (Read allowed for validation, insert/update via RPC or admin)
CREATE POLICY "Secret codes readable for validation" ON public.secret_codes
    FOR SELECT USING (true);

-- Point claims policies
CREATE POLICY "Users can view their own claims" ON public.point_claims
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own claims" ON public.point_claims
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- SECURE RPC FUNCTION: claim_secret_code
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.claim_secret_code(input_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_user_id UUID;
    code_record RECORD;
    existing_claim RECORD;
    updated_points INT;
BEGIN
    -- Get current authenticated user
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'Utilisateur non authentifié.');
    END IF;

    -- Clean & normalize input code
    input_code := TRIM(UPPER(input_code));

    -- Check if code exists and is valid
    SELECT * INTO code_record FROM public.secret_codes WHERE code = input_code;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Code secret invalide ou inconnu.');
    END IF;

    -- Check expiration if set
    IF code_record.expires_at IS NOT NULL AND code_record.expires_at < now() THEN
        RETURN json_build_object('success', false, 'message', 'Ce code secret a expiré.');
    END IF;

    -- Check max uses quota
    IF code_record.current_uses >= code_record.max_uses THEN
        RETURN json_build_object('success', false, 'message', 'Ce code a atteint son nombre maximum d''utilisations.');
    END IF;

    -- Check if user already claimed this code
    SELECT * INTO existing_claim FROM public.point_claims WHERE user_id = current_user_id AND code = input_code;
    IF FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Tu as déjà validé ce code secret !');
    END IF;

    -- Insert claim
    INSERT INTO public.point_claims (user_id, code) VALUES (current_user_id, input_code);

    -- Increment code uses
    UPDATE public.secret_codes 
    SET current_uses = current_uses + 1 
    WHERE code = input_code;

    -- Increment user points
    UPDATE public.profiles 
    SET points = points + code_record.points_reward 
    WHERE id = current_user_id
    RETURNING points INTO updated_points;

    RETURN json_build_object(
        'success', true, 
        'message', 'Code validé avec succès ! +' || code_record.points_reward || ' points.',
        'points_reward', code_record.points_reward,
        'new_total_points', updated_points
    );
END;
$$;

-- ==============================================================================
-- INITIAL SEED DATA (Updated from Google Sheet - Chau7 Avent Planning)
-- ==============================================================================
INSERT INTO public.advent_events (day_number, event_date, title, description, location, time_slot, is_revealed)
VALUES 
(1, '2026-12-01', 'Kahoot sur Noël 🎄', 'Grand quiz sur le thème de Noël pour tester vos connaissances !', 'Foyer N7', 'Matin', true),
(2, '2026-12-02', 'Vente de chocolats chauds ☕', 'Chocolats chauds avec mini guimauves et chantilly, à prix doux !', 'Hall N7', 'Matin', true),
(3, '2026-12-03', 'Trouve ta paire 👯', 'Après avoir rempli un questionnaire, trouve ta paire parmi les membres de la soirée !', 'Salle de soirée', 'Soir', false),
(4, '2026-12-04', 'Fresque de Noël 🎨', 'Dessin collaboratif/fresque géante d''un sapin de Noël. Chacun ajoute son souvenir de Noël.', 'Foyer N7', 'Matin', false),
(5, '2026-12-05', 'Bingo Photo de Noël 📸', 'Grille de bingo avec des éléments à repérer et photographier. Soyez les plus rapides !', 'Campus', 'Soir', false),
(6, '2026-12-06', 'Teasing Chau7 🎅', 'Mystère... Restez connectés pour la suite !', 'Insta @chau7.n7', 'Toute la journée', false),
(7, '2026-12-07', 'Mystère de l''Avent 🎁', 'Un événement spécial en préparation...', 'Foyer N7', '12:30', false),
(8, '2026-12-08', 'Concours Fil Chenille 🧶', 'Concours de création en fil chenille. Faites parler votre créativité !', 'Foyer N7', 'Midi', false),
(9, '2026-12-09', 'Afterwork Chaussettes ✨', 'Customise ta paire de chaussettes avec tissus et bombes ! Élection de la meilleure.', 'Salle N7', 'Soir', false),
(10, '2026-12-10', 'Journée N7 🏫', 'Une surprise vous attend au sein de l''école.', 'Hall ENSEEIHT', '12:30', false),
(11, '2026-12-11', 'Teasing de Noël 🍭', 'Chut, c''est un secret...', 'Insta @chau7.n7', '18:00', false),
(12, '2026-12-12', 'Atelier créatif 🎨', 'Créez vos propres designs de chaussettes !', 'Foyer N7', 'Soir', false),
(13, '2026-12-13', 'Journée Matchy 👔', 'Journée matchy entre parain-fillot. Sortez vos plus belles tenues assorties !', 'Campus N7', 'Matin', false),
(14, '2026-12-14', 'Just Dance N7 💃', 'Tournoi de Just Dance pour se défouler avant la fin du trimestre !', 'Foyer N7', 'Midi', false),
(15, '2026-12-15', 'Révélation 15 🎉', 'Encore quelques jours avant la fin...', 'Foyer N7', '12:00', false),
(16, '2026-12-16', 'Teasing 16 ✨', 'Restez à l''affût !', 'Insta @chau7.n7', '18:00', false),
(17, '2026-12-17', 'Boum des Fêtes 🥳', 'Soirée dansante pour célébrer l''Avent.', 'Foyer N7', 'Soir', false),
(18, '2026-12-18', 'Quiz Final 🧠', 'Ultime test de culture générale.', 'Amphi A', '18:00', false),
(19, '2026-12-19', 'Révélation Finale Chau7 🌟', 'La grande annonce de l''Avent !', 'Foyer N7', 'Soir', false)
ON CONFLICT (day_number) DO UPDATE SET 
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    location = EXCLUDED.location,
    time_slot = EXCLUDED.time_slot,
    is_revealed = EXCLUDED.is_revealed;


-- Seed some sample secret codes
INSERT INTO public.secret_codes (code, points_reward, max_uses, current_uses, expires_at)
VALUES 
('CHAU7START', 50, 500, 0, '2026-12-31 23:59:59+00'),
('FOYER2026', 30, 200, 0, '2026-12-31 23:59:59+00'),
('N7GRAFF', 40, 150, 0, '2026-12-31 23:59:59+00'),
('CHAU7XMAS', 100, 100, 0, '2026-12-31 23:59:59+00')
ON CONFLICT (code) DO NOTHING;
