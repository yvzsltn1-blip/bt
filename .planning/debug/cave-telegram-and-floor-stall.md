# Cave Telegram and Floor Stall

Status: resolved in userscript v1.0.6

## Symptoms

- Cave start/stop Telegram notifications were absent.
- A due floor band could show "Simdi kontrol ediliyor" while the bot waited and did not enter it.

## Root causes

1. `sendSuiteNotification` launched `fetch` without awaiting it. Cave start/stop could navigate immediately, canceling the request. `caveNotifyActive` was saved before Firestore confirmed delivery, suppressing retries after failure.
2. `scheduleAutoReturnFromOtherPage` ignored an already-due target band and selected the minimum due time only from other future bands. The card therefore showed ready while the navigation timer waited for another band.
3. When orb priority was present, the other-page return scheduler exited permanently on that page instead of checking again.

## Fix

- Await Firestore notification writes before navigation/state cleanup, use `keepalive`, add an 8-second abort limit, serialize transitions, and persist `caveNotifyActive` only after HTTP success.
- Select a ready band with `nextDueFloor`; otherwise wait for the selected target band's own due time.
- Retry the orb-priority handoff check every 5 seconds while auto mode remains enabled.

## Verification

- `node --check bt-birlik-magara-orb.user.js`: passed.
- Focused static review confirmed notification callers await before navigation and the ready-band path schedules immediate return.
