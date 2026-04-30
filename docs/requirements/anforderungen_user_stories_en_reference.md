# Guestlist Web App Requirements

Based on the existing Google Sheets guest-list app/workbook: central Gäste table, five Check-in tabs, Listen, Kategorien, category totals, support comments, and multi-user check-in needs.

## Roles
- **Event Manager**: Owns event setup, guest data, categories, reports, imports, exports, and user access.
- **Check-in Staff**: Uses a mobile or tablet check-in screen to search guests, verify category, check guests in, and add support comments.
- **Door Manager / Event Lead**: Monitors live status, category totals, staff activity, and exceptions during the event.
- **Viewer**: Can view dashboards and lists without editing guest data.
- **System Administrator**: Deploys and operates the web app, monitors errors, and manages technical configuration.

## Data entities
- **Event**: Name, date, optional venue, active/inactive state.
- **Guest**: Guest ID, guest name, category, check-in status, check-in time, check-in by, support comment.
- **Category**: Category name, description, priority/order, active flag. Defaults: GA, Member GA, Member VIP, On Stage, Mitarbeiter.
- **Status**: Offen, Eingecheckt, No Show.
- **Check-in Station**: Station/session name such as Check-in 1 through Check-in 5; linked to actions.
- **Audit Log Entry**: Guest ID, action, previous value, new value, timestamp, user/station.

## Event setup and user access
### EVT-001 (MVP)
As an Event Manager I want to create or configure an event name and event date, so that the guest list is clearly linked to the correct event.

Acceptance criteria:
- Event name and date are visible in the admin and check-in screens.
- The system supports at least one active event for the MVP.
- Event metadata can be edited before the event starts.

### EVT-002 (MVP)
As an Event Manager I want to invite team members to the web app, so that multiple people can operate the event check-in.

Acceptance criteria:
- The app supports at least 5 concurrent staff users.
- Invited users can access the event from mobile, tablet, or desktop browser.
- Access can be removed by an Event Manager.

### EVT-003 (MVP)
As an Event Manager I want to assign user roles, so that staff only see and edit what they need for their task.

Acceptance criteria:
- Supported roles include Event Manager, Check-in Staff, and Viewer.
- Check-in Staff can search guests, check guests in, and add support comments.
- Only Event Managers can manage categories and bulk guest data.

### EVT-004 (MVP)
As a Check-in Staff member I want each device to have its own check-in session or station name, so that check-ins show which station handled the guest.

Acceptance criteria:
- The station name is shown on the check-in screen.
- The station name is saved as “Check-in by”.
- Default station names support Check-in 1 through Check-in 5.

## Guest management
### GST-001 (MVP)
As an Event Manager I want to add guests with a name, so that the system has a central guest database.

Acceptance criteria:
- A guest can be created with at least a guest name.
- The guest appears in search results after saving.
- Empty guest records are not counted in totals.

### GST-002 (MVP)
As an Event Manager I want every guest to receive a unique Guest ID, so that guests with identical or similar names can still be identified.

Acceptance criteria:
- A Guest ID is generated automatically when a guest is created.
- Guest IDs remain stable after edits.
- Search can find a guest by Guest ID.

### GST-003 (MVP)
As an Event Manager I want to edit a guest name, category, status, and support comment, so that corrections can be made before or during the event.

Acceptance criteria:
- Changes are saved immediately or after an explicit save action.
- Updated values are reflected in search results and lists.
- Invalid category or status values are rejected.

### GST-004 (MVP)
As an Event Manager I want to import guests from CSV or Excel, so that I can migrate the current spreadsheet workflow into the web app.

Acceptance criteria:
- Import accepts columns for Guest ID, guest name, category, status, check-in time, check-in by, and support comment.
- The import preview highlights missing names and invalid categories.
- The Event Manager can confirm or cancel the import before data is saved.

### GST-005 (MVP)
As an Event Manager I want to export the guest list to CSV or Excel, so that I can keep an offline backup and share post-event reports.

Acceptance criteria:
- Export includes all guest fields used by the MVP.
- Export can be filtered by category or status.
- Exported data preserves check-in time and support comments.

### GST-006 (Should)
As an Event Manager I want to bulk edit selected guests, so that category or status corrections can be made quickly.

Acceptance criteria:
- Multiple guests can be selected from the admin list.
- Bulk changes support category and status.
- The app asks for confirmation before applying bulk changes.

