# Raffle Drawer

A live raffle stage for **SEBS Square 2005**, built on Angular 22. Reads the
candidate list straight from a public Google Sheet in the browser, then draws
one winner at a time over a 30-second build-up with a reel, countdown, marquee
lights, confetti and synthesised sound.

No backend. No third-party runtime libraries other than Bootstrap 5.3.

---

## Run it

```bash
npm install
npm start            # http://localhost:4200
npm run build        # production bundle in dist/raffle-drawer
```

Requires Node 20.19+, 22.12+ or 24+ (built on Node 24).

## Signing in

The app opens on a sign-in screen. The accounts live in the environment files,
alongside everything else that is configured per build:

```ts
auth: {
  sessionHours: 12,
  credentials: [
    { username: 'compere', password: 'SebsSquare@2005', displayName: 'Compere' },
    { username: 'admin', password: 'RaffleAdmin@2005', displayName: 'Admin' },
  ],
},
```

Add one entry per person running the night. Usernames are matched without
regard to case, passwords exactly as typed, and `displayName` is optional - it
only shows on the tooltip of the sign-out button in the header.

A sign-in is remembered in `localStorage` for `sessionHours`, so a refresh
mid-event does not ask again, and the entry list and winners are untouched by
signing out. Deleting a credential from the environment file immediately ends
any session it had already handed out. Leave `credentials` empty and the gate
is off entirely - a deliberate choice, so that a half-finished config cannot
lock everybody out of the draw.

> **What this does and does not protect.** This is a static site with no
> backend, so the credentials above are compiled into the JavaScript bundle and
> anybody who opens the browser's sources can read them. The gate stops the
> draw being walked into by whoever has the link; it is not a security
> boundary, and the entry list behind it is a link-shared Google Sheet in any
> case. Do not reuse a password here that is used anywhere that matters, and
> change the ones shipped above before the event.

## The candidate sheet

The sheet URL lives in the environment files, not in the components:

- `src/environments/environment.ts` — production
- `src/environments/environment.development.ts` — development (swapped in by
  `fileReplacements` in `angular.json`)

```ts
export const environment = {
  production: true,
  candidateSheetUrl: 'https://docs.google.com/spreadsheets/d/<id>/edit?usp=sharing',
  drawDurationSeconds: 30,
  prizes: [ /* see below */ ],
};
```

`candidateSheetUrl` pre-fills the setup panel, so the compere only has to press
**Load entries**. `drawDurationSeconds` drives both the clock and every CSS
timeline — change it in one place and the whole show follows.

### Two tabs

The workbook holds **Candidates** (the entries you maintain) and **Winners**
(written by the app). They are configured separately:

```ts
candidatesTab: 'Candidates',          // read from
winnersSync: { tabName: 'Winners' },  // written to
```

Which tab the app *reads* depends on whether the Apps Script is deployed:

| Route | Picks the tab by | Safe to reorder tabs? |
| --- | --- | --- |
| Apps Script `?tab=Candidates` | **name** | yes |
| CSV export (fallback) | position — always the **first** tab | no |

This matters more than it looks. If Winners were dragged to the front, the CSV
export would hand back the winners rows, and because that tab has a `Name`
column the app would lock onto it and load **the previous winners as the entry
pool** — a plausible-looking list that is silently wrong, not an obvious error.
Reading by name removes the failure mode. The app tries the script first and
falls back to CSV automatically, so it still works with no script at all.

### Candidates tab schema

| FirstName | LastName   | City      |
| --------- | ---------- | --------- |
| sandun    | perera     | panadura  |
| angelo    | silva      | lunawa    |

`FirstName` and `LastName` are joined for the stage and **re-cased**, so
`angelo` / `SILVA` both read `Angelo Silva` however they were typed. `City` is
the optional second line under the name; it is tidied the same way, but only
when the value has no capital at all — deliberate forms like `IT`, `HR` and
`People & Culture` are left exactly as written.

