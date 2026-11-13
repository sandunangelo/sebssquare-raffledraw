/** Development overrides. Swapped in by angular.json fileReplacements. */
export const environment = {
  production: false,
  candidateSheetUrl:
    'https://docs.google.com/spreadsheets/d/1NXc81ILcoWwz_agK86rCTqPfb9cs4twv7GamZ9aFmDI/edit?usp=sharing',

  /**
   * Tab holding the entries. Used when the Apps Script below is deployed,
   * which reads by name so tab order cannot matter. Without the script the app
   * falls back to the plain CSV export, which returns the FIRST tab.
   */
  candidatesTab: 'Candidates',

  /** Seconds the draw runs for. The UI timeline follows this value. */
  drawDurationSeconds: 10,

  /**
   * Prize levels. Array order is BOTH the on-screen tile order and the order
   * the night is drawn in: 3rd, 2nd, 1st, then the consolation round.
   * `grand: true` marks the headline prize for the gold treatment.
   */
  prizes: [
    { label: '3rd Prize', detail: '', slots: 1 },
    { label: '2nd Prize', detail: '', slots: 1 },
    { label: '1st Prize', detail: '', slots: 1, grand: true },
    { label: 'Consolation', detail: '', slots: 10 },
  ],

  /**
   * The Apps Script web app in apps-script/winners-sync.gs. It does two jobs:
   * reads the entries tab by name, and writes the winners back. Leave
   * webAppUrl empty and both fall back - entries come from the CSV export and
   * winners stay in localStorage plus the CSV download.
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
