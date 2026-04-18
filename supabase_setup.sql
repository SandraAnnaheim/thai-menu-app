-- ============================================
-- THAI MENÜ BESTELLPLATTFORM - Supabase Setup
-- ============================================
-- Ausführen im Supabase SQL Editor

-- 1. FIRMEN
CREATE TABLE companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  twint_phone TEXT,
  lunchbox_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. BENUTZER (erweitert auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  company_id UUID REFERENCES companies(id),
  is_approved BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. MENÜ-POOL (alle möglichen Gerichte)
CREATE TABLE menu_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  is_vegetarian_possible BOOLEAN DEFAULT TRUE,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. WOCHENMENÜS (welche 2 Menüs gibt es diese Woche)
CREATE TABLE weekly_menus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  menu1_id UUID REFERENCES menu_pool(id),
  menu2_id UUID REFERENCES menu_pool(id),
  order_deadline TIMESTAMPTZ NOT NULL,
  delivery_date DATE NOT NULL,
  price_per_menu NUMERIC(10,2) DEFAULT 17.00,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(week_number, year)
);

-- 5. BESTELLUNGEN
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  weekly_menu_id UUID REFERENCES weekly_menus(id),
  company_id UUID REFERENCES companies(id),
  menu_choice INTEGER CHECK (menu_choice IN (1, 2)) NOT NULL,
  is_vegetarian BOOLEAN DEFAULT FALSE,
  protein_choice TEXT, -- 'poulet' oder 'crevetten' (für Menü 2)
  lunchbox_requested BOOLEAN DEFAULT FALSE,
  lunchbox_returned BOOLEAN DEFAULT FALSE,
  quantity INTEGER DEFAULT 1,
  total_price NUMERIC(10,2),
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TRIGGER: Profil automatisch erstellen
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- TRIGGER: Bestellpreis automatisch berechnen
-- ============================================
CREATE OR REPLACE FUNCTION calculate_order_price()
RETURNS TRIGGER AS $$
DECLARE
  menu_price NUMERIC(10,2);
BEGIN
  SELECT price_per_menu INTO menu_price
  FROM weekly_menus WHERE id = NEW.weekly_menu_id;
  NEW.total_price = menu_price * NEW.quantity;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_price
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION calculate_order_price();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Companies: alle lesen, nur Admin schreiben
CREATE POLICY "Companies lesbar für alle" ON companies FOR SELECT USING (true);
CREATE POLICY "Companies nur Admin schreiben" ON companies FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Profiles: eigenes Profil lesen/schreiben, Admin alles
CREATE POLICY "Eigenes Profil lesen" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin liest alle Profile" ON profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));
CREATE POLICY "Eigenes Profil updaten" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "Admin Profile verwalten" ON profiles FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Menu Pool: alle lesen (wenn approved), Admin schreiben
CREATE POLICY "Menüpool lesen (approved)" ON menu_pool FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_approved = true));
CREATE POLICY "Admin Menüpool verwalten" ON menu_pool FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Weekly Menus: alle lesen (wenn approved), Admin schreiben
CREATE POLICY "Wochenmenüs lesen (approved)" ON weekly_menus FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_approved = true));
CREATE POLICY "Admin Wochenmenüs verwalten" ON weekly_menus FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- Orders: eigene lesen/schreiben, Admin alles
CREATE POLICY "Eigene Bestellungen" ON orders FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Bestellung erstellen" ON orders FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_approved = true)
  );
CREATE POLICY "Eigene Bestellung updaten" ON orders FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Admin alle Bestellungen" ON orders FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true));

-- ============================================
-- BEISPIELDATEN
-- ============================================

-- Firmen
INSERT INTO companies (name, contact_person, twint_phone) VALUES
  ('Musterfirma AG', 'Max Muster', '+41791234567'),
  ('Beispiel GmbH', 'Anna Beispiel', '+41797654321');

-- Menü-Pool (aus dem PDF + weitere)
INSERT INTO menu_pool (title, description, is_vegetarian_possible) VALUES
  ('Rotes Curry', 'Lachs | Kokosnussmilch | Bambus | Gemüse | Reis', true),
  ('Gebratenes Gemüse', 'Poulet oder Crevetten | Reis | Bohnen | Thai Gemüse | Karotten | Brokkoli | Zwiebeln | Kohl', true),
  ('Grünes Curry', 'Poulet | Kokosnussmilch | Thai Auberginen | Basilikum | Reis', true),
  ('Pad Thai', 'Reisnudeln | Poulet | Ei | Sojasprossen | Erdnüsse | Limette', true),
  ('Massaman Curry', 'Rindfleisch | Kartoffeln | Erdnüsse | Kokosnussmilch | Reis', true),
  ('Tom Kha Suppe', 'Poulet | Kokosnussmilch | Galgant | Zitronengras | Pilze | Reis', true),
  ('Basil Fried Rice', 'Poulet | Basilikum | Chili | Ei | Reis', true),
  ('Panang Curry', 'Poulet | Kokosnussmilch | Kaffirlimettenblätter | Reis', true);

-- ============================================
-- HILFREICHE VIEWS
-- ============================================

-- Aktuelle Woche (diese Woche)
CREATE VIEW current_week_menu AS
SELECT
  wm.*,
  mp1.title AS menu1_title,
  mp1.description AS menu1_description,
  mp1.is_vegetarian_possible AS menu1_vegi,
  mp2.title AS menu2_title,
  mp2.description AS menu2_description,
  mp2.is_vegetarian_possible AS menu2_vegi
FROM weekly_menus wm
LEFT JOIN menu_pool mp1 ON wm.menu1_id = mp1.id
LEFT JOIN menu_pool mp2 ON wm.menu2_id = mp2.id
WHERE
  wm.week_number = EXTRACT(WEEK FROM NOW())
  AND wm.year = EXTRACT(YEAR FROM NOW())
  AND wm.is_active = true;

-- Bestellübersicht pro Firma
CREATE VIEW order_summary AS
SELECT
  o.id,
  p.full_name,
  p.email,
  c.name AS company_name,
  wm.week_number,
  wm.year,
  wm.delivery_date,
  CASE WHEN o.menu_choice = 1 THEN mp1.title ELSE mp2.title END AS menu_title,
  o.menu_choice,
  o.is_vegetarian,
  o.protein_choice,
  o.lunchbox_requested,
  o.lunchbox_returned,
  o.quantity,
  o.total_price,
  o.payment_status,
  o.created_at
FROM orders o
JOIN profiles p ON o.user_id = p.id
JOIN companies c ON o.company_id = c.id
JOIN weekly_menus wm ON o.weekly_menu_id = wm.id
LEFT JOIN menu_pool mp1 ON wm.menu1_id = mp1.id
LEFT JOIN menu_pool mp2 ON wm.menu2_id = mp2.id;
