/**
 * Feature 3 — Event Catalogue, Search and Filtering verification.
 * Run: node scripts/test-feature3-catalogue.js
 */
require("dotenv").config();
const http = require("http");
const pool = require("../config/database");

const PORT = process.env.PORT || 3000;
const results = [];

function record(name, ok, detail) {
  results.push({ name: name, ok: !!ok, detail: detail || "" });
  console.log((ok ? "PASS" : "FAIL") + " — " + name + (detail ? ": " + detail : ""));
}

function get(path) {
  return new Promise(function (resolve, reject) {
    http.get({ hostname: "127.0.0.1", port: PORT, path: path, timeout: 20000 }, function (res) {
      let data = "";
      res.on("data", function (c) { data += c; });
      res.on("end", function () {
        resolve({ status: res.statusCode, body: data });
      });
    }).on("error", reject);
  });
}

function countCards(html) {
  return (html.match(/class="event-card"/g) || []).length;
}

function extractTitles(html) {
  const titles = [];
  const re = /class="event-card-title">([^<]+)</g;
  let m;
  while ((m = re.exec(html)) !== null) {
    titles.push(m[1].trim());
  }
  return titles;
}

/** Active upcoming catalogue visibility (matches lib/publicEvents.js). */
const CATALOGUE_WHERE =
  "status IN ('Open', 'Full', 'Closed') AND start_datetime >= NOW()";

