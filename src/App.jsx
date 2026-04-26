import { useState, useEffect, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import "jspdf-autotable";

// ============================================
// SUPABASE CONFIG
// ============================================
const SUPABASE_URL = "https://hsyhvwfweknzbywwqpwa.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeWh2d2Z3ZWtuemJ5d3dxcHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTUwMjYsImV4cCI6MjA5MjAzMTAyNn0.OwEtxFWkxwpsLblCE-zRF8wfQO-Ndq1H04WhFiLkZTs";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// AUTH CONTEXT
// ============================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (data?.company_id) {
        const { data: company } = await supabase
          .from("companies")
          .select("*")
          .eq("id", data.company_id)
          .single();
        setProfile({ ...data, companies: company });
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error("fetchProfile Fehler:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, supabase, fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================
// UTILITY
// ============================================
function getWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7), year: d.getUTCFullYear() };
}

function isOrderingOpen(deadline) {
  if (!deadline) return false;
  return new Date() < new Date(deadline);
}

function getOrderingWeek() {
  const today = new Date();
  const dayOfWeek = today.getDay();
  if (dayOfWeek >= 3) {
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    return getWeekNumber(nextWeek);
  }
  return getWeekNumber(today);
}

// ============================================
// MOBILE HOOK
// ============================================
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ============================================
// GLOBAL RESPONSIVE STYLES
// ============================================
function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      html { -webkit-text-size-adjust: 100%; }
      input, select, button, textarea { font-size: 16px !important; }
      body { margin: 0; }
      @media (max-width: 767px) {
        .menu-grid { grid-template-columns: 1fr !important; }
        .admin-form-grid { grid-template-columns: 1fr !important; }
        .page-header-row { flex-wrap: wrap; gap: 8px; }
        .filter-row { flex-direction: column; align-items: stretch !important; }
        .filter-row label { margin-top: 4px; }
        .filter-row input, .filter-row select { width: 100% !important; }
        .mobile-stack { flex-direction: column; }
        .add-menu-form { flex-direction: column !important; }
        .filter-number-row { display: flex; gap: 12px; }
        .filter-number-row input { flex: 1; }
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    `}</style>
  );
}

// ============================================
// HAUPTAPP
// ============================================
export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

function AppRouter() {
  const { user, profile, loading } = useAuth();
  const [page, setPage] = useState("home");

  if (loading) return <><GlobalStyles /><LoadingScreen /></>;
  if (!user) return <><GlobalStyles /><LoginPage /></>;
  if (!profile) return <><GlobalStyles /><LoadingScreen /></>;
  if (profile?.is_admin) return <><GlobalStyles /><AdminLayout page={page} setPage={setPage} /></>;
  if (!profile?.is_approved) return <><GlobalStyles /><PendingApprovalPage /></>;
  if (profile?.is_contact && !profile?.is_admin) return <><GlobalStyles /><ContactLayout page={page} setPage={setPage} /></>;
  return <><GlobalStyles /><UserLayout page={page} setPage={setPage} /></>;
}

// ============================================
// LOADING
// ============================================
function LoadingScreen() {
  return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingContent}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Laden…</p>
      </div>
    </div>
  );
}

// ============================================
// LOGIN PAGE
// ============================================
function LoginPage() {
  const { supabase } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("companies").select("*").then(({ data }) => setCompanies(data || []));
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Falsche E-Mail oder Passwort.");
    setLoading(false);
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    if (!company) { setError("Bitte Firma auswählen."); setLoading(false); return; }
    if (password !== passwordConfirm) { setError("Passwörter stimmen nicht überein."); setLoading(false); return; }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.user) {
      await supabase.from("profiles").update({ company_id: company, full_name: name }).eq("id", data.user.id);
      await supabase.functions.invoke('resend-email', {
        body: { full_name: name, email: email }
      });
    }
    setSuccess("Registrierung erfolgreich! Warte auf Freigabe durch den Administrator.");
    setLoading(false);
  }

  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={styles.loginHeader}>
          <h1 style={styles.loginTitle}>Pia's Thai-Kitchen</h1>
          <p style={styles.loginSubtitle}>Thai-Menüs bestellen</p>
        </div>

        <div style={styles.tabRow}>
          <button style={mode === "login" ? styles.tabActive : styles.tab} onClick={() => setMode("login")}>Anmelden</button>
          <button style={mode === "register" ? styles.tabActive : styles.tab} onClick={() => setMode("register")}>Registrieren</button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {mode === "login" ? (
          <form onSubmit={handleLogin} style={styles.form}>
            <Input label="E-Mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <Input label="Passwort" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button type="submit" style={styles.btnPrimary} disabled={loading}>{loading ? "…" : "Anmelden"}</button>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={styles.form}>
            <Input label="Vollständiger Name" value={name} onChange={e => setName(e.target.value)} required />
            <Input label="E-Mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <div style={styles.inputGroup}>
              <label style={styles.label}>Passwort (min. 6 Zeichen)</label>
              <div style={{ position: "relative" }}>
                <input style={styles.input} type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>
                  {showPassword ? <em>Verbergen</em> : <em>Anzeigen</em>}
                </button>
              </div>
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Passwort bestätigen</label>
              <div style={{ position: "relative" }}>
                <input style={styles.input} type={showPassword ? "text" : "password"} value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} required />
              </div>
              {passwordConfirm && password !== passwordConfirm && (
                <span style={{ color: "#dc2626", fontSize: 12 }}>⚠️ Passwörter stimmen nicht überein</span>
              )}
              {passwordConfirm && password === passwordConfirm && (
                <span style={{ color: "#15803d", fontSize: 12 }}>✅ Passwörter stimmen überein</span>
              )}
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Firma *</label>
              <select style={styles.select} value={company} onChange={e => setCompany(e.target.value)} required>
                <option value="">Firma auswählen…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button type="submit" style={styles.btnPrimary} disabled={loading}>{loading ? "…" : "Registrieren"}</button>
            <p style={styles.hint}>Nach der Registrierung wird dein Konto durch den Administrator freigeschaltet.</p>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================
// PENDING APPROVAL
// ============================================
function PendingApprovalPage() {
  const { supabase } = useAuth();
  return (
    <div style={styles.loginBg}>
      <div style={styles.loginCard}>
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
          <h2 style={{ color: "#b45309", marginBottom: 8 }}>Konto wird geprüft</h2>
          <p style={{ color: "#6b7280" }}>Dein Konto wurde noch nicht freigeschaltet. Der Administrator wird dich bald freischalten.</p>
          <button style={{ ...styles.btnSecondary, marginTop: 24 }} onClick={() => supabase.auth.signOut()}>Abmelden</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// USER LAYOUT
// ============================================
function UserLayout({ page, setPage }) {
  const { profile, supabase } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pages = { home: <OrderPage setPage={setPage} />, history: <OrderHistory /> };
  const navItems = [["home", "Bestellen"], ["history", "Meine Bestellungen"]];
  return (
    <div style={styles.appContainer}>
      <nav style={styles.nav}>
        <div style={styles.navBrand}><span>{profile?.companies?.name || "Thai Menü"}</span></div>
        {isMobile ? (
          <>
            <div style={{ flex: 1 }} />
            <button style={styles.hamburger} onClick={() => setMobileOpen(o => !o)}>{mobileOpen ? "✕" : "☰"}</button>
            <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </>
        ) : (
          <>
            <div style={styles.navLinks}>
              {navItems.map(([k, v]) => (
                <button key={k} style={page === k ? styles.navLinkActive : styles.navLink} onClick={() => setPage(k)}>{v}</button>
              ))}
            </div>
            <div style={styles.navRight}>
              <span style={styles.navUser}>{profile?.full_name}</span>
              <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
            </div>
          </>
        )}
      </nav>
      {isMobile && mobileOpen && (
        <div style={styles.mobileDropdown}>
          {navItems.map(([k, v]) => (
            <button key={k} style={page === k ? styles.mobileNavLinkActive : styles.mobileNavLink}
              onClick={() => { setPage(k); setMobileOpen(false); }}>{v}</button>
          ))}
          <div style={{ padding: "8px 12px", color: "#a8a29e", fontSize: 13, borderTop: "1px solid #3a3735" }}>{profile?.full_name}</div>
        </div>
      )}
      <main style={isMobile ? styles.mainMobile : styles.main}>{pages[page] || <OrderPage />}</main>
    </div>
  );
}

// ============================================
// CONTACT LAYOUT
// ============================================
function ContactLayout({ page, setPage }) {
  const { supabase, profile } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = [["orders", "Bestellungen"], ["home", "Bestellen"], ["history", "Meine Bestellungen"]];
  return (
    <div style={styles.appContainer}>
      <nav style={{ ...styles.nav, background: "#1c1917" }}>
        <div style={styles.navBrand}><span style={{ color: "#f59e0b" }}>{profile?.companies?.name}</span></div>
        {isMobile ? (
          <>
            <div style={{ flex: 1 }} />
            <button style={styles.hamburger} onClick={() => setMobileOpen(o => !o)}>{mobileOpen ? "✕" : "☰"}</button>
            <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </>
        ) : (
          <>
            <div style={styles.navLinks}>
              {navItems.map(([k, v]) => (
                <button key={k} style={page === k ? styles.navLinkActive : styles.navLink} onClick={() => setPage(k)}>{v}</button>
              ))}
            </div>
            <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </>
        )}
      </nav>
      {isMobile && mobileOpen && (
        <div style={{ ...styles.mobileDropdown, background: "#1c1917" }}>
          {navItems.map(([k, v]) => (
            <button key={k} style={page === k ? styles.mobileNavLinkActive : styles.mobileNavLink}
              onClick={() => { setPage(k); setMobileOpen(false); }}>{v}</button>
          ))}
        </div>
      )}
      <main style={isMobile ? styles.mainMobile : styles.main}>
        {page === "home" ? <OrderPage setPage={setPage} /> : page === "history" ? <OrderHistory /> : <ContactOrders />}
      </main>
    </div>
  );
}

// ============================================
// ADMIN LAYOUT
// ============================================
function AdminLayout({ page, setPage }) {
  const { supabase } = useAuth();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navItems = [["orders", "Bestellungen"], ["bestellen", "Bestellen"], ["history", "Meine Bestellungen"], ["weekly", "Wochenmenüs"], ["menus", "Menü-Pool"], ["users", "Benutzer"]];
  const adminPages = {
    orders: <AdminOrders />,
    bestellen: <OrderPage setPage={setPage} />,
    history: <OrderHistory />,
    users: <AdminUsers />,
    menus: <AdminMenus />,
    weekly: <AdminWeeklyMenus />,
  };
  return (
    <div style={styles.appContainer}>
      <nav style={{ ...styles.nav, background: "#1c1917" }}>
        <div style={styles.navBrand}><span style={{ color: "#f59e0b" }}>Admin</span></div>
        {isMobile ? (
          <>
            <div style={{ flex: 1 }} />
            <button style={styles.hamburger} onClick={() => setMobileOpen(o => !o)}>{mobileOpen ? "✕" : "☰"}</button>
            <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </>
        ) : (
          <>
            <div style={styles.navLinks}>
              {navItems.map(([k, v]) => (
                <button key={k} style={page === k ? styles.navLinkActive : styles.navLink} onClick={() => setPage(k)}>{v}</button>
              ))}
            </div>
            <button style={styles.btnLogout} onClick={() => supabase.auth.signOut()}>Abmelden</button>
          </>
        )}
      </nav>
      {isMobile && mobileOpen && (
        <div style={{ ...styles.mobileDropdown, background: "#1c1917" }}>
          {navItems.map(([k, v]) => (
            <button key={k} style={page === k ? styles.mobileNavLinkActive : styles.mobileNavLink}
              onClick={() => { setPage(k); setMobileOpen(false); }}>{v}</button>
          ))}
        </div>
      )}
      <main style={isMobile ? styles.mainMobile : styles.main}>{adminPages[page] || <AdminOrders />}</main>
    </div>
  );
}

// ============================================
// ORDER PAGE
// ============================================
function OrderPage({ setPage }) {
  const { profile, supabase } = useAuth();
  const isMobile = useIsMobile();
  const [weeklyMenu, setWeeklyMenu] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuChoice, setMenuChoice] = useState(null);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [proteinChoice, setProteinChoice] = useState("poulet");
  const [lunchbox, setLunchbox] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [twintInfo, setTwintInfo] = useState(null);
  const [existingOrder, setExistingOrder] = useState(null);
  const open = isOrderingOpen(weeklyMenu?.order_deadline);
  const { week, year } = getOrderingWeek();

  useEffect(() => { loadWeeklyMenu(); }, []);

  async function loadWeeklyMenu() {
    const { data } = await supabase
      .from("weekly_menus")
      .select("*, menu1:menu1_id(*), menu2:menu2_id(*)")
      .eq("week_number", week).eq("year", year).eq("is_active", true).single();
    setWeeklyMenu(data);

    if (data && profile) {
      const { data: order } = await supabase
        .from("orders")
        .select("*").eq("weekly_menu_id", data.id).eq("user_id", profile.id).single();
      setExistingOrder(order);

      const { data: profileWithCompany } = await supabase
        .from("profiles")
        .select("*, companies(*)")
        .eq("id", profile.id).single();

      if (profileWithCompany?.companies) {
        setTwintInfo({
          phone: profileWithCompany.companies.twint_phone,
          contact: profileWithCompany.companies.contact_person,
          amount: data.price_per_menu
        });
      }
    }
    setLoading(false);
  }

  async function handleOrder(e) {
    e.preventDefault();
    if (!menuChoice) { setError("Bitte ein Menü auswählen."); return; }
    const selectedMenu = menuChoice === 1 ? weeklyMenu.menu1 : weeklyMenu.menu2;
    const proteins = selectedMenu?.protein_options?.split(",").map(p => p.trim()).filter(p => p && p !== "keine") || [];
    if (proteins.length > 1 && !proteinChoice) { setError("Bitte eine Protein-Wahl treffen."); return; }
    const autoProtein = proteins.length === 1 ? proteins[0] : proteinChoice;
    setSubmitting(true); setError("");
    const { data, error: err } = await supabase.from("orders").insert({
      user_id: profile.id,
      company_id: profile.company_id,
      weekly_menu_id: weeklyMenu.id,
      menu_choice: menuChoice,
      is_vegetarian: isVegetarian,
      protein_choice: !isVegetarian ? autoProtein : null,
      lunchbox_requested: lunchbox,
      quantity: 1,
    }).select().single();
    if (err) { setError("Fehler beim Bestellen: " + err.message); setSubmitting(false); return; }
    setExistingOrder(data);
    setSuccess(true);
    setTwintInfo({
      phone: profile?.companies?.twint_phone || "",
      contact: profile?.companies?.contact_person || "",
      amount: weeklyMenu.price_per_menu
    });
    setSubmitting(false);
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.pageContainer}>
      <div style={styles.pageHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h1 style={styles.pageTitle}>Menü Bestellen</h1>
        </div>
        <span style={styles.weekBadge}>KW {week}</span>
      </div>

      {!open && (
        <div style={styles.warningBox}>
          Die Bestellfrist für KW {week} ist abgelaufen (Dienstag 13:00 Uhr).
        </div>
      )}

      {!weeklyMenu ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48 }}>🍽️</div>
          <p>Für diese Woche wurde noch kein Menü erfasst.</p>
        </div>
      ) : existingOrder ? (
        <ExistingOrderCard order={existingOrder} weeklyMenu={weeklyMenu} twintInfo={twintInfo} setPage={setPage} onNewOrder={() => { setExistingOrder(null); setMenuChoice(null); setSuccess(false); }} />
      ) : (
        <form onSubmit={handleOrder}>
          <div style={styles.menuGrid} className="menu-grid">
            <MenuCard
              number={1}
              menu={weeklyMenu.menu1}
              selected={menuChoice === 1}
              onSelect={() => setMenuChoice(1)}
              isMobile={isMobile}
            />
            <MenuCard
              number={2}
              menu={weeklyMenu.menu2}
              selected={menuChoice === 2}
              onSelect={() => setMenuChoice(2)}
              showProtein={!isVegetarian}
              proteinChoice={proteinChoice}
              onProteinChange={setProteinChoice}
              isMobile={isMobile}
            />
          </div>

          {menuChoice && weeklyMenu[`menu${menuChoice}`]?.is_vegetarian_possible && (
            <div style={styles.optionCard}>
              <label style={styles.checkboxLabel}>
                <input type="checkbox" checked={isVegetarian} onChange={e => setIsVegetarian(e.target.checked)} style={styles.checkbox} />
                🌱 Vegetarisch
              </label>
            </div>
          )}

          <div style={{ ...styles.optionCard, border: lunchbox ? "1.5px solid #15803d" : "1.5px solid #dc2626", background: lunchbox ? "#f0fdf4" : "#fff7f7" }}>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={lunchbox} onChange={e => setLunchbox(e.target.checked)} style={styles.checkbox} required />
              <span>
                <strong>Pflichtbestätigung Lunchbox</strong><br />
                <span style={{ fontSize: 13, color: "#44403c" }}>
                  Ich bestätige hiermit verbindlich, dass ich die Lunchbox bis spätestens Freitag der gleichen Lieferwoche in einwandfreiem und gereinigtem Zustand zurückzugeben. Bei Nichterfüllung bin ich verpflichtet, den Ersatzwert der Lunchbox (CHF 10.00) zu erstatten. Mit dem Setzen dieses Hakens anerkenne ich diese Bedingungen ausdrücklich und rechtsverbindlich.
                </span>
              </span>
            </label>
            {!lunchbox && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>⚠️ Diese Bestätigung ist zwingend erforderlich um bestellen zu können.</p>}
          </div>

          <div style={styles.priceRow}>
            <span>Preis pro Menü:</span>
            <strong>CHF {weeklyMenu.price_per_menu?.toFixed(2)}</strong>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <button type="submit" style={styles.btnPrimary} disabled={!open || submitting || !menuChoice || !lunchbox}>
            {submitting ? "Wird bestellt…" : open ? "Jetzt bestellen" : "Bestellfrist abgelaufen"}
          </button>
        </form>
      )}
    </div>
  );
}

function MenuCard({ number, menu, selected, onSelect, showProtein, proteinChoice, onProteinChange, isMobile }) {
  if (!menu) return null;
  return (
    <div style={{ ...styles.menuCard, ...(selected ? styles.menuCardSelected : {}) }} onClick={onSelect}>
      <div style={styles.menuCardNumber}>Menü {number}</div>
      {menu.image_url && (
        <img
          src={menu.image_url}
          alt={menu.title}
          style={{
            width: isMobile ? "100%" : "50%",
            height: isMobile ? 180 : 150,
            objectFit: "cover",
            objectPosition: "center",
            borderRadius: 8,
            marginBottom: 12,
            display: "block"
          }}
        />
      )}
      <h3 style={styles.menuCardTitle}>{menu.title}</h3>
      <p style={styles.menuCardDesc}>{menu.description}</p>
      {menu.is_vegetarian_possible && <span style={styles.vegiTag}>🌱 Vegetarisch möglich</span>}
      {selected && menu.protein_options && menu.protein_options !== "keine" && menu.protein_options !== "" && (() => {
        const proteins = menu.protein_options.split(",").map(p => p.trim());
        if (proteins.length <= 1) return null;
        return (
          <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
            <label style={styles.label}>Protein-Wahl: *</label>
            <div style={{ ...styles.radioRow, flexWrap: "wrap" }}>
              {proteins.map(p => (
                <label key={p} style={styles.radioLabel}>
                  <input type="radio" name="protein" value={p} checked={proteinChoice === p} onChange={() => onProteinChange(p)} />
                  {p === "Fisch" ? "🐟 Fisch" : p === "Schweinefleisch" ? "🐷 Schweinefleisch" : p === "Lachs" ? "🍣 Lachs" : p === "Poulet" ? "🐓 Poulet" : p === "Crevetten" ? "🦐 Crevetten" : p === "Rindfleisch" ? "🥩 Rindfleisch" : p === "Tofu" ? "🌱 Tofu" : `🍖 ${p}`}
                </label>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function TwintPayment({ twintInfo, weekNumber }) {
  const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const phone = twintInfo.phone?.replace(/\D/g, "");
  const amount = twintInfo.amount?.toFixed(2);
  const message = `ThaiMen%C3%BC%20KW${weekNumber}`;
  const deeplink = `twint://payment?amount=${amount}&phone=${phone}&message=${message}`;

  return (
    <div style={{ background: "#00B4E6", borderRadius: 12, padding: 20, marginTop: 16, textAlign: "center" }}>
      <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
        Mit Twint bezahlen – CHF {amount}
      </div>
      <div style={{ color: "#fff", fontSize: 13, marginBottom: 16 }}>
        Zahlung an: <strong>{twintInfo.contact}</strong> ({twintInfo.phone})
      </div>
      {isMobileDevice ? (
        <a href={deeplink} style={{ display: "block", background: "#fff", color: "#00B4E6", padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
          👆 Twint App öffnen
        </a>
      ) : (
        <div style={{ color: "#fff", fontSize: 14 }} />
      )}
    </div>
  );
}

function ExistingOrderCard({ order, weeklyMenu, twintInfo, setPage, onNewOrder }) {
  const menuName = order.menu_choice === 1 ? weeklyMenu?.menu1?.title : weeklyMenu?.menu2?.title;
  const [paidConfirmed, setPaidConfirmed] = useState(false);
  const twintPhone = twintInfo?.phone?.replace(/\D/g, "").replace(/^0/, "41");

  return (
    <div style={styles.successCard}>
      <div style={{ fontSize: 48, textAlign: "center" }}>✅</div>
      <h2 style={{ textAlign: "center", color: "#15803d" }}>Bestellung aufgegeben!</h2>
      <h4 style={{ textAlign: "center", color: "#15803d" }}>Danke für deine Bestellung</h4>
      <div style={styles.orderSummary}>
        <div style={styles.orderRow}><span>Menü</span><strong>{menuName}</strong></div>
        <div style={styles.orderRow}><span>Vegetarisch</span><strong>{order.is_vegetarian ? "Ja" : "Nein"}</strong></div>
        {order.protein_choice && <div style={styles.orderRow}><span>Protein</span><strong>{order.protein_choice}</strong></div>}
        <div style={styles.orderRow}><span>Lunchbox</span><strong>{order.lunchbox_requested ? "Ja" : "Nein"}</strong></div>
        <div style={styles.orderRow}><span>Preis</span><strong>CHF {order.total_price?.toFixed(2)}</strong></div>
        <div style={styles.orderRow}><span>Bezahlt</span><strong>{order.payment_status === "paid" ? "✅ Ja" : "Ausstehend"}</strong></div>
      </div>
      {twintInfo && order.payment_status !== "paid" && (
        <TwintPayment twintInfo={twintInfo} weekNumber={weeklyMenu?.week_number} />
      )}
      {order.payment_status !== "paid" && !paidConfirmed && (
        <button style={{ ...styles.btnPrimary, width: "100%", marginTop: 12 }}
          onClick={() => setPaidConfirmed(true)}>
          Hiermit bestätige das ich Bezahlt habe
        </button>
      )}
      {paidConfirmed && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: 16, marginTop: 12, textAlign: "center" }}>
          <div style={{ fontSize: 32 }}>🙏</div>
          <div style={{ fontWeight: 700, color: "#15803d", marginBottom: 4 }}>Danke für deine Zahlung!</div>
          <div style={{ fontSize: 13, color: "#166534", marginBottom: 16 }}>Die Zahlung wird von uns überprüft und bestätigt.</div>
          <button style={styles.btnSecondary} onClick={() => setPage("history")}>
            zu meine Bestellübersicht
          </button>
        </div>
      )}
      {onNewOrder && (
        <button style={{ ...styles.btnSecondary, width: "100%", marginTop: 12 }}
          onClick={onNewOrder}>
          Weiteres Menü bestellen
        </button>
      )}
    </div>
  );
}

