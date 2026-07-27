/* Savola Foods Company brand system (from PPT_Template_SFC_ALL_OU):
   lime #A9C23F · slate #44546A · orange #EF9600 · tan #EFD19F · gray #5B6770
   Typeface: Avenir Next LT Pro (Demi) → web fallbacks Montserrat / Cairo (AR). */
:root {
  --bg: #f6f7f3;
  --surface: #ffffff;
  --ink: #333f4e;
  --ink-2: #5b6770;          /* SFC gray */
  --line: #e3e6e0;
  --brand: #a9c23f;          /* SFC lime */
  --brand-2: #8ca32e;        /* darker lime (hover) */
  --brand-soft: #f0f5df;
  --slate: #44546a;          /* SFC slate — headlines, table headers */
  --slate-2: #37455a;
  --accent: #ef9600;         /* SFC orange */
  --tan: #efd19f;            /* key-takeout band */
  --red: #c0392b;
  --red-soft: #fdecea;
  --green: #1e8e3e;
  --green-soft: #e6f4ea;
  --amber-soft: #fbeed3;
  --radius: 12px;
  font-family: 'Avenir Next LT Pro', 'Avenir Next', Avenir, 'Montserrat', 'Cairo', 'Segoe UI', 'Noto Sans Arabic', sans-serif;
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font-size: 14px; }
#root { min-height: 100vh; }

.app { display: flex; flex-direction: column; min-height: 100vh; }

/* White header with slate wordmark and lime brand rule — SFC content-page style */
.topbar {
  background: var(--surface); color: var(--slate);
  padding: 12px 24px; display: flex; align-items: center; gap: 16px;
  border-bottom: 4px solid var(--brand);
}
.topbar h1 { font-size: 18px; margin: 0; font-weight: 800; letter-spacing: .2px; color: var(--slate); }
.topbar h1::before { content: ''; display: inline-block; width: 26px; height: 14px; margin-inline-end: 9px; background: var(--brand); border-radius: 8px 8px 8px 2px; }
.topbar .sub { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
.topbar .spacer { flex: 1; }
.badge-period {
  background: var(--brand-soft); border: 1px solid var(--brand);
  color: var(--slate); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
}
.lang-btn {
  background: var(--slate); color: #fff; border: none; border-radius: 20px;
  padding: 6px 16px; font-weight: 700; cursor: pointer; font-size: 13px; font-family: inherit;
}
.lang-btn:hover { background: var(--slate-2); }
.role-chip {
  background: var(--brand-soft); border: 1px solid var(--line);
  padding: 4px 12px; border-radius: 20px; font-size: 12px; color: var(--slate);
  display: inline-flex; gap: 6px; align-items: center;
}
.role-chip button {
  background: none; border: none; color: var(--brand-2); cursor: pointer; font-size: 11.5px;
  text-decoration: underline; padding: 0; font-weight: 700; font-family: inherit;
}

.nav { background: var(--surface); border-bottom: 1px solid var(--line); padding: 0 24px; display: flex; gap: 4px; flex-wrap: wrap; }
.nav button {
  background: none; border: none; border-bottom: 3px solid transparent;
  padding: 12px 16px; font-size: 13.5px; color: var(--ink-2); cursor: pointer; font-weight: 700; font-family: inherit;
}
.nav button.active { color: var(--slate); border-bottom-color: var(--brand); }
.nav button:hover { color: var(--slate); }

.page { padding: 20px 24px 48px; max-width: 1400px; width: 100%; margin: 0 auto; }
.page h2 { font-size: 17px; margin: 4px 0 16px; color: var(--slate); }
.page h3 { font-size: 13px; margin: 20px 0 8px; color: var(--slate); text-transform: uppercase; letter-spacing: .6px; }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 20px; }
.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 16px 18px; border-top: 4px solid var(--brand);
}
.card .kpi { font-size: 26px; font-weight: 800; color: var(--slate); }
.card .kpi.warn { color: var(--accent); }
.card .kpi.bad { color: var(--red); }
.card .label { color: var(--ink-2); font-size: 12px; margin-top: 2px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 900px) { .grid-2 { grid-template-columns: 1fr; } }