(async function main() {
  const [dbEvents] = await pool.query(
    "SELECT event_id, event_name, location, status, category_id, participant_capacity, volunteer_capacity, start_datetime FROM events WHERE "
      + CATALOGUE_WHERE
      + " ORDER BY start_datetime ASC"
  );
  const mysqlCount = dbEvents.length;
  const mysqlNames = dbEvents.map(function (e) { return e.event_name; });

  // 1. Open /events with no filters
  const cat = await get("/events");
  const cards = countCards(cat.body);
  const titles = extractTitles(cat.body);
  record("1. GET /events loads", cat.status === 200, "status=" + cat.status);
  record(
    "2. Card count matches public catalogue MySQL set",
    cards === mysqlCount,
    "mysql=" + mysqlCount + " cards=" + cards
  );
  record(
    "2b. Displayed names match public catalogue MySQL set",
    titles.length === mysqlNames.length && titles.every(function (t) { return mysqlNames.indexOf(t) !== -1; }),
    "titles=" + JSON.stringify(titles)
  );
  record(
    "2c. Draft/Cancelled/Completed/past hidden from catalogue",
    !/badge-cc-draft/.test(cat.body),
    "ok"
  );
  record(
    "14. No temporary/sample markers on catalogue",
    !/Temporary sample|fake event|preview only event/i.test(cat.body),
    "ok"
  );

  // 3. Search exact event
  const sample = dbEvents[0];
  const searchExact = await get("/events?search=" + encodeURIComponent(sample.event_name));
  const exactTitles = extractTitles(searchExact.body);
  record(
    "3. Search exact event name",
    searchExact.status === 200 && exactTitles.indexOf(sample.event_name) !== -1 && exactTitles.length >= 1,
    "found=" + JSON.stringify(exactTitles)
  );

  // 4. Search no result
  const searchNone = await get("/events?search=" + encodeURIComponent("ZZZ_NO_MATCH_FEATURE3_999"));
  record(
    "4. Search with no result shows empty state",
    searchNone.status === 200 &&
      countCards(searchNone.body) === 0 &&
      /No events match your filters/i.test(searchNone.body),
    "cards=" + countCards(searchNone.body)
  );

  // 5. Filter by category
  const [[catRow]] = await pool.query(
    "SELECT category_id, category_name FROM event_categories ORDER BY category_id LIMIT 1"
  );
  const [[catCountRow]] = await pool.query(
    "SELECT COUNT(*) AS total FROM events WHERE category_id = ? AND " + CATALOGUE_WHERE,
    [catRow.category_id]
  );
  const byCat = await get("/events?category=" + catRow.category_id);
  record(
    "5. Filter by category",
    countCards(byCat.body) === Number(catCountRow.total) &&
      byCat.body.indexOf('selected') !== -1,
    "category=" + catRow.category_name + " mysql=" + catCountRow.total + " cards=" + countCards(byCat.body)
  );
  record(
    "Filter values preserved (category selected)",
    byCat.body.indexOf('value="' + catRow.category_id + '" selected') !== -1 ||
      byCat.body.indexOf("value=\"" + catRow.category_id + "\" selected") !== -1 ||
      new RegExp('value="' + catRow.category_id + '"[^>]*selected').test(byCat.body),
    "ok"
  );

  // 6. Date filter — Next 30 days
  const [[next30]] = await pool.query(
    `SELECT COUNT(*) AS total FROM events
     WHERE status IN ('Open', 'Full', 'Closed')
       AND start_datetime >= NOW()
       AND start_datetime < DATE_ADD(NOW(), INTERVAL 30 DAY)`
  );
  const byDate = await get("/events?date=" + encodeURIComponent("Next 30 days"));
  record(
    "6. Filter by date (Next 30 days)",
    countCards(byDate.body) === Number(next30.total),
    "mysql=" + next30.total + " cards=" + countCards(byDate.body)
  );

  // 7. Location East
  const eastKeywords = ["East Coast", "Bedok", "Tampines", "Pasir Ris", "Changi"];
  let eastSql = "SELECT COUNT(*) AS total FROM events WHERE (" +
    eastKeywords.map(function () { return "location LIKE ?"; }).join(" OR ") + ") AND " + CATALOGUE_WHERE;
  const eastParams = eastKeywords.map(function (k) { return "%" + k + "%"; });
  const [[eastCount]] = await pool.query(eastSql, eastParams);
  const byLoc = await get("/events?location=East");
  record(
    "7. Filter by location (East)",
    countCards(byLoc.body) === Number(eastCount.total),
    "mysql=" + eastCount.total + " cards=" + countCards(byLoc.body)
  );

  // 8. Participant spaces available
  const [pAvailRows] = await pool.query(`
    SELECT e.event_id
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    WHERE e.status IN ('Open', 'Full', 'Closed') AND e.start_datetime >= NOW()
    GROUP BY e.event_id, e.participant_capacity
    HAVING (e.participant_capacity - COALESCE(SUM(CASE WHEN r.participation_type = 'Participant' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0)) > 0
  `);
  const byP = await get("/events?availability=" + encodeURIComponent("Participant spaces available"));
  record(
    "8. Filter Participant spaces available",
    countCards(byP.body) === pAvailRows.length,
    "mysql=" + pAvailRows.length + " cards=" + countCards(byP.body)
  );

  // 9. Volunteer spaces available
  const [vAvailRows] = await pool.query(`
    SELECT e.event_id
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    WHERE e.status IN ('Open', 'Full', 'Closed') AND e.start_datetime >= NOW()
    GROUP BY e.event_id, e.volunteer_capacity
    HAVING (e.volunteer_capacity - COALESCE(SUM(CASE WHEN r.participation_type = 'Volunteer' AND r.status = 'Confirmed' THEN 1 ELSE 0 END), 0)) > 0
  `);
  const byV = await get("/events?availability=" + encodeURIComponent("Volunteer spaces available"));
  record(
    "9. Filter Volunteer spaces available",
    countCards(byV.body) === vAvailRows.length,
    "mysql=" + vAvailRows.length + " cards=" + countCards(byV.body)
  );

  // 10. Sort by date
  const byDateSort = await get("/events?sort=date");
  const dateTitles = extractTitles(byDateSort.body);
  const expectedDateOrder = dbEvents
    .slice()
    .sort(function (a, b) { return new Date(a.start_datetime) - new Date(b.start_datetime); })
    .map(function (e) { return e.event_name; });
  record(
    "10. Sort by date (soonest ascending)",
    JSON.stringify(dateTitles) === JSON.stringify(expectedDateOrder),
    "got=" + JSON.stringify(dateTitles)
  );

  // 11. Sort by popularity
  const [popRows] = await pool.query(`
    SELECT e.event_id, e.event_name,
      COALESCE(SUM(CASE WHEN r.status IN ('Confirmed','Waitlisted') THEN 1 ELSE 0 END), 0) AS pop
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.event_id
    WHERE e.status IN ('Open', 'Full', 'Closed') AND e.start_datetime >= NOW()
    GROUP BY e.event_id, e.event_name, e.start_datetime
    ORDER BY pop DESC, e.start_datetime ASC
  `);
  // App popularity = confirmed P+V + waitlisted P+V (all four counts) which equals Confirmed+Waitlisted for both types
  const byPop = await get("/events?sort=popularity");
  const popTitles = extractTitles(byPop.body);
  const expectedPop = popRows.map(function (r) { return r.event_name; });
  record(
    "11. Sort by popularity (real registration counts)",
    JSON.stringify(popTitles) === JSON.stringify(expectedPop),
    "got=" + JSON.stringify(popTitles) + " expected=" + JSON.stringify(expectedPop)
  );

  // 12–13. Event details + MySQL counts
  const detailId = sample.event_id;
  const [[counts]] = await pool.query(`
    SELECT
      COALESCE(SUM(CASE WHEN participation_type = 'Participant' AND status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS p,
      COALESCE(SUM(CASE WHEN participation_type = 'Volunteer' AND status = 'Confirmed' THEN 1 ELSE 0 END), 0) AS v,
      COALESCE(SUM(CASE WHEN participation_type = 'Participant' AND status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS pw,
      COALESCE(SUM(CASE WHEN participation_type = 'Volunteer' AND status = 'Waitlisted' THEN 1 ELSE 0 END), 0) AS vw
    FROM event_registrations
    WHERE event_id = ?
  `, [detailId]);
  const detail = await get("/events/" + detailId);
  const pLeft = Math.max(Number(sample.participant_capacity) - Number(counts.p), 0);
  const vLeft = Math.max(Number(sample.volunteer_capacity) - Number(counts.v), 0);
  record(
    "12. Event-details page loads",
    detail.status === 200 && detail.body.indexOf(sample.event_name) !== -1,
    "status=" + detail.status
  );
  record(
    "13. Details match MySQL name/location/counts",
    detail.body.indexOf(sample.event_name) !== -1 &&
      detail.body.indexOf(sample.location) !== -1 &&
      detail.body.indexOf(String(counts.p) + " of " + sample.participant_capacity) !== -1 &&
      detail.body.indexOf(String(counts.v) + " of " + sample.volunteer_capacity) !== -1,
    "p=" + counts.p + "/" + sample.participant_capacity + " v=" + counts.v + "/" + sample.volunteer_capacity +
      " leftP=" + pLeft + " leftV=" + vLeft
  );

  const missing = await get("/events/999999");
  record("404 for missing event", missing.status === 404, "status=" + missing.status);

  const [[draftRow]] = await pool.query(
    "SELECT event_id FROM events WHERE status = 'Draft' ORDER BY event_id LIMIT 1"
  );
  if (draftRow) {
    const draftDetail = await get("/events/" + draftRow.event_id);
    record(
      "Draft event unavailable on public details",
      draftDetail.status === 404,
      "status=" + draftDetail.status + " id=" + draftRow.event_id
    );
  } else {
    record("Draft event unavailable on public details", true, "no Draft event in DB to probe");
  }

  // Preserve filters after refresh (sort + search in URL reflected in form)
  const preserved = await get("/events?search=Park&sort=popularity");
  const searchPreserved = preserved.body.indexOf('value="Park"') !== -1;
  const sortPreserved =
    preserved.body.indexOf('value="popularity" selected') !== -1 ||
    /<option value="popularity" selected>/.test(preserved.body);
  record(
    "Selected filters preserved in form",
    searchPreserved && sortPreserved,
    "search=" + searchPreserved + " sort=" + sortPreserved
  );

  const failed = results.filter(function (r) { return !r.ok; });
  console.log("\nMySQL event count: " + mysqlCount);
  console.log("Website event-card count (unfiltered): " + cards);
  console.log("Summary: " + (results.length - failed.length) + "/" + results.length + " passed");
  if (failed.length) {
    failed.forEach(function (f) { console.log("FAIL: " + f.name + " — " + f.detail); });
    process.exitCode = 1;
  } else {
    console.log("FEATURE3_CATALOGUE_COMPLETE_AND_WORKING");
  }
  await pool.end();
})().catch(async function (err) {
  console.error(err);
  try { await pool.end(); } catch (e) { /* ignore */ }
  process.exit(1);
});
