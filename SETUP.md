# 🍜 Thai Menü – Setup Anleitung

## Überblick
Diese App ermöglicht es Mitarbeitern von bis zu 3 Firmen, wöchentlich ein Thai-Mittagessen zu bestellen.

---

## Schritt 1: Supabase einrichten

1. Gehe auf **https://supabase.com** und erstelle einen kostenlosen Account
2. Neues Projekt erstellen (Name: `thai-menu`, Region: `eu-central-1`)
3. Passwort merken!
4. Warte bis das Projekt bereit ist (~2 Min)

### SQL ausführen
1. Im Supabase Dashboard: **SQL Editor** → **New query**
2. Den gesamten Inhalt von `supabase_setup.sql` einfügen
3. Auf **Run** klicken
4. Fertig ✅

### API Keys holen
1. Im Dashboard: **Settings** → **API**
2. Kopiere:
   - `Project URL` → das ist dein `VITE_SUPABASE_URL`
   - `anon / public` Key → das ist dein `VITE_SUPABASE_ANON_KEY`

---

## Schritt 2: App lokal starten

```bash
# In den Projektordner wechseln
cd thai-menu-app

# Dependencies installieren
npm install

# .env.local Datei erstellen
cp .env.example .env.local
# Öffne .env.local und trage deine Supabase-Werte ein

# App starten
npm run dev
```

Die App läuft jetzt auf http://localhost:5173

---

## Schritt 3: Admin-Konto einrichten

1. App öffnen → **Registrieren**
2. Dich selbst registrieren (mit deiner E-Mail)
3. Im Supabase Dashboard: **Table Editor** → **profiles**
4. Deinen User finden → `is_approved` und `is_admin` auf `true` setzen
5. App neu laden → du hast jetzt Admin-Zugang

---

## Schritt 4: Firmen & Benutzer

### Firmen hinzufügen
Im Supabase Table Editor → **companies**:
```
name: "Muster AG"
contact_person: "Max Muster"
twint_phone: "+41791234567"  ← Deine Twint-Nummer für Zahlungen
```

### Benutzer freischalten
1. Admin-Panel → **Benutzer**
2. Mitarbeiter registrieren sich selbst
3. Du klickst auf "Freigeben" → sie können bestellen

---

## Schritt 5: Auf Vercel deployen (kostenlos)

```bash
# Vercel CLI installieren
npm install -g vercel

# Projekt deployen
vercel

# Bei den Fragen:
# Framework: Vite
# Build command: npm run build
# Output dir: dist
```

### Umgebungsvariablen bei Vercel
Im Vercel Dashboard → dein Projekt → **Settings** → **Environment Variables**:
- `VITE_SUPABASE_URL` = deine Supabase URL
- `VITE_SUPABASE_ANON_KEY` = dein Anon Key

---

## Wöchentlicher Ablauf

| Tag | Aktion |
|-----|--------|
| Mo (bis 12:00) | Bestellfrist – Mitarbeiter können bestellen |
| Mo Nachmittag | Admin → PDF exportieren → ausdrucken |
| Mi | Lieferung |
| Mi/Do | Lunchboxen als "zurück" markieren |

---

## Zufällige Menü-Auswahl

1. Admin-Panel → **Wochenmenüs**
2. KW und Jahr wählen
3. Auf **🎲 Zufällig auswählen** klicken
4. Das System wählt 2 zufällige Gerichte aus dem Menü-Pool
5. Du kannst auch manuell ändern
6. **Speichern** → Menü ist sofort für alle sichtbar

---

## Twint-Zahlung

Nach der Bestellung erscheint ein blauer **"Mit Twint bezahlen"** Button.
Dieser öffnet die Twint-App mit deiner Nummer und dem Betrag vorausgefüllt.

Die Twint-Nummer wird pro Firma in der `companies`-Tabelle gespeichert:
```
twint_phone: "+41791234567"
```

---

## PDF-Export

1. Admin-Panel → **Bestellungen**
2. KW und Firma filtern (optional)
3. **📄 PDF exportieren** klicken
4. PDF wird heruntergeladen mit:
   - Alle Bestellungen nach Firma gruppiert
   - Name, Menü, Vegetarisch, Lunchbox, Bezahlstatus
   - Total pro Firma + Gesamttotal

---

## Lunchbox-Tracking

1. In der Bestellliste siehst du wer eine Lunchbox hat
2. Wenn die Box zurückgebracht wird: **📦 Zurück** klicken
3. Status wechselt auf ✅

---

## Häufige Fragen

**Q: Kann ich die Bestellfrist ändern?**
A: Ja, in `App.jsx` Zeile ~50, Funktion `isOrderingOpen()`. Aktuell: Mo bis 12:00 Uhr.

**Q: Kann ich den Preis ändern?**
A: Ja, beim Erfassen des Wochenmenüs kannst du den Preis pro Menü anpassen.

**Q: Was wenn jemand seine Bestellung ändern möchte?**
A: Der Admin kann im Supabase Table Editor direkt die `orders`-Tabelle bearbeiten.

**Q: Kann ich mehr als 3 Firmen hinzufügen?**
A: Ja, einfach weitere Einträge in der `companies`-Tabelle erstellen.
