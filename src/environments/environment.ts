/**
 * Build-time configuration.
 *
 * `candidateSheetUrl` is pre-filled into the setup panel, so the compere only
 * has to press Load. Paste any form of Google Sheets link here - a normal
 * /edit link, a "Publish to web" link, or a direct CSV export link.
 *
 * The sheet must be readable without signing in: Share > General access >
 * "Anyone with the link" (Viewer), or File > Share > Publish to web.
 */
export const environment = {
  production: true,
  candidateSheetUrl:
    'https://docs.google.com/spreadsheets/d/1NXc81ILcoWwz_agK86rCTqPfb9cs4twv7GamZ9aFmDI/edit?usp=sharing',

  /**
   * Tab holding the entries.
   *
   * The plain CSV export returns whichever tab is FIRST in the workbook, so in
   * a sheet with both Candidates and Winners, reordering the tabs would feed
   * the winner rows in as entries. When the Apps Script below is deployed the
   * app reads this tab by name instead, which cannot be reordered wrong.
   */
  candidatesTab: 'Candidates',

  /** Seconds the draw runs for. The UI timeline follows this value. */
  drawDurationSeconds: 30,

  /**
   * Prize levels.
   *
   * Array order is BOTH the order the tiles appear on the draw screen and the
   * order the night runs in - the two are deliberately kept the same, because
   * tiles light up in sequence and a mismatch would make the highlight jump
   * around. Here: 3rd, 2nd, 1st, then the consolation round.
   *
   * `grand: true` marks the headline prize, which gets the gold treatment.
   * Without it the gold would fall on whichever level happens to sit last.
   *
   * `detail` (optional) is what the prize actually is, shown under the level on
   * the stage and on the winner card. `slots` (optional, default 1) is the
   * starting number of winners the level awards; it can be changed live from
   * the stepper on the stage. Leave the array empty to draw without levels.
   */
  prizes: [
    { label: '3rd Prize', detail: '', slots: 1 },
    { label: '2nd Prize', detail: '', slots: 1 },
    { label: '1st Prize', detail: '', slots: 1, grand: true },
    { label: 'Consolation', detail: '', slots: 10 },
  ],

  /**
   * The Apps Script web app in apps-script/winners-sync.gs. It does two jobs:
   * reads the entries tab by name, and writes the winners back.
   *
   * A browser cannot write to a Google Sheet on its own - anonymous access to
   * a link-shared sheet is read-only and the Sheets API rejects unauthenticated
   * writes with a 401 - so this script is the authenticated endpoint. It runs
   * inside your own Google account: no backend of your own, no library.
   *
   * Leave webAppUrl empty and both jobs fall back: entries come from the CSV
   * export, and winners stay in localStorage plus the CSV download.
   */
  winnersSync: {
    /** The deployed /exec URL of the Apps Script web app. */
    webAppUrl:
      'https://script.google.com/macros/s/AKfycbyz7vz5Gm-1KyBtTmoypMlaXqH3jS9t7HL7wlCrMnkZfxjs1i4y5ycl3ek4Pj5tXor5/exec',
    /**
     * Must match SHARED_TOKEN in the script.
     *
     * NOTE: this is currently the deployment id copied out of the URL above,
     * which means it is not a secret at all - anyone who has the URL already
     * has the token. Set SHARED_TOKEN in the script to an unrelated value and
     * mirror it here.
     */
    token: 'AKfycbyz7vz5Gm-1KyBtTmoypMlaXqH3jS9t7HL7wlCrMnkZfxjs1i4y5ycl3ek4Pj5tXor5',
    /** Tab the winners are written to. The entries tab is never touched. */
    tabName: 'Winners',
  },
};
