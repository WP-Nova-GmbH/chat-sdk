---
id: planning
title: Integration planen
---

Eine zuverlässige Integration beginnt mit Produkt-, Sicherheits- und Navigationsentscheidungen. Halte sie fest, bevor du mit der Implementierung beginnst.

## Arbeitsblatt zur Integration

| Entscheidung | Zu beantwortende Fragen | Ort der Implementierung |
| --- | --- | --- |
| Benutzer und Umfang | Für welche Benutzer, Rollen, Mandanten, Module, Routen und Umgebungen ist der Chat verfügbar? | Surface-Mitgliedschaft, SDK-Zustand `enabled` sowie bedingte Registrierung von Tools und Routen. |
| Benutzerbereitstellung | Sollen unbekannte Benutzer blockiert bleiben oder eine bestätigte JIT-Mitgliedschaft erhalten? | Provisioning-Modus der Surface und vertrauenswürdiger Token-Endpoint. |
| Host-Authentifizierung | Verwendet die Anwendung eine Same-Origin-Cookie-Session oder ein Bearer-Token im Browser? Woher erhält das Backend die vertrauenswürdige E-Mail-Adresse? | Token-Endpunkt im Kunden-Backend; Anwendungen mit Bearer-Token benötigen gegebenenfalls ein Cookie-Bootstrap. |
| Origins | Von welchen exakten Produktions-, Staging- und lokalen Origins wird das SDK geladen? | `allowedOrigins` der Surface und Origin-Validierung im Backend. |
| Seiteninhalt lesen | Soll der Agent die aktuelle Seite sehen? Welche Werte sind unbedenklich und welche Bereiche müssen ausgeschlossen werden? | Page Reading der Surface, `data-wp-nova-include`, `safeValueSelectors` und `data-wp-nova-ignore`. |
| Integrierte Seitensteuerung | Soll der Agent navigieren, Datensätze öffnen, Bedienelemente anklicken, Filter setzen oder scrollen? | Page Navigation der Surface, Routenmanifest, semantische DOM-Bedienelemente und SPA-Navigationsadapter. Page Navigation setzt Page Reading voraus. |
| Benutzerdefinierte Tools | Welche APIs oder Abläufe der Anwendung sollten eigene schreibgeschützte oder verändernde Tools erhalten? | Page-Tools-Freigabe der Surface sowie SDK-Definitionen und Handler für `registerTool`. |
| Backend-Tools und Workflows | Welche serverseitigen Lesetools und welche exakten Seiten sollen Forschung und automatische Zusammenfassungen unterstützen? | `availableBackendTools`, `pageWorkflows`, `setPageReady` und Quellenverträge. |
| Geführte Auswahl | In welchen Abläufen muss der Agent aus Kunden, Lieferanten, Kategorien oder anderen aktuellen Optionen auswählen? | Schreibgeschützte Lookup-Tools, die eine begrenzte Auswahl zurückgeben; Nova rendert `request_user_input` im iframe. |
| Site-Routen | Soll der Agent Routen kennen, die auf der aktuellen Seite nicht sichtbar sind? Welche Rollen dürfen die einzelnen Routen erreichen und woher stammen Parameter-IDs? | `SdkConfig.routes`, gefiltert für den angemeldeten Benutzer. |
| SPA-Bereitschaft | Muss die Navigation auf Loader, Queries, Lazy Chunks oder Übergänge warten? Woran ist erkennbar, dass das Ziel bereit ist? | `wp-nova:navigate`, `settle.waitForNavigationSignal` und `wp-nova:settled`. |
| Erscheinungsbild | Welche Werte sollen Titel, Primär-/Akzentfarbe, Launcher- und Icon-Farben sowie Logo haben? Woher stammt der Hell-/Dunkelmodus des Hosts, und braucht der Launcher modusspezifische Farben? | Anzeigeeinstellungen der Surface sowie browsersichere Werte für `theme`, Farben beim ersten Render und Live-Synchronisierung des Host-Themes. |
| Spracheingabe | Soll das Embed Spracheingabe anbieten und erlaubt die Permissions Policy des Hosts dem iframe den Mikrofonzugriff? | `voiceMode` und `Permissions-Policy`. |
| Locale | Welcher BCP-47-Sprachhinweis soll den Workflow-Kontext erreichen? | `locale` und der Host-Sprachzustand; die Surface steuert weiterhin die iframe-Lokalisierung. |
| Mount-Lebenszyklus | Wo befindet sich die persistente App-Shell? Wann soll der Chat deaktiviert oder zerstört werden? | Root-Provider/-Komponente; bei gewöhnlichen SPA-Routenwechseln nicht neu mounten. |
| Verifizierung | Welche zugeordneten und nicht zugeordneten Benutzer, Rollen, Routen, Tools und sensiblen Seiten decken das tatsächliche Risiko ab? | Automatisierte Tests und Browser-Smoke-Testmatrix. |

## Funktionen unabhängig voneinander auswählen

| Funktion | Bereitgestellte Möglichkeiten | Erforderliche Surface-Einstellung |
| --- | --- | --- |
| Visible Page Snapshot | Sichtbarer Text, Links, Bedienelemente, unbedenkliche Werte und Kontext der aktuellen Route. | Page Reading |
| Integrierte Seitensteuerung | Same-Origin-Navigation, Öffnen/Anklicken sichtbarer Bedienelemente, Filter, Scrollen und Aktualisieren des Kontexts. | Page Reading + Page Navigation |
| SDK-definierte Seitentools | Zweckgebundene API-Aufrufe der Host-Anwendung wie `list_customers` oder `create_ticket`. | Page Tools |