## Categories and statuses
### CAT-001 (MVP)
As an Event Manager I want to assign each guest to a predefined category, so that access levels can be checked at the door.

Acceptance criteria:
- Default categories are GA, Member GA, Member VIP, On Stage, and Mitarbeiter.
- A guest can have one primary category in the MVP.
- Category is visible in admin lists, check-in search results, and category lists.

### CAT-002 (MVP)
As an Event Manager I want to manage the list of guest categories, so that the app can adapt to future events.

Acceptance criteria:
- Categories can be added, renamed, deactivated, and ordered.
- A category cannot be deleted if guests are currently assigned to it unless reassigned first.
- Category changes update list filters and totals.

### CAT-003 (MVP)
As an Event Manager I want to assign each guest a check-in status, so that the team can distinguish open, checked-in, and no-show guests.

Acceptance criteria:
- Supported default statuses are Offen, Eingecheckt, and No Show.
- The default status for new guests is Offen.
- Status is visible in all relevant guest views.

### CAT-004 (MVP)
As a Check-in Staff member I want the category shown clearly in the search result, so that I can verify the guest access level before admitting them.

Acceptance criteria:
- Category is displayed next to every search result.
- Long category names remain readable on mobile and tablet screens.
- Category is shown before or next to the check-in action.

### CAT-005 (Should)
As an Event Manager I want category priority or ordering, so that important groups such as On Stage or Member VIP appear consistently in reports.

Acceptance criteria:
- Categories have a configurable order.
- Reports use this order instead of alphabetical order when configured.
- Default order follows the current spreadsheet category priority.

## Check-in workflow
### CHK-001 (MVP)
As a Check-in Staff member I want to search by guest name, Guest ID, category, status, or support comment, so that I can quickly find the correct guest at the entrance.

Acceptance criteria:
- Search returns matching guests while using partial text.
- Search works with upper- and lower-case input.
- The result set displays Guest ID, name, category, status, check-in time, check-in by, and support comment.

### CHK-002 (MVP)
As a Check-in Staff member I want to check in a guest with one action, so that the entrance process is fast.

Acceptance criteria:
- The action changes status to Eingecheckt.
- The action saves the current timestamp as check-in time.
- The action saves the current station or user as check-in by.

### CHK-003 (MVP)
As a Check-in Staff member I want to see whether a guest is already checked in, so that I do not admit the same guest twice by mistake.

Acceptance criteria:
- Already checked-in guests are visually marked in search results.
- Attempting a second check-in shows a clear warning with time and station/user.
- The app does not overwrite the original check-in timestamp unless an authorized reset is performed.

### CHK-004 (MVP)
As a Check-in Staff member I want to undo or reset a check-in, so that accidental check-ins can be corrected.

Acceptance criteria:
- A checked-in guest can be reset to Offen by an authorized user.
- Reset clears or updates check-in time and check-in by according to the audit rules.
- The reset is reflected immediately in all active sessions.

### CHK-005 (MVP)
As a Check-in Staff member I want to mark a guest as No Show, so that end-of-event reporting is accurate.

Acceptance criteria:
- No Show is available as a status option.
- No Show guests are counted separately from open guests.
- A No Show guest can later be checked in if needed, with confirmation.

### CHK-006 (MVP)
As a Check-in Staff member I want search results to refresh after a check-in, so that the visible status is always current.

Acceptance criteria:
- After check-in, the row status changes without requiring a full page reload.
- Other open sessions receive the updated guest status.
- The UI prevents stale actions where practical.

### CHK-007 (MVP)
As a Check-in Staff member I want the check-in screen optimized for mobile and tablet use, so that I can operate it comfortably at the entrance.

Acceptance criteria:
- Primary actions are usable with touch input.
- Search and check-in are visible without unnecessary scrolling on a tablet.
- The screen remains readable in portrait and landscape orientation.

### CHK-008 (Should)
As a Door Manager I want to see which station checked in each guest, so that I can troubleshoot entrance issues.

Acceptance criteria:
- Check-in by is stored per guest.
- Check-in by can show station name, user name, or both.
- The value appears in guest detail, lists, and export.

## Support comments
### COM-001 (MVP)
As a Check-in Staff member I want to add a support comment for a guest, so that special handling notes are available to the team.

Acceptance criteria:
- A support comment can be added from the check-in screen.
- The comment is saved to the guest record.
- The updated comment is visible to other active users.