Detection is automatic and handles `FirstName` / `First Name` / `Given Name`,
a single `Name` or `Full Name` column, `Department` / `Team` / `City` and
friends for the detail, and a sheet with no header row at all. All three
columns can be overridden from the dropdowns after loading.

`sample-data/candidates.csv` holds a ready-made 30-row list in this schema. To
load it into the sheet: **File › Import › Upload**, pick the file, and choose
*Replace current sheet*.

A person listed twice gets two chances to win but can still only win once.

### Sharing it so the browser can read it

Either:

- **Share › General access › Anyone with the link** (role *Viewer*), or
- **File › Share › Publish to web** › *Comma-separated values (.csv)*, and paste
  the published link instead.

The app accepts an `/edit` link, a published `/d/e/.../pub` link, a direct CSV
export link, or a bare sheet id.

> Worth knowing: of Google's two CSV endpoints, only
> `/export?format=csv` returns `Access-Control-Allow-Origin: *`. The
> `/gviz/tq?tqx=out:csv` endpoint replies `200 text/csv` with no CORS header, so
> a browser cannot read it cross-origin. The loader therefore tries `export`
> first and keeps `gviz` as a fallback.

If the sheet cannot be reached at all, the panel offers two escape hatches so a
live event never stalls: paste the names directly, or load the demo roster.

## Prize levels

Array order is **both** the order the tiles appear on the draw screen and the
order the night runs in. The two are deliberately kept the same: tiles light up
in sequence as each level fills, so a display order that differed from the draw
order would make the highlight jump around.

```ts
prizes: [
  { label: '3rd Prize',   detail: 'Bluetooth speaker', slots: 1 },
  { label: '2nd Prize',   detail: '',                  slots: 1 },
  { label: '1st Prize',   detail: '',                  slots: 1, grand: true },
  { label: 'Consolation', detail: '',                  slots: 10 },
]
```

That is 13 rounds: 3rd, 2nd and 1st, then ten consolation winners. A level with
more than one slot is numbered everywhere it appears - "Consolation 7 of 10" on
the winner card, "Consolation 7" on the roll of honour - and its chip carries a
progress bar. If the entry list is smaller than the total number of slots, the
setup panel says so before the first draw.

- `detail` (optional) is what the prize actually is, shown under the level on
  the stage and on the winner card.
- `slots` (optional, default 1) is how many winners the level awards. This is
  only the starting value: each level carries a **− / + stepper on the stage**,
  so the number of consolation winners can be changed live.

Changing a slot count never disturbs anything already drawn. Raising one
reopens a finished level - ten consolation winners can become fifteen and the
draw simply carries on. Lowering is floored at the number already awarded, so a
recorded winner can never be left without a prize; the minus button greys out
and says how many have gone. Slot changes persist with the winners, so a
refresh mid-event keeps them.

`grand: true` marks the headline prize, which wears the gold on the stage.
Without it the gold would simply fall on whichever level sits last — which
would be the consolation round in the order above.

The compere picks the level on the stage before pressing **DRAW**, or steps
through them with `←` / `→`. A level that has given out all its slots is ticked,
drops out of the running, and hands over to the next one automatically — so the
night runs itself left to right across the tiles without anyone having to
remember what comes next. Set the array to `[]` to draw with no prize levels at
all.

## Writing winners back to the sheet

**A browser cannot write to a Google Sheet.** Anonymous access to a link-shared
sheet is read-only, and the Sheets API answers an unauthenticated write with
`401`. Writing needs an authenticated endpoint, so this is opt-in and off by
default. Winners are always kept in `localStorage` and exportable as CSV
regardless.

The lightest option that needs no server of yours and no library is a **Google
Apps Script bound to the sheet**. One-time setup:

1. Open the sheet → **Extensions › Apps Script**.
2. Paste `apps-script/winners-sync.gs` over `Code.gs`, change `SHARED_TOKEN`,
   Save.
3. **Deploy › New deployment › Web app**, *Execute as* **Me**, *Who has access*
   **Anyone**. Approve the prompt and copy the `/exec` URL.
4. Put that URL and the same token into `winnersSync` in both environment
   files.

