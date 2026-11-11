# G-TEC Charummood app

One web app (installable on Android and usable in any browser) with five screens:

| Screen | For | What it does |
|---|---|---|
| TV display | TV box / PC on the TV | Morning brief, batch attendance boards, ads and music (unchanged from v1.3) |
| Tutor | Tutors | Mark today's attendance (unchanged) |
| Director | Director | TV status and announcements (unchanged), plus a button into the Centre Manager |
| **Centre Manager** | Director, front office, tutors | Students, fees and reminders, attendance alerts, leaves, batches, lab computers, upgrade suggestions, enquiries |
| **Student** | Students | Own attendance, fees, leave requests, next-course suggestions |

## Layout

- `web/` — the app served at app.gteccharummood.in (plain HTML/CSS/JS, no build step).
- `server/Code.gs` — the Centre Manager server (Google Apps Script). Keeps its data in its own Google Sheet.
  It is separate from the existing TV/attendance script and only reads the monthly attendance file.
- `tests/` — the real server code run against in-memory sheets, and the real app driven in Chromium.

## Setting up the Centre Manager server (once, about 5 minutes)

1. Sign in to Google with the account that can open the monthly `STUDENT ATTENDANCE - <MONTH> <YEAR>` files.
2. Open https://script.new, delete the sample code, paste all of `server/Code.gs`, and save.
3. Choose the function `setup` and press **Run**. Approve the permissions.
   The execution log shows the link of the new data sheet **G-TEC CENTRE MANAGER** and the first login (name `Director` and a 6-digit PIN).
4. **Deploy › New deployment › Web app** — Execute as: *Me*; Who has access: *Anyone*. Copy the web app link.
5. Put that link in `web/config.js` as `mgmtUrl` (or type it into the app's Settings as "Centre Manager link").
6. In the app: Centre Manager › More › *Pull students from the attendance file*, then fill phone numbers and fee plans.

After changing `Code.gs` later: Deploy › Manage deployments › edit › Version: *New version* (the link stays the same).

`web/config.js` in this repository has the server links blank. The live values are only on the web server.

## Logins and what each role sees

- **Director** — everything, including staff logins, settings, deleting records.
- **Front office** — students, fees, reminders, leaves, computers, enquiries. Cannot delete payments or change settings.
- **Tutor** — students (no fee amounts), attendance, leaves, batches, computers and fault reports.
- **Student** — signs in with register number + the mobile number saved for them; sees only their own record.
  Share `https://app.gteccharummood.in/?mode=student` with students.

## Tests

    node tests/server.test.js     # server logic
    node tests/e2e.test.js        # full app in a browser (needs Playwright)
    node tests/dev-server.js      # try it locally with made-up data