### COM-002 (MVP)
As an Event Manager I want to edit support comments from the admin guest list, so that notes can be prepared before the event.

Acceptance criteria:
- Support comments are editable in the guest detail or admin list.
- Empty comments are allowed.
- Comments are included in exports.

### COM-003 (Should)
As a Check-in Staff member I want long support comments to remain readable on mobile, so that important details are not hidden.

Acceptance criteria:
- Long comments wrap or open in a detail view.
- The check-in action remains easy to access even when comments are long.
- The app avoids truncating critical comment text without a way to expand it.

### COM-004 (Could)
As an Event Manager I want support comments to be protected from guest-facing views, so that internal notes remain confidential.

Acceptance criteria:
- Internal comments are never shown to guests.
- Only authorized staff can view or edit comments.
- Exports containing comments are clearly labeled as internal.

## Lists, filters, and reporting
### LST-001 (MVP)
As an Event Manager I want a live status dashboard, so that I can see total guests, checked-in guests, open guests, and no-shows.

Acceptance criteria:
- Dashboard shows totals for Total Gäste, Eingecheckt, Offen, and No Show.
- Totals update when guests are added, checked in, reset, or marked no-show.
- Dashboard is visible without editing raw data.

### LST-002 (MVP)
As an Event Manager I want category summaries with total persons, checked-in, open, and no-show counts, so that I can monitor each access group.

Acceptance criteria:
- Summaries exist for GA, Member GA, Member VIP, On Stage, and Mitarbeiter by default.
- Each category shows Summe Personen, Eingecheckt, Offen, and No Show.
- Counts update live after check-in or status changes.

### LST-003 (MVP)
As a Check-in Staff member I want filtered lists by category, so that I can quickly review who belongs to GA, Member GA, Member VIP, On Stage, or Mitarbeiter.

Acceptance criteria:
- The user can filter by one category or view all categories.
- Filtered lists show Guest ID, name, category, status, check-in time, check-in by, and support comment.
- Filters do not interfere with other users’ sessions.

### LST-004 (MVP)
As an Event Manager I want a dedicated Mitarbeiter list and summary, so that staff members can be tracked separately from regular guests.

Acceptance criteria:
- Mitarbeiter is available as a default category.
- Mitarbeiter appears in category summaries.
- The Mitarbeiter list uses the same fields as other category lists.

### LST-005 (Should)
As an Event Manager I want to sort and search within lists, so that large guest lists can be reviewed efficiently.

Acceptance criteria:
- Lists can be sorted by name, category, status, check-in time, or check-in by.
- Search within list views does not alter global data.
- Sorting and filters are user-specific and do not affect other users.

### LST-006 (Should)
As an Event Manager I want post-event reporting, so that I can review attendance after the event.

Acceptance criteria:
- Report includes total attendance and category breakdown.
- Report can be exported.
- Report includes no-show counts and check-in timestamps.

## Real-time collaboration and data integrity
### COL-001 (MVP)
As a Check-in Staff member I want changes from other devices to appear quickly, so that all entrances operate from the same current guest status.

Acceptance criteria:
- Status changes propagate to other active sessions within a short time.
- The user can continue working without manually refreshing after every action.
- The system indicates when it loses connection or fails to sync.

### COL-002 (MVP)
As an Event Manager I want the system to handle simultaneous check-in attempts safely, so that two devices cannot create inconsistent guest states.

Acceptance criteria:
- Concurrent check-in attempts for the same guest result in one accepted check-in.
- The second user sees an already-checked-in warning.
- The guest record remains internally consistent.

### COL-003 (MVP)
As an Event Manager I want an audit log of check-in and reset actions, so that corrections and disputes can be investigated.

Acceptance criteria:
- Audit log records guest ID, action, timestamp, user or station, previous status, and new status.
- Audit entries cannot be edited by normal users.
- The audit log can be filtered by guest, action, user/station, and time.

### COL-004 (Should)
As an Event Manager I want automatic backups or restore points, so that guest data can be recovered after accidental changes.

Acceptance criteria:
- The app provides a way to recover recent guest-list data.
- Backup or restore behavior is documented.
- Restore actions are limited to authorized users.

### COL-005 (MVP)
As a System Administrator I want validation for guest fields, so that invalid categories, statuses, or timestamps do not corrupt reports.

Acceptance criteria:
- Category and status must match configured values.
- Timestamps are stored consistently.
- Required fields are enforced before saving.