> **After editing the script, deploy again** — *Deploy › Manage deployments ›
> edit › Version: New version*. Apps Script serves the last deployed version,
> not what is in the editor, so a saved-but-undeployed change has no effect.
> The app degrades quietly if the read endpoint is missing: it falls back to
> the CSV export rather than failing.

Open the `/exec` URL in a browser to check it: it answers
`{"ok":true,"service":"raffle-drawer-winners-sync"}`.

How it behaves:

- Winners go to a separate **Winners** tab, created on first use. The entry tab
  is never touched.
- Every call sends the **whole** winner list and the script replaces the tab, so
  the request is idempotent — a retry after a dropped connection cannot
  duplicate rows, and one success repairs every earlier failure.
- Sync never blocks a draw. On failure it retries on a 2s → 5s → 15s → 30s →
  60s backoff, and the winners panel shows the state with a **Retry now**
  button.
- Undo and reset push the corrected list too, so the tab always matches the app.

> `SHARED_TOKEN` is a speed bump, not real security: *Who has access: Anyone*
> means anyone holding the URL can call it, and the token ships inside the
> app's JavaScript. Keep the deployment URL private and rotate the token if it
> leaks.

## Running the draw

| Key     | Action                        |
| ------- | ----------------------------- |
| `Space` | Draw, or continue after a win |
| `Esc`   | Cancel a running draw         |
| `←` `→` | Change prize level            |
| `S`     | Stage mode (hide the chrome)  |
| `F`     | Full screen                   |
| `M`     | Mute                          |

Press the big **DRAW** button (or `Space`) and the 30 seconds play out in five
stages — *sealing the entries*, *shuffling the pool*, *narrowing it down*,
*final contenders*, *and the winner is* — with the reel decelerating on a
quartic curve, the bulbs and glow quickening, a riser through the last four
seconds, and the reel locking onto the winner 0.9 s before the reveal.

Cancelling a draw records nothing and returns nobody to the drum.

After a reveal, **Not present — redraw** puts that winner back in the drum,
frees their prize slot, and returns the stage to **the same prize level** so
the next draw replaces them. It does not move on to the next prize — press it
as many times as you need and the level stays put.

### When the night ends

The draw is over when every prize slot is filled, **or** when the drum runs out
of people - whichever comes first. The stage then shows the **results**: every
winner grouped by prize level, with the grand prize in gold, and a Download
button. Entries and Stage mode are unticked automatically so the results and
the roll of honour are both on screen.

There is deliberately **no reset button on that screen**. Inviting someone to
wipe the board while the results are up on a projector is the last thing
anyone needs. Starting a new event is still possible from the roll of honour,
behind a confirmation.

If the drum empties first the screen says how many slots went undrawn, and the
trigger screen warns before it happens - *"Only 1 entrant left for 3 remaining
slots, the draw will end 2 slots short."* Worth watching: with 6 entrants and
3 + 5 = 8 slots, the night stops after the 3rd consolation because there is
nobody left, not because anything is wrong with the slot counts.

### Auto-refresh and resuming

Once entries have been loaded from a sheet, the app re-reads it every **60
seconds**, so names added mid-event turn up on their own. Pasted lists and the
demo roster have no URL to poll, so they switch it off.

A refresh **merges**: it replaces the entry list but keeps every winner
already drawn. This distinction matters — `setCandidates` deliberately clears
the winners, which is right when a human loads a different list and would be a
disaster on a timer. Refreshes are also skipped while a draw is running, so
the pool never moves under a live reel; the next tick picks it up.

If the drum ran dry with slots still open, the results screen offers **Resume
the draw** as soon as new entrants appear, plus **Check the sheet now** if you
do not want to wait for the timer. The screen is latched: a background refresh
will not yank it back to the DRAW button while the results are on a projector.
Resume is the compere's call, and is refused when every prize is already
awarded.

### Guard rails