.panel { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; }
.panel h4 { margin: 0 0 10px; font-size: 12.5px; color: var(--slate); text-transform: uppercase; letter-spacing: .6px; }

/* Slate header bars — like the template's chart chips */
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th {
  text-align: start; padding: 8px 10px; background: var(--slate); color: #fff;
  font-size: 11px; text-transform: uppercase; letter-spacing: .4px; white-space: nowrap;
  position: sticky; top: 0; font-weight: 700;
}
td { padding: 7px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
tr:hover td { background: #f7f9f2; }
.table-wrap { overflow: auto; max-height: 62vh; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }

.pill { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11.5px; font-weight: 700; }
.pill.ok { background: var(--brand-soft); color: var(--brand-2); }
.pill.bad { background: var(--red-soft); color: var(--red); }
.pill.warn { background: var(--amber-soft); color: var(--accent); }
.pill.info { background: #e8ecf2; color: var(--slate); }
.pill.muted { background: #eef1f5; color: var(--ink-2); }

.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.toolbar select, .toolbar input[type="text"], .toolbar input[type="number"], .toolbar input[type="date"] {
  padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; background: #fff; font-size: 13px;
  color: var(--ink); font-family: inherit;
}
.toolbar label.chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); }

button.primary {
  background: var(--brand); color: #fff; border: none; border-radius: 8px;
  padding: 8px 16px; font-weight: 800; cursor: pointer; font-size: 13px; font-family: inherit;
}
button.primary:hover { background: var(--brand-2); }
button.ghost {
  background: #fff; color: var(--slate); border: 1px solid var(--line); border-radius: 8px;
  padding: 7px 14px; cursor: pointer; font-size: 13px; font-weight: 700; font-family: inherit;
}
button.link { background: none; border: none; color: var(--brand-2); cursor: pointer; font-size: 12.5px; padding: 2px 6px; font-weight: 700; font-family: inherit; }

.modal-back {
  position: fixed; inset: 0; background: rgba(68,84,106,.5); display: flex;
  align-items: center; justify-content: center; z-index: 40;
}
.modal {
  background: #fff; border-radius: 14px; padding: 20px 22px; width: 440px; max-width: 92vw;
  box-shadow: 0 18px 50px rgba(24,23,23,.3); border-top: 5px solid var(--brand);
}
.modal h4 { margin: 0 0 14px; color: var(--slate); }
.modal .row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
.modal .row label { width: 120px; color: var(--ink-2); font-size: 13px; }
.modal input, .modal textarea {
  flex: 1; padding: 7px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 13px; font-family: inherit;
}
.modal .actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }

.ranklist { list-style: none; margin: 0; padding: 0; }
.ranklist li { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
.ranklist li:last-child { border-bottom: none; }
.ranklist .bar { height: 9px; background: var(--brand); border-radius: 5px; }
.ranklist li:nth-child(even) .bar { background: var(--accent); opacity: .85; }
.ranklist .who { flex: 1; font-size: 13px; }
.ranklist .val { font-weight: 800; font-size: 13px; color: var(--slate); min-width: 52px; text-align: end; }

.gate-result { border-radius: var(--radius); padding: 22px; text-align: center; font-size: 19px; font-weight: 800; margin-top: 12px; }
.gate-result.green { background: var(--green-soft); color: var(--green); border: 2px solid var(--green); }
.gate-result.red { background: var(--red-soft); color: var(--red); border: 2px solid var(--red); }
.gate-reasons { margin-top: 8px; font-size: 13px; font-weight: 600; }

/* Notes styled like the template's tan "key takeout" band */
.note { color: var(--ink-2); font-size: 12px; margin-top: 8px; }
.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.tabs button {
  border: 1px solid var(--line); background: #fff; border-radius: 20px; padding: 7px 14px;
  cursor: pointer; font-size: 12.5px; font-weight: 700; color: var(--ink-2); font-family: inherit;
}
.tabs button.active { background: var(--slate); color: #fff; border-color: var(--slate); }

.mod-fab {
  position: fixed; bottom: 22px; inset-inline-end: 22px; z-index: 30;
  background: var(--accent); color: #fff; border: none; border-radius: 24px;
  padding: 11px 18px; font-weight: 800; font-size: 13px; cursor: pointer;
  box-shadow: 0 8px 24px rgba(239,150,0,.4); font-family: inherit;
}
.mod-fab:hover { filter: brightness(1.07); }

.manual-badge {
  display: inline-block; margin-inline-start: 5px; padding: 1px 6px; border-radius: 9px;
  background: var(--tan); color: #8a5a00; font-size: 10.5px; font-weight: 800;
  vertical-align: 1px; cursor: default;
}

[dir="rtl"] th, [dir="rtl"] td { text-align: right; }

/* ---------- landing page — SFC section-divider style ---------- */
.landing {
  min-height: 100vh; display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 28px; padding: 32px 16px; position: relative;
  background: #fff;
}
.landing::before {
  content: ''; position: absolute; inset-inline-start: 0; top: 0; bottom: 0; width: 42%;
  background: linear-gradient(135deg, #b3cd53, var(--brand) 60%, #93ab30);
  border-start-end-radius: 120px;
}
.landing::after {
  content: ''; position: absolute; bottom: 0; inset-inline-start: 6%; inset-inline-end: 6%;
  height: 16px; background: var(--brand); border-radius: 16px 16px 0 0;
}
.landing-lang { position: absolute; top: 18px; inset-inline-end: 20px; z-index: 2; }
.landing-hero { text-align: center; z-index: 1; }
.landing-logo {
  width: 68px; height: 68px; margin: 0 auto 14px; border-radius: 18px;
  background: #fff; box-shadow: 0 10px 30px rgba(24,23,23,.18);
  display: flex; align-items: center; justify-content: center;
}
.landing-logo svg { width: 44px; height: 44px; }
.landing-hero h1 { margin: 0 0 6px; font-size: 26px; color: var(--slate); font-weight: 800; }
.landing-hero p { margin: 0; color: var(--ink-2); font-size: 13.5px; }
.landing-box {
  background: var(--surface); border-radius: 18px; padding: 26px 28px;
  width: 620px; max-width: 94vw; box-shadow: 0 24px 70px rgba(24,23,23,.22);
  z-index: 1; border-top: 6px solid var(--brand);
}
.landing-box h2 { margin: 0 0 18px; font-size: 16px; text-align: center; color: var(--slate); }
.role-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 620px) { .role-cards { grid-template-columns: 1fr; } }
.role-card {
  display: flex; flex-direction: column; gap: 8px; text-align: start; cursor: pointer;
  background: #fff; border: 2px solid var(--line); border-radius: 12px; padding: 18px;
  font-family: inherit; transition: border-color .15s, box-shadow .15s;
}
.role-card:hover { border-color: var(--brand); }
.role-card.picked { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-soft); background: #fcfdf8; }
.role-icon { font-size: 26px; }
.role-name { font-weight: 800; font-size: 15px; color: var(--slate); }
.role-desc { font-size: 12.5px; color: var(--ink-2); line-height: 1.5; }
.mgr-pick { margin-top: 16px; display: flex; gap: 10px; align-items: center; }
.mgr-pick label { font-size: 13px; color: var(--ink-2); white-space: nowrap; }
.mgr-pick select {
  flex: 1; padding: 9px 10px; border: 1px solid var(--line); border-radius: 8px;
  font-size: 13px; background: #fff; color: var(--ink); font-family: inherit;
}
.landing-enter { width: 100%; margin-top: 18px; padding: 12px; font-size: 14px; }
.landing-enter:disabled { opacity: .45; cursor: not-allowed; }