## Operations, security, and performance
### OPS-001 (MVP)
As a Check-in Staff member I want the app to run in a normal web browser, so that no special spreadsheet setup is required at the entrance.

Acceptance criteria:
- The check-in screen works in current mobile, tablet, and desktop browsers.
- Users access the app through a URL.
- The app does not require installing Google Sheets or an Apps Script.

### OPS-002 (MVP)
As an Event Manager I want secure login, so that only authorized team members can access the guest list.

Acceptance criteria:
- Users must authenticate before accessing event data.
- Sessions can be revoked or expired.
- Unauthorized users cannot view guest records.

### OPS-003 (MVP)
As a System Administrator I want the app deployed to a hosted web environment, so that check-in staff can access it reliably from the event location.

Acceptance criteria:
- The app has a stable production URL.
- The app uses a persistent database, not local browser-only storage.
- Deployment supports separate development and production environments.

### OPS-004 (MVP)
As a Check-in Staff member I want fast search and check-in response, so that queues at the entrance stay short.

Acceptance criteria:
- Search returns results quickly for at least 1,000 guests.
- A check-in action completes quickly under normal network conditions.
- Loading states are visible for slower responses.

### OPS-005 (MVP)
As an Event Manager I want user-specific filters and views, so that one staff member’s search or filter does not disrupt another device.

Acceptance criteria:
- Each user has independent search terms and filters.
- Shared data changes are synchronized, but view state is not shared.
- This replaces the shared-tab limitation of the spreadsheet.

### OPS-006 (Should)
As a System Administrator I want clear error messages and monitoring, so that operational problems can be diagnosed during the event.

Acceptance criteria:
- Failed check-ins show understandable messages.
- System errors are logged for administrators.
- The app distinguishes user errors from connectivity or backend errors.

### OPS-007 (Should)
As an Event Manager I want the app to protect personal data, so that guest information and internal comments are handled responsibly.

Acceptance criteria:
- Guest data is only accessible to authorized users.
- Exports are controlled by role.
- The system supports deleting or archiving guest data after the event.

## Phase 2 / optional enhancements
### P2-001 (Could)
As a Check-in Staff member I want to scan QR codes or barcodes, so that check-in is faster than manual name search.

Acceptance criteria:
- A guest can be found by scanning a code.
- The system still supports manual search as fallback.
- Duplicate scan attempts show the same already-checked-in warning.

### P2-002 (Could)
As a Check-in Staff member I want offline check-in support, so that the event can continue during temporary internet outages.

Acceptance criteria:
- The app can continue taking check-ins without network for a defined period.
- Offline actions are synced when connection returns.
- Conflicts are detected and resolved safely.

### P2-003 (Could)
As an Event Manager I want RSVP tracking, so that invited, confirmed, declined, and open invitations are visible before the event.

Acceptance criteria:
- RSVP status is separate from check-in status.
- RSVP can be imported or edited manually.
- Reports can compare RSVP status with attendance.

### P2-004 (Could)
As an Event Manager I want email invitations or guest updates, so that guest communication can happen from the same system.

Acceptance criteria:
- The app can send invitation or update emails to selected guests.
- Email delivery status is visible.
- Guests without email addresses can still be managed manually.

### P2-005 (Could)
As a Check-in Staff member I want badge or label printing, so that VIP, Mitarbeiter, or On Stage guests can receive physical access labels.

Acceptance criteria:
- Badges can include guest name and category.
- Printing can be triggered during check-in.
- The feature is optional and does not block check-in.

### P2-006 (Could)
As an Event Manager I want multiple events in one account, so that recurring events can reuse the same system.

Acceptance criteria:
- Users can switch between events.
- Guest lists and reports remain separated by event.
- Categories can be copied from one event to another.

## Open decisions
- **Authentication method**: Decide whether to use email/password, magic links, single sign-on, or a shared event access code.
- **Offline requirement**: Decide whether offline check-in is required for MVP or only a Phase 2 enhancement.
- **Guest-facing features**: Decide whether guests will ever self-register, RSVP, or receive QR codes through the app.
- **Data retention**: Decide how long guest data and support comments should be stored after the event.
- **Multiple categories per guest**: Current workflow uses one primary category; decide whether future events need multiple access tags.
- **Plus-one / companions**: Current workflow counts one row as one person; decide whether guest companions need separate tracking.