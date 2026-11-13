/**
 * Raffle Drawer - winner write-back.
 *
 * A browser cannot write to a Google Sheet: anonymous access to a link-shared
 * sheet is read-only, and the Sheets API rejects unauthenticated writes with a
 * 401. This script is the authenticated endpoint that closes that gap. It runs
 * inside your own Google account, so the app stays a static page with no
 * backend of your own and no third-party library.
 *
 * ---------------------------------------------------------------------------
 * ONE-TIME SETUP
 * ---------------------------------------------------------------------------
 * 1. Open the candidate sheet, then Extensions > Apps Script.
 * 2. Replace the contents of Code.gs with this file and Save.
 * 3. Change SHARED_TOKEN below to a value of your own.
 * 4. Deploy > New deployment > type "Web app":
 *      Execute as          : Me
 *      Who has access      : Anyone
 *    Deploy, approve the permission prompt, and copy the /exec URL.
 * 5. Paste that URL and the same token into `winnersSync` in
 *    src/environments/environment.ts (and environment.development.ts).
 *
 * To check it is live, open the /exec URL in a browser: it answers with
 * {"ok":true,"service":"raffle-drawer-winners-sync"}.
 *
 * ---------------------------------------------------------------------------
 * NOTES
 * ---------------------------------------------------------------------------
 * - Writes go to a separate tab (default "Winners"), created on first use. The
 *   candidate tab is never touched.
 * - Each request carries the FULL winner list and replaces the tab's contents.
 *   That makes the call idempotent: a retry after a dropped connection cannot
 *   duplicate rows, and a sync that failed earlier is repaired by the next one.
 * - SHARED_TOKEN is a speed bump, not real security. "Who has access: Anyone"
 *   means anyone holding the URL can call this, and the token ships inside the
 *   app's JavaScript, so treat it as a guard against stumbling, not secrecy.
 *   Keep the deployment URL private, and rotate the token if it leaks.
 */

var SHARED_TOKEN = 'change-me';
var DEFAULT_TAB = 'Winners';

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: 'empty request' });
    }

    var body = JSON.parse(e.postData.contents);

    if (String(body.token) !== String(SHARED_TOKEN)) {
      return respond({ ok: false, error: 'bad token' });
    }

    var rows = Array.isArray(body.rows) ? body.rows : [];
    var tabName = typeof body.tab === 'string' && body.tab ? body.tab : DEFAULT_TAB;
    var written = writeRows(tabName, rows);

    return respond({ ok: true, tab: tabName, rows: written });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

/**
 * Reads a tab BY NAME: /exec?tab=Candidates
 *
 * The plain CSV export (?format=csv with no gid) always returns whichever tab
 * happens to be first, so once a workbook holds both Candidates and Winners,
 * dragging the tabs into a different order would quietly feed the winner rows
 * in as entries. Reading by name cannot be reordered into the wrong answer.
 *
 * With no tab parameter this is a health check, so the deployment can be
 * verified from a browser.
 */
function doGet(e) {
  var tabName = e && e.parameter ? e.parameter.tab : '';
  if (!tabName) {
    return respond({ ok: true, service: 'raffle-drawer-winners-sync' });
  }

  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    if (!sheet) {
      return respond({ ok: false, error: 'no tab named ' + tabName });
    }

    var range = sheet.getDataRange();
    var values = range ? range.getDisplayValues() : [];
    return respond({ ok: true, tab: tabName, rows: values });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

function writeRows(tabName, rows) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(tabName) || spreadsheet.insertSheet(tabName);

  // Only ever clears the winners tab, never the entry list.
  sheet.clearContents();

  if (!rows.length) {
    return 0;
  }

  // setValues needs a rectangle, so pad every row to the widest one.
  var width = rows.reduce(function (max, row) {
    return Math.max(max, row.length);
  }, 0);

  var padded = rows.map(function (row) {
    var copy = row.slice(0, width).map(function (cell) {
      return cell === null || cell === undefined ? '' : String(cell);
    });
    while (copy.length < width) {
      copy.push('');
    }
    return copy;
  });

  sheet.getRange(1, 1, padded.length, width).setValues(padded);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  sheet.autoResizeColumns(1, width);

  return padded.length - 1;
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