// ============================================
// ORDER HISTORY
// ============================================
function OrderHistory() {
  const { profile, supabase } = useAuth();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOrder, setEditOrder] = useState(null);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    const { data } = await supabase
      .from("orders")
      .select("*, weekly_menus(week_number, year, delivery_date, order_deadline, menu1:menu1_id(title, protein_options), menu2:menu2_id(title, protein_options))")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    setOrders(data || []);
    setLoading(false);
  }

  async function handleDelete(order) {
    if (!window.confirm("Bestellung wirklich löschen?")) return;
    setDeleting(order.id);
    await supabase.from("orders").delete().eq("id", order.id);
    setOrders(orders.filter(o => o.id !== order.id));
    setDeleting(null);
  }

  async function handleSave(order, changes) {
    await supabase.from("orders").update(changes).eq("id", order.id);
    setOrders(orders.map(o => o.id === order.id ? { ...o, ...changes } : o));
    setEditOrder(null);
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>Meine Bestellungen</h1>
      {orders.length === 0 ? (
        <div style={styles.emptyState}><div style={{ fontSize: 48 }}>📭</div><p>Noch keine Bestellungen.</p></div>
      ) : isMobile ? (
        // ── MOBILE: Card-Ansicht ──
        <div>
          {orders.map(o => {
            const menuTitle = o.menu_choice === 1 ? o.weekly_menus?.menu1?.title : o.weekly_menus?.menu2?.title;
            const deadline = o.weekly_menus?.order_deadline;
            const canEdit = deadline ? new Date() < new Date(deadline) : false;
            const isEditing = editOrder?.id === o.id;

            return (
              <div key={o.id} style={styles.mobileCard}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={styles.weekBadge}>KW {o.weekly_menus?.week_number}/{o.weekly_menus?.year}</span>
                  <span style={{ fontSize: 13, color: "#78716c" }}>{o.weekly_menus?.delivery_date}</span>
                </div>

                {/* Menü */}
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Menü</span>
                  {isEditing ? (
                    <select value={editOrder.menu_choice}
                      onChange={e => setEditOrder({ ...editOrder, menu_choice: parseInt(e.target.value) })}
                      style={{ ...styles.select, padding: "4px 8px", width: "auto", fontSize: 14 }}>
                      <option value={1}>{o.weekly_menus?.menu1?.title}</option>
                      <option value={2}>{o.weekly_menus?.menu2?.title}</option>
                    </select>
                  ) : <span style={styles.mobileCardValue}>{menuTitle}</span>}
                </div>

                {/* Checkboxen */}
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Vegetarisch</span>
                  {isEditing ? (
                    <input type="checkbox" checked={editOrder.is_vegetarian}
                      onChange={e => setEditOrder({ ...editOrder, is_vegetarian: e.target.checked })} />
                  ) : <span>{o.is_vegetarian ? "✅ Ja" : "—"}</span>}
                </div>

                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Lunchbox</span>
                  {isEditing ? (
                    <input type="checkbox" checked={editOrder.lunchbox_requested}
                      onChange={e => setEditOrder({ ...editOrder, lunchbox_requested: e.target.checked })} />
                  ) : <span>{o.lunchbox_requested ? "✅ Ja" : "—"}</span>}
                </div>

                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Preis</span>
                  <span style={styles.mobileCardValue}>CHF {o.total_price?.toFixed(2)}</span>
                </div>

                <div style={{ ...styles.mobileCardRow, borderBottom: "none" }}>
                  <span style={styles.mobileCardLabel}>Bezahlt</span>
                  <span style={{ fontWeight: 600, color: o.payment_status === "paid" ? "#15803d" : "#92400e" }}>
                    {o.payment_status === "paid" ? "✅ Bezahlt" : "⏳ Ausstehend"}
                  </span>
                </div>

                {/* Aktionen */}
                <div style={styles.mobileCardActions}>
                  {canEdit && !isEditing && (
                    <>
                      <button style={styles.btnSmall} onClick={() => setEditOrder({ ...o })}>✏️ Bearbeiten</button>
                      <button style={{ ...styles.btnSmallRed, opacity: deleting === o.id ? 0.5 : 1 }}
                        onClick={() => handleDelete(o)}>🗑️ Löschen</button>
                    </>
                  )}
                  {isEditing && (
                    <>
                      <button style={styles.btnSmallGreen}
                        onClick={() => handleSave(o, { menu_choice: editOrder.menu_choice, is_vegetarian: editOrder.is_vegetarian, lunchbox_requested: editOrder.lunchbox_requested })}>
                        ✅ Speichern
                      </button>
                      <button style={styles.btnSmall} onClick={() => setEditOrder(null)}>✕ Abbrechen</button>
                    </>
                  )}
                  {!canEdit && <span style={{ color: "#9ca3af", fontSize: 12 }}>Bestellfrist abgelaufen</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── DESKTOP: Tabellen-Ansicht ──
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>{["KW", "Datum", "Menü", "Vegetarisch", "Lunchbox", "Preis", "Bezahlt", "Aktionen"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {orders.map(o => {
                const menuTitle = o.menu_choice === 1 ? o.weekly_menus?.menu1?.title : o.weekly_menus?.menu2?.title;
                const deadline = o.weekly_menus?.order_deadline;
                const canEdit = deadline ? new Date() < new Date(deadline) : false;
                const isEditing = editOrder?.id === o.id;
                return (
                  <tr key={o.id} style={styles.tr}>
                    <td style={styles.td}>{o.weekly_menus?.week_number}/{o.weekly_menus?.year}</td>
                    <td style={styles.td}>{o.weekly_menus?.delivery_date}</td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <select value={editOrder.menu_choice}
                          onChange={e => setEditOrder({ ...editOrder, menu_choice: parseInt(e.target.value) })}
                          style={styles.input}>
                          <option value={1}>{o.weekly_menus?.menu1?.title}</option>
                          <option value={2}>{o.weekly_menus?.menu2?.title}</option>
                        </select>
                      ) : menuTitle}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input type="checkbox" checked={editOrder.is_vegetarian}
                          onChange={e => setEditOrder({ ...editOrder, is_vegetarian: e.target.checked })} />
                      ) : o.is_vegetarian ? "✅" : "—"}
                    </td>
                    <td style={styles.td}>
                      {isEditing ? (
                        <input type="checkbox" checked={editOrder.lunchbox_requested}
                          onChange={e => setEditOrder({ ...editOrder, lunchbox_requested: e.target.checked })} />
                      ) : o.lunchbox_requested ? "✅" : "—"}
                    </td>
                    <td style={styles.td}>CHF {o.total_price?.toFixed(2)}</td>
                    <td style={styles.td}>{o.payment_status === "paid" ? "✅" : "Ausstehend"}</td>
                    <td style={styles.td}>
                      {canEdit && !isEditing && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={styles.btnSmall} onClick={() => setEditOrder({ ...o })}>Bearbeiten</button>
                          <button style={{ ...styles.btnSmallRed, opacity: deleting === o.id ? 0.5 : 1 }}
                            onClick={() => handleDelete(o)}>🗑️</button>
                        </div>
                      )}
                      {isEditing && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={styles.btnSmallGreen}
                            onClick={() => handleSave(o, { menu_choice: editOrder.menu_choice, is_vegetarian: editOrder.is_vegetarian, lunchbox_requested: editOrder.lunchbox_requested })}>
                            Speichern
                          </button>
                          <button style={styles.btnSmall} onClick={() => setEditOrder(null)}>✕</button>
                        </div>
                      )}
                      {!canEdit && <span style={{ color: "#9ca3af", fontSize: 12 }}>Frist abgelaufen</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// CONTACT: BESTELLÜBERSICHT
// ============================================
function ContactOrders() {
  const { supabase, profile } = useAuth();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openWeeks, setOpenWeeks] = useState({});

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    setLoading(true);
    const { data } = await supabase
      .from("order_summary")
      .select("*")
      .eq("company_name", profile?.companies?.name)
      .order("year", { ascending: false })
      .order("week_number", { ascending: false })
      .order("full_name");
    setOrders(data || []);
    if (data && data.length > 0) {
      const firstKey = `${data[0].year}-${data[0].week_number}`;
      setOpenWeeks({ [firstKey]: true });
    }
    setLoading(false);
  }

  async function markPaid(orderId) {
    await supabase.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
    loadOrders();
  }

  async function markLunchboxReturned(orderId) {
    await supabase.from("orders").update({ lunchbox_returned: true }).eq("id", orderId);
    loadOrders();
  }

  function toggleWeek(key) {
    setOpenWeeks(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const grouped = {};
  orders.forEach(o => {
    const key = `${o.year}-${o.week_number}`;
    if (!grouped[key]) grouped[key] = { week: o.week_number, year: o.year, orders: [] };
    grouped[key].orders.push(o);
  });
  const weeks = Object.values(grouped);

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>Bestellübersicht</h1>

      {weeks.length === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: 48 }}>📭</div>
          <p>Noch keine Bestellungen vorhanden.</p>
        </div>
      )}

      {weeks.map(({ week, year, orders: weekOrders }) => {
        const key = `${year}-${week}`;
        const isOpen = !!openWeeks[key];
        const total = weekOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);

        return (
          <div key={key} style={{ background: "#fff", border: "1px solid #e7e5e4", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            {/* Akkordeon-Header */}
            <div
              onClick={() => toggleWeek(key)}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", cursor: "pointer", background: isOpen ? "#fff7ed" : "#fff", borderBottom: isOpen ? "1px solid #e7e5e4" : "none" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18 }}>{isOpen ? "▾" : "▸"}</span>
                <strong style={{ fontSize: 16, color: "#1c1917" }}>KW {week} / {year}</strong>
                <span style={{ background: "#f5f5f4", color: "#78716c", borderRadius: 20, padding: "2px 10px", fontSize: 13 }}>
                  {weekOrders.length} Bestellung{weekOrders.length !== 1 ? "en" : ""}
                </span>
              </div>
              <span style={{ fontWeight: 700, color: "#b45309" }}>CHF {total.toFixed(2)}</span>
            </div>

            {/* Inhalt */}
            {isOpen && (
              isMobile ? (
                // ── MOBILE: Cards ──
                <div style={{ padding: "12px" }}>
                  {weekOrders.map(o => (
                    <div key={o.id} style={{ ...styles.mobileCard, marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{o.full_name}</div>
                      <div style={styles.mobileCardRow}>
                        <span style={styles.mobileCardLabel}>Menü</span>
                        <span style={styles.mobileCardValue}>Menü {o.menu_choice}: {o.menu_title}</span>
                      </div>
                      <div style={styles.mobileCardRow}>
                        <span style={styles.mobileCardLabel}>Vegetarisch</span>
                        <span>{o.is_vegetarian ? "✅" : "—"}</span>
                      </div>
                      {o.protein_choice && (
                        <div style={styles.mobileCardRow}>
                          <span style={styles.mobileCardLabel}>Protein</span>
                          <span>{o.protein_choice}</span>
                        </div>
                      )}
                      <div style={styles.mobileCardRow}>
                        <span style={styles.mobileCardLabel}>Lunchbox ↩</span>
                        <span style={{ color: o.lunchbox_returned ? "#15803d" : o.lunchbox_requested ? "#92400e" : "#6b7280" }}>
                          {o.lunchbox_returned ? "✅ Zurück" : o.lunchbox_requested ? "⏳ Ausstehend" : "—"}
                        </span>
                      </div>
                      <div style={styles.mobileCardRow}>
                        <span style={styles.mobileCardLabel}>Preis</span>
                        <span style={styles.mobileCardValue}>CHF {parseFloat(o.total_price).toFixed(2)}</span>
                      </div>
                      <div style={{ ...styles.mobileCardRow, borderBottom: "none" }}>
                        <span style={styles.mobileCardLabel}>Bezahlt</span>
                        <span style={{ fontWeight: 600, color: o.payment_status === "paid" ? "#15803d" : "#92400e" }}>
                          {o.payment_status === "paid" ? "✅ Bezahlt" : "⏳ Ausstehend"}
                        </span>
                      </div>
                      <div style={styles.mobileCardActions}>
                        {o.payment_status !== "paid" && (
                          <button style={styles.btnSmall} onClick={() => markPaid(o.id)}>✅ Bezahlt</button>
                        )}
                        {o.lunchbox_requested && !o.lunchbox_returned && (
                          <button style={{ ...styles.btnSmall, background: "#065f46" }} onClick={() => markLunchboxReturned(o.id)}>📦 Zurück</button>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={{ textAlign: "right", fontWeight: 700, fontSize: 15, paddingTop: 8, borderTop: "2px solid #e7e5e4" }}>
                    Total: CHF {total.toFixed(2)}
                  </div>
                </div>
              ) : (
                // ── DESKTOP: Tabelle ──
                <div style={styles.tableWrapper}>
                  <table style={styles.table}>
                    <thead>
                      <tr>{["Name", "Menü", "Vegi", "Protein", "Lunchbox ↩", "Preis", "Bezahlt", "Aktionen"].map(h => (
                        <th key={h} style={styles.th}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {weekOrders.map(o => (
                        <tr key={o.id} style={styles.tr}>
                          <td style={styles.td}>{o.full_name}</td>
                          <td style={styles.td}>Menü {o.menu_choice}: {o.menu_title}</td>
                          <td style={styles.td}>{o.is_vegetarian ? "✅" : "—"}</td>
                          <td style={styles.td}>{o.protein_choice || "—"}</td>
                          <td style={styles.td}>{o.lunchbox_returned ? "✅" : o.lunchbox_requested ? "Ausstehend" : "—"}</td>
                          <td style={styles.td}>CHF {parseFloat(o.total_price).toFixed(2)}</td>
                          <td style={styles.td}>{o.payment_status === "paid" ? "✅" : "Ausstehend"}</td>
                          <td style={styles.td}>
                            <div style={{ display: "flex", gap: 4 }}>
                              {o.payment_status !== "paid" && (
                                <button style={styles.btnSmall} onClick={() => markPaid(o.id)}>Bezahlt</button>
                              )}
                              {o.lunchbox_requested && !o.lunchbox_returned && (
                                <button style={{ ...styles.btnSmall, background: "#065f46" }} onClick={() => markLunchboxReturned(o.id)}>Zurück</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={styles.totalRow}>
                    <strong>Total: CHF {total.toFixed(2)}</strong>
                  </div>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// ADMIN: BESTELLUNGEN + PDF EXPORT
// ============================================
function AdminOrders() {
  const { supabase } = useAuth();
  const isMobile = useIsMobile();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterWeek, setFilterWeek] = useState(getWeekNumber().week);
  const [filterYear, setFilterYear] = useState(getWeekNumber().year);
  const [filterCompany, setFilterCompany] = useState("all");
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    supabase.from("companies").select("*").then(({ data }) => setCompanies(data || []));
  }, []);

  useEffect(() => { loadOrders(); }, [filterWeek, filterYear, filterCompany]);

  async function loadOrders() {
    setLoading(true);
    let q = supabase.from("order_summary").select("*")
      .eq("week_number", filterWeek).eq("year", filterYear)
      .order("company_name").order("full_name");
    if (filterCompany !== "all") q = q.eq("company_name", filterCompany);
    const { data } = await q;
    setOrders(data || []);
    setLoading(false);
  }

  async function markPaid(orderId) {
    await supabase.from("orders").update({ payment_status: "paid" }).eq("id", orderId);
    loadOrders();
  }

  async function markLunchboxReturned(orderId) {
    await supabase.from("orders").update({ lunchbox_returned: true }).eq("id", orderId);
    loadOrders();
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`Thai Menü – KW ${filterWeek}/${filterYear}`, 14, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Erstellt am: ${new Date().toLocaleDateString("de-CH")}`, 14, 28);
    const grouped = {};
    orders.forEach(o => {
      if (!grouped[o.company_name]) grouped[o.company_name] = [];
      grouped[o.company_name].push(o);
    });
    let y = 38;
    Object.entries(grouped).forEach(([company, compOrders]) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(company, 14, y); y += 7;
      doc.autoTable({
        startY: y,
        head: [["Name", "Menü", "Vegi", "Protein"]],
        body: compOrders.map(o => [
          o.full_name,
          `Menü ${o.menu_choice}: ${o.menu_title}`,
          o.is_vegetarian ? "Ja" : "Nein",
          o.protein_choice || "—",
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [180, 83, 9] },
        margin: { left: 14, right: 14 },
      });
      const total = compOrders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
      y = doc.lastAutoTable.finalY + 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`Total ${company}: CHF ${total.toFixed(2)}`, 14, y);
      y += 10;
    });
    const grandTotal = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    if (y > 270) doc.addPage();
    doc.setFontSize(13);
    doc.text(`Gesamttotal: CHF ${grandTotal.toFixed(2)}`, 14, y + 5);
    doc.save(`ThaiMenue_KW${filterWeek}_${filterYear}.pdf`);
  }

  return (
    <div style={styles.pageContainer}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h1 style={styles.pageTitle}>Bestellungen</h1>
        <button style={styles.btnPrimary} onClick={exportPDF}>📄 PDF</button>
      </div>

      {/* Filter */}
      <div style={{ marginBottom: 16 }}>
        {/* KW + Jahr nebeneinander */}
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <label style={styles.label}>KW</label>
            <input type="number" value={filterWeek} onChange={e => setFilterWeek(Number(e.target.value))}
              style={{ ...styles.input, minWidth: 0 }} min={1} max={53} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <label style={styles.label}>Jahr</label>
            <input type="number" value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
              style={{ ...styles.input, minWidth: 0 }} />
          </div>
        </div>
        {/* Firma */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={styles.label}>Firma</label>
          <select style={styles.select} value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
            <option value="all">Alle Firmen</option>
            {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? <LoadingScreen /> : (
        isMobile ? (
          // ── MOBILE: Cards ──
          <div>
            {orders.length === 0 && (
              <div style={styles.emptyState}><div style={{ fontSize: 48 }}>📭</div><p>Keine Bestellungen gefunden.</p></div>
            )}
            {orders.map(o => (
              <div key={o.id} style={styles.mobileCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{o.full_name}</div>
                    <div style={{ fontSize: 13, color: "#78716c" }}>{o.company_name}</div>
                  </div>
                  <span style={{ ...styles.weekBadge, fontSize: 12 }}>KW {filterWeek}</span>
                </div>
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Menü</span>
                  <span style={styles.mobileCardValue}>Menü {o.menu_choice}: {o.menu_title}</span>
                </div>
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Vegetarisch</span>
                  <span>{o.is_vegetarian ? "✅ Ja" : "—"}</span>
                </div>
                {o.protein_choice && (
                  <div style={styles.mobileCardRow}>
                    <span style={styles.mobileCardLabel}>Protein</span>
                    <span>{o.protein_choice}</span>
                  </div>
                )}
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Lunchbox</span>
                  <span>{o.lunchbox_requested ? "Ja" : "—"}</span>
                </div>
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Lunchbox ↩</span>
                  <span style={{ color: o.lunchbox_returned ? "#15803d" : o.lunchbox_requested ? "#92400e" : "#6b7280" }}>
                    {o.lunchbox_returned ? "✅ Zurück" : o.lunchbox_requested ? "⏳ Ausstehend" : "—"}
                  </span>
                </div>
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Preis</span>
                  <span style={styles.mobileCardValue}>CHF {parseFloat(o.total_price).toFixed(2)}</span>
                </div>
                <div style={{ ...styles.mobileCardRow, borderBottom: "none" }}>
                  <span style={styles.mobileCardLabel}>Bezahlt</span>
                  <span style={{ fontWeight: 600, color: o.payment_status === "paid" ? "#15803d" : "#92400e" }}>
                    {o.payment_status === "paid" ? "✅ Bezahlt" : "⏳ Ausstehend"}
                  </span>
                </div>
                <div style={styles.mobileCardActions}>
                  {o.payment_status !== "paid" && (
                    <button style={styles.btnSmall} onClick={() => markPaid(o.id)}>✅ Bezahlt</button>
                  )}
                  {o.lunchbox_requested && !o.lunchbox_returned && (
                    <button style={{ ...styles.btnSmall, background: "#065f46" }} onClick={() => markLunchboxReturned(o.id)}>📦 Lunchbox zurück</button>
                  )}
                </div>
              </div>
            ))}
            {orders.length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 16, padding: "12px 0" }}>
                Total: CHF {orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2)}
              </div>
            )}
          </div>
        ) : (
          // ── DESKTOP: Tabelle ──
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>{["Firma", "Name", "Menü", "Vegi", "Protein", "Lunchbox", "Lunchbox ↩", "Preis", "Bezahlt", "Aktionen"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} style={styles.tr}>
                    <td style={styles.td}>{o.company_name}</td>
                    <td style={styles.td}>{o.full_name}</td>
                    <td style={styles.td}>Menü {o.menu_choice}: {o.menu_title}</td>
                    <td style={styles.td}>{o.is_vegetarian ? "✅" : "—"}</td>
                    <td style={styles.td}>{o.protein_choice || "—"}</td>
                    <td style={styles.td}>{o.lunchbox_requested ? "Ja" : "—"}</td>
                    <td style={styles.td}>{o.lunchbox_returned ? "✅" : o.lunchbox_requested ? "Ausstehend" : "—"}</td>
                    <td style={styles.td}>CHF {parseFloat(o.total_price).toFixed(2)}</td>
                    <td style={styles.td}>{o.payment_status === "paid" ? "✅" : "Ausstehend"}</td>
                    <td style={styles.td}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {o.payment_status !== "paid" && (
                          <button style={styles.btnSmall} onClick={() => markPaid(o.id)}>Bezahlt</button>
                        )}
                        {o.lunchbox_requested && !o.lunchbox_returned && (
                          <button style={{ ...styles.btnSmall, background: "#065f46" }} onClick={() => markLunchboxReturned(o.id)}>Lunchbox zurück</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td colSpan={10} style={{ ...styles.td, textAlign: "center", color: "#9ca3af" }}>Keine Bestellungen gefunden.</td></tr>
                )}
              </tbody>
            </table>
            <div style={styles.totalRow}>
              <strong>Total: CHF {orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0).toFixed(2)}</strong>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ============================================
// ADMIN: BENUTZER VERWALTEN
// ============================================
function AdminUsers() {
  const { supabase } = useAuth();
  const isMobile = useIsMobile();
  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("profiles").select("*, companies(name)").order("created_at", { ascending: false }),
      supabase.from("companies").select("*")
    ]).then(([{ data: u }, { data: c }]) => {
      setUsers(u || []); setCompanies(c || []); setLoading(false);
    });
  }, []);

  async function toggleApproval(userId, current) {
    await supabase.from("profiles").update({ is_approved: !current }).eq("id", userId);
    setUsers(users.map(u => u.id === userId ? { ...u, is_approved: !current } : u));
  }

  async function toggleAdmin(userId, current) {
    await supabase.from("profiles").update({ is_admin: !current }).eq("id", userId);
    setUsers(users.map(u => u.id === userId ? { ...u, is_admin: !current } : u));
  }

  async function updateCompany(userId, companyId) {
    await supabase.from("profiles").update({ company_id: companyId }).eq("id", userId);
    const company = companies.find(c => c.id === companyId);
    setUsers(users.map(u => u.id === userId ? { ...u, company_id: companyId, companies: company } : u));
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>Benutzer verwalten</h1>

      {isMobile ? (
        // ── MOBILE: Cards ──
        <div>
          {users.map(u => (
            <div key={u.id} style={styles.mobileCard}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{u.full_name}</div>
                <div style={{ fontSize: 13, color: "#78716c" }}>{u.email}</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  Registriert: {new Date(u.created_at).toLocaleDateString("de-CH")}
                </div>
              </div>

              <div style={styles.mobileCardRow}>
                <span style={styles.mobileCardLabel}>Firma</span>
                <select style={{ ...styles.select, padding: "4px 8px", width: "auto", fontSize: 14 }}
                  value={u.company_id || ""} onChange={e => updateCompany(u.id, e.target.value)}>
                  <option value="">—</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ ...styles.mobileCardRow, borderBottom: "none", marginTop: 10 }}>
                <div style={styles.mobileCardActions}>
                  <button style={u.is_approved ? styles.btnSmallGreen : styles.btnSmallRed}
                    onClick={() => toggleApproval(u.id, u.is_approved)}>
                    {u.is_approved ? "✅ Freigegeben" : "❌ Gesperrt"}
                  </button>
                  <button style={u.is_admin ? styles.btnSmallGreen : styles.btnSmall}
                    onClick={() => toggleAdmin(u.id, u.is_admin)}>
                    {u.is_admin ? "👑 Admin" : "— Admin"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── DESKTOP: Tabelle ──
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>{["Name", "E-Mail", "Firma", "Freigegeben", "Admin", "Registriert"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={styles.tr}>
                  <td style={styles.td}>{u.full_name}</td>
                  <td style={styles.td}>{u.email}</td>
                  <td style={styles.td}>
                    <select style={{ ...styles.select, width: 160, padding: "4px 8px" }}
                      value={u.company_id || ""} onChange={e => updateCompany(u.id, e.target.value)}>
                      <option value="">—</option>
                      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td style={styles.td}>
                    <button style={u.is_approved ? styles.btnSmallGreen : styles.btnSmallRed}
                      onClick={() => toggleApproval(u.id, u.is_approved)}>
                      {u.is_approved ? "✅ Ja" : "❌ Nein"}
                    </button>
                  </td>
                  <td style={styles.td}>
                    <button style={u.is_admin ? styles.btnSmallGreen : styles.btnSmall}
                      onClick={() => toggleAdmin(u.id, u.is_admin)}>
                      {u.is_admin ? "✅" : "—"}
                    </button>
                  </td>
                  <td style={styles.td}>{new Date(u.created_at).toLocaleDateString("de-CH")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// ADMIN: MENÜ-POOL
// ============================================
function AdminMenus() {
  const { supabase } = useAuth();
  const isMobile = useIsMobile();
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMenu, setNewMenu] = useState({ title: "", description: "", is_vegetarian_possible: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("menu_pool").select("*").order("title").then(({ data }) => { setMenus(data || []); setLoading(false); });
  }, []);

  async function addMenu(e) {
    e.preventDefault();
    setSaving(true);
    const { data } = await supabase.from("menu_pool").insert(newMenu).select().single();
    if (data) setMenus([...menus, data]);
    setNewMenu({ title: "", description: "", is_vegetarian_possible: true });
    setSaving(false);
  }

  async function deleteMenu(id) {
    if (!confirm("Menü wirklich löschen?")) return;
    await supabase.from("menu_pool").delete().eq("id", id);
    setMenus(menus.filter(m => m.id !== id));
  }

  if (loading) return <LoadingScreen />;

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>Menü-Pool verwalten</h1>

      {/* Formular */}
      <div style={styles.card}>
        <h3 style={{ marginBottom: 16 }}>Neues Menü hinzufügen</h3>
        <form onSubmit={addMenu} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: 12 }}>
            <Input label="Titel" value={newMenu.title} onChange={e => setNewMenu({ ...newMenu, title: e.target.value })} required />
            <Input label="Beschreibung" value={newMenu.description} onChange={e => setNewMenu({ ...newMenu, description: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Bild hochladen</label>
              <input type="file" accept="image/*" style={styles.input} onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}.${fileExt}`;
                const { data, error } = await supabase.storage.from('menu-images').upload(fileName, file);
                if (!error) {
                  const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
                  setNewMenu(m => ({ ...m, image_url: urlData.publicUrl }));
                }
              }} />
              {newMenu.image_url && <img src={newMenu.image_url} alt="Vorschau" style={{ marginTop: 8, height: 80, borderRadius: 6, objectFit: "cover" }} />}
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.label}>Protein-Auswahl (z.B. "Poulet, Crevetten")</label>
              <input style={styles.input} value={newMenu.protein_options || ""}
                placeholder="z.B. Poulet, Crevetten oder leer lassen"
                onChange={e => setNewMenu({ ...newMenu, protein_options: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <label style={styles.checkboxLabel}>
              <input type="checkbox" checked={newMenu.is_vegetarian_possible} onChange={e => setNewMenu({ ...newMenu, is_vegetarian_possible: e.target.checked })} />
              Vegetarisch möglich
            </label>
            <button type="submit" style={styles.btnPrimary} disabled={saving}>
              {saving ? "Speichern…" : "Hinzufügen"}
            </button>
          </div>
        </form>
      </div>

      {/* Menü-Liste */}
      {isMobile ? (
        // ── MOBILE: Cards ──
        <div>
          {menus.map(m => (
            <div key={m.id} style={styles.mobileCard}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 10 }}>
                {m.image_url
                  ? <img src={m.image_url} alt={m.title} style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 64, height: 64, borderRadius: 8, background: "#f5f5f4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 24 }}>🍽️</span>
                  </div>
                }
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{m.title}</div>
                  <div style={{ fontSize: 13, color: "#78716c", lineHeight: 1.4 }}>{m.description}</div>
                </div>
              </div>
              {m.protein_options && m.protein_options !== "keine" && (
                <div style={styles.mobileCardRow}>
                  <span style={styles.mobileCardLabel}>Protein</span>
                  <span>{m.protein_options.split(",").join(" / ")}</span>
                </div>
              )}
              <div style={{ ...styles.mobileCardRow, borderBottom: "none" }}>
                <span style={styles.mobileCardLabel}>Vegetarisch möglich</span>
                <span>{m.is_vegetarian_possible ? "✅ Ja" : "—"}</span>
              </div>
              <div style={styles.mobileCardActions}>
                <label style={{ ...styles.btnSmall, cursor: "pointer" }}>
                  📷 Bild ersetzen
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${Date.now()}.${fileExt}`;
                    const { error } = await supabase.storage.from('menu-images').upload(fileName, file);
                    if (!error) {
                      const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
                      await supabase.from('menu_pool').update({ image_url: urlData.publicUrl }).eq('id', m.id);
                      setMenus(menus.map(x => x.id === m.id ? { ...x, image_url: urlData.publicUrl } : x));
                    }
                  }} />
                </label>
                <button style={styles.btnSmallRed} onClick={() => deleteMenu(m.id)}>🗑️ Löschen</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── DESKTOP: Tabelle ──
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>{["Titel", "Beschreibung", "Protein", "Vegetarisch", "Bild", "Aktionen"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {menus.map(m => (
                <tr key={m.id} style={styles.tr}>
                  <td style={styles.td}><strong>{m.title}</strong></td>
                  <td style={styles.td}>{m.description}</td>
                  <td style={styles.td}>{m.protein_options === "keine" || !m.protein_options ? "—" : m.protein_options.split(",").join(" / ")}</td>
                  <td style={styles.td}>{m.is_vegetarian_possible ? "✅" : "—"}</td>
                  <td style={styles.td}>
                    {m.image_url
                      ? <img src={m.image_url} alt={m.title} style={{ height: 40, borderRadius: 4, objectFit: "cover" }} />
                      : <span style={{ color: "#9ca3af", fontSize: 12 }}>Kein Bild</span>}
                  </td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <label style={{ ...styles.btnSmall, cursor: "pointer" }}>
                        Bild
                        <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                          const file = e.target.files[0];
                          if (!file) return;
                          const fileExt = file.name.split('.').pop();
                          const fileName = `${Date.now()}.${fileExt}`;
                          const { error } = await supabase.storage.from('menu-images').upload(fileName, file);
                          if (!error) {
                            const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
                            await supabase.from('menu_pool').update({ image_url: urlData.publicUrl }).eq('id', m.id);
                            setMenus(menus.map(x => x.id === m.id ? { ...x, image_url: urlData.publicUrl } : x));
                          }
                        }} />
                      </label>
                      <button style={styles.btnSmallRed} onClick={() => deleteMenu(m.id)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// ADMIN: WOCHENMENÜS
// ============================================
function AdminWeeklyMenus() {
  const { supabase } = useAuth();
  const isMobile = useIsMobile();
  const [weeklyMenus, setWeeklyMenus] = useState([]);
  const [menuPool, setMenuPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const { week, year } = getWeekNumber();

  function getWeekDates(weekNum, yearNum) {
    const jan4 = new Date(yearNum, 0, 4);
    const startOfWeek = new Date(jan4);
    startOfWeek.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (weekNum - 1) * 7);
    const tuesday = new Date(startOfWeek);
    tuesday.setDate(startOfWeek.getDate() + 1);
    tuesday.setHours(13, 0, 0, 0);
    const wednesday = new Date(startOfWeek);
    wednesday.setDate(startOfWeek.getDate() + 2);
    const toLocalISO = (d) => {
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const toDateISO = (d) => {
      const pad = n => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    return { deadline: toLocalISO(tuesday), delivery: toDateISO(wednesday) };
  }

  const { deadline, delivery } = getWeekDates(week, year);
  const [form, setForm] = useState({
    week_number: week, year,
    menu1_id: "", menu2_id: "",
    order_deadline: deadline,
    delivery_date: delivery,
    price_per_menu: 17.00
  });
  const [saving, setSaving] = useState(false);
  const [randomizing, setRandomizing] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("weekly_menus").select("*, menu1:menu1_id(title), menu2:menu2_id(title)").order("year", { ascending: false }).order("week_number", { ascending: false }),
      supabase.from("menu_pool").select("*").order("title")
    ]).then(([{ data: w }, { data: m }]) => {
      setWeeklyMenus(w || []); setMenuPool(m || []); setLoading(false);
    });
  }, []);

  function randomizeMenus() {
    if (menuPool.length < 2) return;
    setRandomizing(true);
    const shuffled = [...menuPool].sort(() => Math.random() - 0.5);
    setForm({ ...form, menu1_id: shuffled[0].id, menu2_id: shuffled[1].id });
    setTimeout(() => setRandomizing(false), 600);
  }

  async function saveWeeklyMenu(e) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.from("weekly_menus").upsert(form, { onConflict: "week_number,year" }).select("*, menu1:menu1_id(title), menu2:menu2_id(title)").single();
    if (!error && data) {
      setWeeklyMenus(prev => {
        const idx = prev.findIndex(w => w.week_number === data.week_number && w.year === data.year);
        return idx >= 0 ? prev.map((w, i) => i === idx ? data : w) : [data, ...prev];
      });
    }
    setSaving(false);
  }

  if (loading) return <LoadingScreen />;

  const m1 = menuPool.find(m => m.id === form.menu1_id);
  const m2 = menuPool.find(m => m.id === form.menu2_id);

  return (
    <div style={styles.pageContainer}>
      <h1 style={styles.pageTitle}>Wochenmenüs verwalten</h1>

      {/* Formular */}
      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Menü für KW erfassen</h3>
          <button style={styles.btnSecondary} onClick={randomizeMenus} disabled={randomizing}>
            🎲 {randomizing ? "Wird ausgewählt…" : "Zufällig"}
          </button>
        </div>
        <form onSubmit={saveWeeklyMenu} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Kalenderwoche</label>
            <input type="number" style={styles.input} value={form.week_number}
              onChange={e => setForm({ ...form, week_number: Number(e.target.value) })} min={1} max={53} required />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Jahr</label>
            <input type="number" style={styles.input} value={form.year}
              onChange={e => setForm({ ...form, year: Number(e.target.value) })} required />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Menü 1 {m1 && <span style={styles.vegiTag}>{m1.title}</span>}</label>
            <select style={styles.select} value={form.menu1_id} onChange={e => setForm({ ...form, menu1_id: e.target.value })} required>
              <option value="">Auswählen…</option>
              {menuPool.filter(m => m.id !== form.menu2_id).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Menü 2 {m2 && <span style={styles.vegiTag}>{m2.title}</span>}</label>
            <select style={styles.select} value={form.menu2_id} onChange={e => setForm({ ...form, menu2_id: e.target.value })} required>
              <option value="">Auswählen…</option>
              {menuPool.filter(m => m.id !== form.menu1_id).map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Bestellfrist</label>
            <input type="datetime-local" style={styles.input} value={form.order_deadline}
              onChange={e => setForm({ ...form, order_deadline: e.target.value })} required />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Lieferdatum</label>
            <input type="date" style={styles.input} value={form.delivery_date}
              onChange={e => setForm({ ...form, delivery_date: e.target.value })} required />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Preis pro Menü (CHF)</label>
            <input type="number" step="0.50" style={styles.input} value={form.price_per_menu}
              onChange={e => setForm({ ...form, price_per_menu: parseFloat(e.target.value) })} required />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" style={{ ...styles.btnPrimary, width: "100%" }} disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>

      {/* Wochenmenü-Liste */}
      {isMobile ? (
        // ── MOBILE: Cards ──
        <div>
          {weeklyMenus.map(w => (
            <div key={w.id} style={styles.mobileCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={styles.weekBadge}>KW {w.week_number} / {w.year}</span>
                <span style={{ fontWeight: 700, color: "#b45309" }}>CHF {parseFloat(w.price_per_menu).toFixed(2)}</span>
              </div>
              <div style={styles.mobileCardRow}>
                <span style={styles.mobileCardLabel}>Menü 1</span>
                <span style={styles.mobileCardValue}>{w.menu1?.title || "—"}</span>
              </div>
              <div style={styles.mobileCardRow}>
                <span style={styles.mobileCardLabel}>Menü 2</span>
                <span style={styles.mobileCardValue}>{w.menu2?.title || "—"}</span>
              </div>
              <div style={styles.mobileCardRow}>
                <span style={styles.mobileCardLabel}>Bestellfrist</span>
                <span style={{ fontSize: 13 }}>{w.order_deadline ? new Date(w.order_deadline).toLocaleString("de-CH") : "—"}</span>
              </div>
              <div style={{ ...styles.mobileCardRow, borderBottom: "none" }}>
                <span style={styles.mobileCardLabel}>Lieferdatum</span>
                <span>{w.delivery_date}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ── DESKTOP: Tabelle ──
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>{["KW", "Jahr", "Menü 1", "Menü 2", "Bestellfrist", "Lieferdatum", "Preis"].map(h => <th key={h} style={styles.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {weeklyMenus.map(w => (
                <tr key={w.id} style={styles.tr}>
                  <td style={styles.td}>{w.week_number}</td>
                  <td style={styles.td}>{w.year}</td>
                  <td style={styles.td}>{w.menu1?.title}</td>
                  <td style={styles.td}>{w.menu2?.title}</td>
                  <td style={styles.td}>{w.order_deadline ? new Date(w.order_deadline).toLocaleString("de-CH") : "—"}</td>
                  <td style={styles.td}>{w.delivery_date}</td>
                  <td style={styles.td}>CHF {parseFloat(w.price_per_menu).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================
// SHARED COMPONENTS
// ============================================
function Input({ label, style, ...props }) {
  return (
    <div style={{ ...styles.inputGroup, ...style }}>
      {label && <label style={styles.label}>{label}</label>}
      <input style={styles.input} {...props} />
    </div>
  );
}

// ============================================
// STYLES
// ============================================
const styles = {
  // Layout
  appContainer: { minHeight: "100vh", background: "#fafaf9", fontFamily: "'Segoe UI', system-ui, sans-serif" },
  main: { maxWidth: 1200, margin: "0 auto", padding: "24px 16px" },
  mainMobile: { padding: "14px 12px" },
  pageContainer: { maxWidth: 1100, margin: "0 auto" },
  pageHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  pageHeaderRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  pageTitle: { fontSize: 24, fontWeight: 700, color: "#1c1917", margin: 0 },
  weekBadge: { background: "#b45309", color: "#fff", padding: "4px 12px", borderRadius: 20, fontWeight: 700, fontSize: 14 },

  // Nav
  nav: { background: "#292524", padding: "0 16px", display: "flex", alignItems: "center", gap: 16, height: 56, position: "sticky", top: 0, zIndex: 100 },
  navBrand: { color: "#fff", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" },
  navLinks: { display: "flex", gap: 4, flex: 1 },
  navLink: { background: "none", border: "none", color: "#a8a29e", cursor: "pointer", padding: "8px 14px", borderRadius: 6, fontSize: 14, transition: "all .15s" },
  navLinkActive: { background: "#44403c", border: "none", color: "#fef3c7", cursor: "pointer", padding: "8px 14px", borderRadius: 6, fontSize: 14, fontWeight: 600 },
  navUser: { color: "#d6d3d1", fontSize: 13 },
  navRight: { display: "flex", alignItems: "center", gap: 12 },
  hamburger: { background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: 22, padding: "8px", lineHeight: 1 },
  mobileDropdown: { background: "#292524", position: "sticky", top: 56, zIndex: 99, display: "flex", flexDirection: "column", padding: "8px", gap: 2, borderBottom: "1px solid #3a3735" },
  mobileNavLink: { background: "none", border: "none", color: "#a8a29e", cursor: "pointer", padding: "12px 16px", borderRadius: 8, fontSize: 15, textAlign: "left", fontWeight: 500 },
  mobileNavLinkActive: { background: "#44403c", border: "none", color: "#fef3c7", cursor: "pointer", padding: "12px 16px", borderRadius: 8, fontSize: 15, textAlign: "left", fontWeight: 700 },

  // Login
  loginBg: { minHeight: "100vh", background: "linear-gradient(135deg, #78350f 0%, #451a03 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" },
  loginCard: { background: "#fff", borderRadius: 16, padding: "28px 20px", width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.3)" },
  loginHeader: { textAlign: "center", marginBottom: 24 },
  loginTitle: { fontSize: 26, fontWeight: 800, color: "#1c1917", margin: "8px 0 4px" },
  loginSubtitle: { color: "#78716c", fontSize: 14 },
  tabRow: { display: "flex", background: "#f5f5f4", borderRadius: 8, padding: 4, marginBottom: 20 },
  tab: { flex: 1, padding: "8px", background: "none", border: "none", cursor: "pointer", borderRadius: 6, color: "#78716c", fontSize: 14 },
  tabActive: { flex: 1, padding: "8px", background: "#fff", border: "none", cursor: "pointer", borderRadius: 6, color: "#1c1917", fontWeight: 700, fontSize: 14, boxShadow: "0 1px 4px rgba(0,0,0,.1)" },

  // Form elements
  form: { display: "flex", flexDirection: "column", gap: 12 },
  inputGroup: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 13, fontWeight: 600, color: "#44403c" },
  input: { padding: "12px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 16, outline: "none", background: "#fff", width: "100%" },
  select: { padding: "12px 12px", border: "1.5px solid #e7e5e4", borderRadius: 8, fontSize: 16, background: "#fff", cursor: "pointer", width: "100%" },
  checkboxLabel: { display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, cursor: "pointer", lineHeight: 1.5 },
  checkbox: { width: 18, height: 18, cursor: "pointer", marginTop: 2, flexShrink: 0 },
  radioRow: { display: "flex", gap: 12, marginTop: 6 },
  radioLabel: { display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 14 },
  hint: { fontSize: 12, color: "#9ca3af", textAlign: "center" },

  // Buttons
  btnPrimary: { padding: "14px 20px", background: "#b45309", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 16, transition: "opacity .15s" },
  btnSecondary: { padding: "12px 16px", background: "#e7e5e4", color: "#44403c", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  btnLogout: { padding: "8px 14px", background: "#44403c", color: "#d6d3d1", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" },
  btnSmall: { padding: "7px 12px", background: "#b45309", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  btnSmallGreen: { padding: "7px 12px", background: "#15803d", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  btnSmallRed: { padding: "7px 12px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },

  // Menu cards
  menuGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  menuCard: { border: "2.5px solid #e7e5e4", borderRadius: 12, padding: 16, cursor: "pointer", background: "#fff", transition: "all .2s" },
  menuCardSelected: { border: "2.5px solid #b45309", background: "#fff7ed" },
  menuCardNumber: { fontSize: 12, fontWeight: 700, color: "#b45309", textTransform: "uppercase", marginBottom: 6 },
  menuCardTitle: { fontSize: 18, fontWeight: 700, color: "#1c1917", margin: "0 0 8px" },
  menuCardDesc: { fontSize: 13, color: "#78716c", lineHeight: 1.5 },
  vegiTag: { display: "inline-block", fontSize: 11, background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: 20, marginTop: 8 },

  // Option cards
  optionCard: { background: "#fff", border: "1.5px solid #e7e5e4", borderRadius: 10, padding: 14, marginBottom: 10 },
  priceRow: { display: "flex", justifyContent: "space-between", padding: "14px 0", borderTop: "1px solid #e7e5e4", fontSize: 16, marginBottom: 16 },

  // Success / order
  successCard: { background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 12, padding: 20 },
  orderSummary: { background: "#fff", borderRadius: 10, padding: 16, margin: "16px 0" },
  orderRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f5f5f4", fontSize: 14 },

  // Alerts
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 14px", borderRadius: 8, fontSize: 14, marginBottom: 8 },
  successBox: { background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#15803d", padding: "10px 14px", borderRadius: 8, fontSize: 14, marginBottom: 8 },
  warningBox: { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 },
  emptyState: { textAlign: "center", padding: "60px 20px", color: "#9ca3af" },

  // Table (Desktop)
  tableWrapper: { background: "#fff", borderRadius: 12, overflow: "auto", border: "1px solid #e7e5e4", marginTop: 16 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { background: "#f5f5f4", padding: "12px 14px", textAlign: "left", fontWeight: 700, color: "#44403c", borderBottom: "1px solid #e7e5e4", whiteSpace: "nowrap" },
  td: { padding: "11px 14px", borderBottom: "1px solid #f5f5f4", color: "#1c1917", verticalAlign: "middle" },
  tr: { transition: "background .1s" },
  totalRow: { padding: "12px 16px", textAlign: "right", borderTop: "2px solid #e7e5e4", fontSize: 16 },

  // Mobile card views
  mobileCard: { background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #e7e5e4", marginBottom: 12 },
  mobileCardRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #f5f5f4", fontSize: 14, gap: 8 },
  mobileCardLabel: { color: "#78716c", fontSize: 13, flexShrink: 0 },
  mobileCardValue: { fontWeight: 600, color: "#1c1917", textAlign: "right" },
  mobileCardActions: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },

  // Misc
  card: { background: "#fff", borderRadius: 12, padding: 20, border: "1px solid #e7e5e4", marginBottom: 16 },
  loadingScreen: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" },
  loadingContent: { textAlign: "center" },
  loadingText: { color: "#78716c", marginTop: 12 },
  spinner: { width: 40, height: 40, border: "3px solid #e7e5e4", borderTop: "3px solid #b45309", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" },
};
