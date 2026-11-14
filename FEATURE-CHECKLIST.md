# Functionality audit

This checklist maps the functionality found in the original project to the completed implementation. All original feature areas have implementation; the formerly empty role gate, authentication middleware, and notification-history hook are filled in.

| Original functionality | Implementation and verification |
| --- | --- |
| Thread listing | Real persisted API data, title, author, avatar, reply count and date; API and browser verified. |
| Thread creation | Required fields, trimmed input, length limits, submission state, success/error feedback, detail redirect and list cache update; API and browser verified. |
| Thread search | 300 ms debounce, encoded queries, title/content/author matching, empty and error states; API and browser verified. |
| Skeleton loading | Skeleton list displayed while initial thread fetch is pending; connected to the real query. |
| Authentication state | Registration, login/logout, hashed passwords, session restoration, access-token updates, and cross-tab login/logout/profile synchronization. Core account flows verified through API and browser. |
| Protected routes | Login redirect and return location, loading state, protected create/profile/history/admin routes; API and browser verified. |
| Authorized API calls | Bearer headers and credentials; automated client tests cover concurrent refresh, retry, revoked sessions and network failures. |
| Token refresh | HTTP-only refresh cookie and expiring access tokens; restored sessions and expired/forged/revoked token tests pass. |
| Thread chat | Authenticated room join, input validation, persisted recent history, acknowledgments, reconnect, connection/error state and deleted-room events; API and browser verified. |
| Socket authentication | JWT verification plus active-session validation; invalid tokens and logout disconnection tested. |
| Live notifications | SSE with heartbeat, reconnect, initial synchronization, persisted missed-event recovery, independent connections for multiple tabs, and abort cleanup; integration tested. |
| Notification badge | Derived unread count, zero badge hidden, 99+ cap; unread updates browser verified. |
| Notification dropdown | Toggle, outside-click/Escape dismissal, notification links, empty/error/loading states and a visible link to full history. |
| Individual/bulk read | Persisted actions with owner checks, optimistic bulk update and recovery after errors; API and browser verified. Read changes also notify other open streams. |
| Notification state/history | Real history endpoint, deduplication, aborted superseded requests, visibility/poll recovery and immediate reset on account change. |
| Avatar selection | File picker and drag/drop handlers, drag state, filename and object-URL preview with cleanup; file picker/preview browser verified. |
| Avatar validation | Client MIME and 5 MB rules, server MIME/size/signature checks, missing-file handling; automated rejection tests pass. |
| Avatar upload | Authenticated multipart request, progress events, timeout/network/server errors, stored image, updated profile and image link; browser upload and automated client/server tests pass. |
| Toast feedback | Success/error/info, multiple messages, timed/manual dismissal and timeout cleanup; used by real create/reply/profile/upload/logout flows. |
| Query management | Real list/detail/admin queries and mutations, invalidation, retry/loading/error/empty states, periodic data refresh and account cache clearing. |
| Role gate | Administrator-only navigation and member directory, plus server-side enforcement and author/admin discussion deletion; API/browser role checks pass. |
| Backend auth middleware | Real bearer verification, active-session checks and administrator enforcement; covered by integration tests. |

Additional connected behavior: discussion detail/replies, display-name editing, owner/admin deletion with explicit UI confirmation, room history persistence, responsive styling, labels, reduced-motion styling, not-found pages and a root launcher.

## Repeatable checks

From the project root:

```
npm test
npm run lint
npm run build
```

The Node test report has 38 passing entries across backend integration, frontend API client, production configuration, migration, process isolation and backup/restore suites. Tests use temporary storage and do not create accounts in the main application.

Browser checks used a separate instance to exercise registration/login/logout, session restoration, role navigation, thread creation/detail/search, replies, real-time chat, profile name, avatar selection/upload, persisted notification counts and individual/bulk reads. A two-tab browser check confirmed that logout in one tab removes the authenticated controls and chat in the other, and login restores both tabs. The notification-history link, persisted full history, and Escape dismissal were also verified in the browser. Automated checks cover SSE synchronization across connections and logout disconnecting sockets/streams.

The production layout has separate frontend and backend folders, independent container builds, HTTPS proxy configuration and SQLite storage for one backend process. See PRODUCTION.md for configuration and verification scope. No email delivery, password reset, payments or other unrelated features were present in the original source, and they are not represented as implemented here.