SDK-Tools werden in der Host-Integration deklariert; Page Tools ist der Notausschalter auf Surface-Ebene. Aktiviere nur die Funktionen, die das Produkt benötigt.

## Authentifizierungsmuster auswählen

Das SDK ruft `tokenEndpoint` mit `credentials: "include"` auf; es übernimmt weder ein Bearer-Token des Hosts noch erhält es das Nova-Integrations-Secret.

### Host-Anwendung mit Cookie-Authentifizierung

Authentifiziere `tokenEndpoint` mit der vorhandenen Same-Origin-Session, lies die vertrauenswürdige E-Mail-Adresse und leite Nova `POST /embed/session` weiter. Siehe [Schnellstart](./quickstart.md).

### SPA mit Bearer-Authentifizierung

Erstelle für Anwendungen mit Bearer-Authentifizierung eine kurzlebige Server-Session als Brücke:

1. Die Anwendung ruft mit ihrem vorhandenen Bearer-Token einen geschützten Bootstrap-Endpunkt auf.
2. Das Backend liest den vertrauenswürdigen Benutzer, speichert nur die für Nova unbedingt benötigte Identität und setzt ein undurchsichtiges `HttpOnly`-Cookie.
3. Das SDK ruft den Same-Origin-`tokenEndpoint` auf; das Backend löst das undurchsichtige Cookie auf und ruft Nova mit dem ausschließlich serverseitigen Integrations-Secret auf.
4. Beim Abmelden wird die Brücken-Session widerrufen und das Cookie gelöscht.

Verwende eine zufällige Session-ID, bei mehreren Replikaten einen gemeinsamen Speicher, eine begrenzte Lebensdauer, `Cache-Control: no-store` und ein `HttpOnly`-Cookie mit engem Pfad, passendem `SameSite` und `Secure` bei HTTPS. Validiere bei beiden Mustern die konfigurierte Surface-ID sowie Origins in Body und Header. Vertraue niemals einer Browseridentität und leite keine beliebigen Surfaces oder Origins weiter.

## Festlegen, was in Routen, ins DOM oder in ein Tool gehört

- Deklariere eine **Route**, wenn der Agent wissen soll, dass eine Seite existiert, und sie direkt erreichen können soll.
- Stelle einen semantischen **Link oder Button** bereit, wenn der Benutzer die Aktion bereits in der sichtbaren Oberfläche ausführen kann.
- Füge ein schreibgeschütztes **Tool** für verlässliche Suche, Lookups, Validierung, Paginierung oder hinter Virtualisierung verborgene Daten hinzu.
- Füge ein veränderndes **Tool** für einen validierten Domänenablauf hinzu, der über die normalen Services und Berechtigungsprüfungen der Anwendung ausgeführt werden soll.

Click-Handler, die nur auf einem Container liegen, erscheinen möglicherweise nicht in Snapshots; stelle echte beschriftete Links oder Buttons bereit.

Kombiniere bei einer Mutation mit aktuellen Auswahlmöglichkeiten mehrere Tools:

1. Ein schreibgeschützter Lookup gibt aktuelle stabile IDs, Bezeichnungen, abhängige Werte und den Kürzungsstatus zurück.
2. Wenn mehrere durch aktuelle Daten belegte Kandidaten verbleiben, verwendet Nova `request_user_input`.
3. Die Mutation akzeptiert stabile Werte, validiert sie erneut, verwendet die Bestätigung im iframe und gibt eine stabile URL zurück.

Konkrete Verträge findest du unter [Tools und geführte Abläufe](./tools.md).

## Abschließende Designprüfungen

- Erstelle Routen aus Router-Konstanten, filtere sie anhand der UI-Berechtigungen und behandle sie als Kontext statt als Autorisierung. Siehe [Navigation](./navigation.md).
- Prüfe ganze Familien sensibler Seiten und nicht nur einen einzelnen Bildschirm; schließe ganze private Teilbäume aus. Gib nur erforderliche unbedenkliche Werte frei.
- Lege für den ersten Render Primär-/Akzentfarbe, Icon-Kontrast, Host-`theme`
  und gegebenenfalls modusspezifische Launcher-Farben fest. Halte `theme` mit
  der Host-Anwendung synchron; nach der Authentifizierung bleiben die
  Surface-Einstellungen maßgeblich. Siehe
  [Design-Anpassung](./theming.md).

## Definition of Done

Eine Integration ist bereit, wenn:

- zugeordnete, nicht zugeordnete und bestätigte JIT-Benutzer, exakte Origins und ausschließlich serverseitige Secrets korrekt behandelt werden;
- der Chat über Routenwechsel hinweg bestehen bleibt, beim Abmelden widerrufen wird und zum Host-Produkt passt;
- Routen und Tools den Berechtigungen folgen, während die Autorisierung im Backend weiterhin erzwungen wird;
- asynchrone Navigation geladene Inhalte statt eines veralteten Snapshots zurückgibt;
- automatische Workflows erst nach Readiness starten und Evidenz sicher zitieren;
- Lookups Auswahlmöglichkeiten auf aktuelle Daten stützen, Mutationen einmal bestätigt und Fehler strukturiert zurückgegeben werden;
- Datenschutztests, Typprüfungen, automatisierte Tests, Build und Browser-Smoke-Tests erfolgreich sind.