Anything that destroys results asks first, through a native `<dialog>` (no
Bootstrap JS, and no blocking `confirm()` popping browser chrome over a
projector). The prompt states the cost - "All 7 winners go back in the drum" -
and Cancel holds focus so a stray Enter cannot confirm. Escape and the backdrop
both count as Cancel, never as a yes.

Covered: **Clear winners** on the roll of honour, **Return everyone to the
drum** / **Start the prizes over** on the stage, and **Clear entries** in the
setup panel (which discards winners too, and says so).

Not covered, deliberately: **Undo round N** and **Not present - redraw** step
back one winner and are immediately repeatable, so a prompt would be noise.

While a prompt is open the keyboard shortcuts are suspended, so Space cannot
start a draw behind the dialog and Escape dismisses the prompt rather than
cancelling a draw.

### Fairness

- The winner is chosen the instant you press the button, using
  `crypto.getRandomValues` with rejection sampling so every remaining ticket has
  exactly the same chance. A plain `% n` would quietly favour the first few
  entries.
- The names flickering past are decoration; the result is already decided and
  the reel is steered to land on it. The pool is Fisher-Yates shuffled at the
  start of every draw and then walked in order, so each entrant's name goes past
  the audience exactly once per pass, nobody is shown twice before everyone has
  been shown once, and the reel never replays the order of the source sheet.
  Each pass reshuffles. The background ticker is shuffled per draw too.
- Winners leave the pool, keyed on name + detail, so nobody can win twice.
- Winners and entries are mirrored to `localStorage`, so an accidental refresh
  mid-event does not lose the rounds already drawn.

## Branding

The palette is sampled straight from `src/assets/images/sebs-square-logo.jpg` —
green `#52B149`, gold `#FFC712`, white, on near-black. Green carries the draw,
gold carries the win. The favicon (`public/favicon*.png` and `favicon.ico`) and
`apple-touch-icon.png` are generated from the logo's three chevron bars.

The logo shown in the header and on the DRAW button is **inlined** into
`styles.scss` as the `--rd-logo` data URI (256 px, ~12 kB). It is deliberately
not fetched: an inlined mark cannot be lost to a missing asset path, a 404 from
a dev server started before `angular.json` changed, a mixed-content block or a
self-signed certificate. `src/assets/images/` keeps the full-size original as
the source for regenerating icons.

## Layout

```
apps-script/           winners-sync.gs - the sheet write-back endpoint
sample-data/           candidates.csv in the sheet schema
src/
  assets/images/       the SEBS Square logo (web-safe filename: no spaces, lower case)
  environments/        sheet URL, draw duration, prize levels
  styles.scss          Bootstrap config + theming, design tokens, all @keyframes
  app/
    app.ts|html|scss   shell: header, layout, keyboard shortcuts, full screen
    core/
      models.ts        Candidate, Winner, ColumnMap, identityKey
      names.ts         display casing for names and detail values
      csv.ts           RFC 4180 reader/writer
      sheet-parse.ts   URL resolution, header/column detection (pure, no I/O)
      sheet-loader.ts  fetch with endpoint fallbacks
      prizes.ts        prize levels, slots, awards
      raffle-store.ts  signals, the 30-second clock, winner selection
      candidate-refresh.ts  60s sheet polling, merge-not-replace
      random.ts        CSPRNG uniform index
      winner-sync.ts   optional write-back to the sheet
      reel-feed.ts     per-draw shuffled walk through the pool
      sound.ts         Web Audio ticks, riser, fanfare
      demo-data.ts     offline roster
    components/
      setup-panel      load entries, map columns, fallbacks
      prize-selector   pick the level this draw is for
      draw-stage       trigger, reel, reveal
      countdown-ring   SVG clock
      confetti-canvas  canvas particle system
      winners-board    roll of honour, CSV export, undo
```

Zoneless and standalone throughout, state in signals. The countdown ring and
progress bar are single CSS animations over `--rd-draw-ms` rather than per-frame
redraws, so change detection only runs when the displayed second, the reel name
or the stage actually changes.

`prefers-reduced-motion` drops the spectacle but keeps the countdown readable.
