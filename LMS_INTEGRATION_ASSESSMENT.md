# Akada–LUMS LMS Integration Assessment

Date: 4 September 2026  
Status: Discovery and feasibility assessment  
Scope: Read-only review of the Akada repository, the authenticated LUMS Sakai LMS, and the authenticated Zambeel student portal

## Executive summary

Akada is highly compatible with the data available in the LUMS LMS. The strongest product model is:

> Sakai remains the official academic source; Akada becomes the student's personal planning and execution layer.

Sakai can supply courses, assignments, deadlines, quizzes, calendar events, announcements, syllabi, and resource links. Akada can turn those records into a cleaner task list, study plan, timer workflow, and progress analytics.

The primary limitation is authentication, not data availability. The LMS was accessible during this assessment because browser control operated inside an existing authenticated Chrome session. A deployed Akada website cannot automatically inherit that session or read LMS cookies belonging to `lms.lums.edu.pk`.

The recommended implementation is:

1. Treat Zambeel as the authoritative source for semesters, enrollment, course sections, credits, meeting schedules, and exams.
2. Treat Sakai as the source for instructor-published assignments, announcements, syllabi, and resources.
3. Add external identifiers and provenance to Akada courses, tasks, assessments, and calendar events.
4. Add a private Sakai calendar-feed import as the simplest dependable MVP.
5. Build an optional browser extension for richer synchronization from both authenticated systems.
6. Consider official LUMS PeopleSoft and Sakai integrations after validating demand.

## Akada's current architecture

Akada is a private academic planner built with:

- Next.js 16, React 18, and TypeScript
- Tailwind CSS
- Supabase Auth and Postgres
- Row Level Security scoped to each student
- SWR for cached application data
- An optional local-storage adapter for development
- A remote Model Context Protocol (MCP) endpoint

Its main domain entities are:

- `Semester`
- `Course`
- `Task`
- `Session`
- `UserSettings`

Existing capabilities include:

- Active and archived semesters
- Catalog or manually entered courses
- Course credit hours, section, instructor, and meeting-time metadata
- Weekly study targets per course
- Tasks with a date, priority, and completion state
- Focus sessions linked to courses and optionally tasks
- Dashboard, timer, task management, and study statistics

Relevant implementation files:

- `README.md`
- `lib/data/types.ts`
- `lib/data/data-provider.ts`
- `lib/data/supabase-adapter.ts`
- `lib/data/local-adapter.ts`
- `lib/data-hooks.ts`
- `supabase/schema.sql`

## Existing Akada MCP capability

Akada already exposes an authenticated MCP server at `/api/mcp`. It currently provides:

- `find_course`: Finds a course in the student's active semester.
- `create_tasks`: Adds up to 20 extracted tasks to one course.

The task-creation tool:

- Accepts explicit task titles, due dates, and priorities.
- Requires course resolution first.
- Does not invent missing deadlines.
- Skips duplicate unfinished tasks with the same normalized title and due date.
- Writes through the authenticated student's Supabase session rather than a service-role key.

This already supports a useful assisted workflow: give an AI a syllabus or assignment document, let it extract the work, and let it create the corresponding Akada tasks after user approval.

Relevant files:

- `MCP_SETUP.md`
- `app/api/mcp/route.ts`
- `app/api/mcp/authorize/route.ts`
- `app/api/mcp/token/route.ts`

## LMS findings

The LUMS LMS is a Sakai installation. The active Fall 2026 course sites observed during the review were:

- ECON 240 — Development Economics
- POL 3302 — Theories of IR
- MATH 101 — Calculus I
- SS 3302 — Professional Communication Skills

Each sampled course exposed the following tools:

- Overview
- Syllabus
- Calendar
- Announcements
- Resources
- Conversations
- Polls
- Discussions
- Assignments
- Tests & Quizzes
- Gradebook
- Drop Box
- Email
- Roster
- Site Info

At the time of inspection, the Fall 2026 sites appeared newly provisioned:

- The assignment lists in all four current courses contained no published assignments.
- A sampled syllabus did not yet contain syllabus content.
- The Home and course calendars did not yet show events in the visible month view.

This means synchronization should be tested again after instructors publish real course content. The present lack of records does not indicate a lack of integration capability.

## Confirmed Sakai data interfaces

The LMS exposes Sakai's Entity Broker discovery interface at `/direct/describe`. It advertised 73 registered entities. Relevant read interfaces include:

### Courses and tools

- `GET /direct/site.{format}` — Retrieve sites accessible to the current user.
- `GET /direct/site/{siteId}.{format}` — Retrieve one site.
- `GET /direct/site/{siteId}/pages.{format}` — Retrieve the pages and tools configured in a site.

### Assignments

- `GET /direct/assignment/my.{format}` — Retrieve the student's assignments across all sites.
- `GET /direct/assignment/site/{siteId}.{format}` — Retrieve assignments for one site.
- `GET /direct/assignment/item/{assignmentId}.{format}` — Retrieve one assignment.

The advertised assignment representation includes:

- Assignment ID
- Course/site context
- Title
- Instructions
- Status and draft state
- Open time
- Due time
- Close/drop-dead time
- Attachments
- Submission type
- Point value and grade scale
- Gradebook association
- Direct/deep-link information

### Calendar

- `GET /direct/calendar/my.{format}` — Retrieve calendar events across the student's sites.
- `GET /direct/calendar/site/{siteId}.{format}` — Retrieve events for one site.
- `GET /direct/calendar/event/{siteId}/{eventId}.{format}` — Retrieve one event.

The calendar representation includes event ID, assignment ID, site ID, site name, title, description, type, start time, duration, and recurrence information.

### Announcements

- `GET /direct/announcement/user.{format}` — Retrieve announcements for the current user.
- `GET /direct/announcement/site/{siteId}.{format}` — Retrieve announcements for one site.
- `GET /direct/announcement/message/{siteId}/{messageId}.{format}` — Retrieve one announcement.

### Course resources

- `GET /direct/content/site/{siteId}.{format}` — Retrieve Resources content for one site.
- `GET /direct/content/my.{format}` — Retrieve content from the user's personal workspace.

### Syllabi

- `GET /direct/syllabus/site/{siteId}.{format}` — Retrieve the posted syllabus for a site.

The syllabus endpoint can return structured content or a redirect to an externally hosted syllabus.

### Authentication

The Sakai installation advertises a session endpoint capable of authenticating with username and password and returning a Sakai session. This is technically usable but is not recommended for an initial Akada integration because it would require Akada to handle LMS credentials or long-lived session material.

## Why the existing browser login matters

The successful inspection proves two useful things:

1. The student's authenticated LMS session is sufficient to access the course tools and API descriptions.
2. The LMS exposes structured integration surfaces; an integration does not need to depend entirely on visual HTML scraping.

However, the existing session does not automatically make an ordinary Akada web deployment integrated with the LMS.

The LMS session cookie:

- Belongs to the `lms.lums.edu.pk` origin.
- Is normally inaccessible to JavaScript running on Akada's domain.
- May be protected as an `HttpOnly` cookie.
- Cannot be borrowed by Akada's Vercel server.
- Is subject to the browser's same-origin and cross-origin security rules.

Browser control worked because it operated within Chrome's already-authenticated LMS tab. An Akada browser extension could operate under a similar user-authorized model; the Akada website by itself generally cannot.

## Zambeel findings

Zambeel is an Oracle PeopleSoft Campus Solutions student portal. It is not merely a second presentation of Sakai. It contains a different and, in several areas, more authoritative set of academic records.

### Available student-facing data

The authenticated Enrollment area exposes:

- View My Assignments
- Enrollment Dates
- My Class Schedule
- My Weekly Schedule
- Add, drop, edit, and swap enrollment workflows
- View My Exam Schedule
- View My Grades
- View My Milestones
- Term history across multiple academic years

The current-term class schedule contains enough structured information to build Akada courses automatically:

- Official course code and title
- Enrollment status, including enrolled and dropped courses
- Credit units
- Academic term
- Class number
- Section
- Component type, such as lecture or laboratory
- Meeting days and exact times
- Room
- Instructor information
- Course start and end dates

The schedule correctly distinguishes currently enrolled courses from courses that were dropped. That is important because Akada should not infer current enrollment from the mere presence of a course record.

### Exam data

The current-term exam schedule exposes:

- Course and section
- Class number
- Exam type
- Exact exam date
- Start and end time
- Room or a TBA state

At the time of review, Zambeel already contained scheduled final examinations for several active courses. This data is more precise than Akada's current date-only task model and supports a dedicated calendar-event or assessment model.

### Assignment and grade data

Zambeel's **View My Assignments** area can expose, per class:

- Class meeting information
- Current mid-term and overall grade fields
- Assignment begin date
- Assignment due date
- Assignment title
- Assignment category
- Maximum points
- Assignment categories and weights
- Grade scale
- Instructor comments
- Student-specific assignment dates

During the review, a current Development Economics quiz and its deadline were visible in Zambeel even though the corresponding Sakai Assignments page reported no assignments. This demonstrates that Akada should not assume Sakai is the only source of assessment deadlines.

The grade and assignment pages should be treated as sensitive academic records. Akada should only import them after explicit user consent and should avoid logging raw values.

### Zambeel technical behavior

The pages inspected use stateful PeopleSoft component forms rather than the self-describing Entity Broker interface available in Sakai. The forms use POST requests and include numerous hidden state fields such as component state numbers, action identifiers, session identifiers, focus state, and application-class data.

Consequences:

- A browser extension can read the rendered, authenticated pages without asking Akada to store the student's password.
- Automating the underlying PeopleSoft form POST protocol directly would be more fragile than using Sakai's documented read endpoints.
- A normal Akada website cannot inherit the Zambeel browser session.
- A backend scraper would require session or credential handling and should not be the first implementation.
- Print-friendly class-schedule pages may offer a simpler import surface, but this requires additional validation.

PeopleSoft includes an Integration Broker capable of exposing REST and other service operations to third-party systems. However, those services must be configured and authorized by the institution. The review did not establish that LUMS currently exposes a student-facing Integration Broker API for Akada.

### Recommended source hierarchy

Akada should reconcile the systems as follows:

| Data | Preferred source | Secondary source |
| --- | --- | --- |
| Academic term | Zambeel | Akada configuration |
| Official enrollment status | Zambeel | Sakai site membership |
| Credits, class number, section | Zambeel | Akada catalog/Sakai title |
| Meeting time, room, instructor | Zambeel | Akada catalog |
| Final-exam schedule | Zambeel | Sakai calendar |
| Assignments and quizzes | Sakai and Zambeel, reconciled | Manual/AI import |
| Assignment instructions and attachments | Sakai | Zambeel when available |
| Announcements, syllabi, resources | Sakai | Manual import |
| Official grades and milestones | Zambeel | Sakai Gradebook when validated |
| Personal priorities and completion | Akada | None |
| Study sessions and progress | Akada | None |

The conceptual model becomes:

```text
Zambeel: official enrollment, timetable, exams, grades
                         \
                          -> Akada: planning, tasks, timer, progress
                         /
Sakai: course content, assignments, announcements, resources
```

### Cross-system course identity

Zambeel provides the best seed identity for a course because it includes the academic term, course code, section, and class number. Sakai site titles include the term, course code, section, and component but do not visibly expose the Zambeel class number.

A safe mapping order is:

1. Academic term.
2. Normalized subject and catalog number.
3. Section.
4. Component type.
5. One-time user confirmation when the match is ambiguous.

After confirmation, Akada should persist both the Zambeel class number and Sakai site ID. It should not repeatedly infer identity from display titles.

### Zambeel integration options

#### Browser-assisted import

Integration depth: High  
Expected reliability: Moderate  
Institutional involvement: None initially

A browser extension can read the authenticated schedule, exam, and assignment pages and submit normalized records to Akada. This is the strongest personal integration available without institutional support.

The extension should remain read-only in Zambeel. It must not automate add, drop, edit, or swap enrollment actions.

#### User-initiated export or print import

Integration depth: Medium  
Expected reliability: Good  
Institutional involvement: None

Akada could accept a Zambeel print-friendly schedule or user-downloaded document and preview the detected term, courses, sections, credits, and meetings before import. This would be less automatic but easier to secure and maintain.

#### Official PeopleSoft integration

Integration depth: Very high  
Expected reliability: High  
Institutional involvement: Required

LUMS could expose narrowly scoped read services through PeopleSoft Integration Broker. Oracle documents REST service definitions, OpenAPI support in modern PeopleTools, synchronous operations, and authentication options including OAuth 2. This would be the cleanest production path for enrollment and examination data, but it requires LUMS administrators to configure and approve it.

#### Direct PeopleSoft form automation

Integration depth: High  
Expected reliability: Low  
Security and maintenance cost: High

Akada's backend could theoretically emulate the observed PeopleSoft component forms. This would require maintaining hidden component state and authenticated sessions. It is fragile, difficult to secure, and not recommended.

## Integration options

### Option 1: Private Sakai calendar feed

Integration depth: Medium  
Reliability: High  
Implementation complexity: Low to medium

The LMS Home calendar exposes a **Publish (private)** action. Sakai documents this as an opaque private subscription URL. A Home calendar subscription can aggregate events from all sites in which the user is enrolled.

Potential Akada workflow:

1. The user generates a private calendar URL in Sakai.
2. The user connects that URL to Akada.
3. Akada retrieves events on demand or when the app is opened.
4. Akada maps each event to a course.
5. Relevant deadlines, assignments, quizzes, and exams become Akada tasks.
6. Subsequent syncs update existing imported tasks instead of creating duplicates.

Advantages:

- Does not require storing the LMS password.
- Does not initially require LUMS administrator involvement.
- Uses a relatively stable standard format.
- Can aggregate all enrolled course calendars.
- Provides a quick path to deadline synchronization.

Limitations:

- Only information published to the calendar is available.
- Assignment instructions, announcements, syllabi, and resources may be missing.
- The private subscription URL is a secret and must be protected.
- Events do not always map perfectly to actionable tasks.

The assessment did not generate a private calendar URL because doing so would create persistent access material.

### Option 2: Browser extension using the active LMS session

Integration depth: High  
Reliability: Good  
Implementation complexity: Medium

An Akada browser extension could operate while the student is signed into Sakai. With explicit permission for the LMS domain, it could query the same-origin Sakai `/direct` endpoints and send normalized records to the student's authenticated Akada account.

Potential capabilities:

- Discover enrolled courses.
- Match Sakai sites to Akada courses.
- Import assignments with exact deadlines and instructions.
- Import tests, quizzes, and calendar events.
- Detect new or modified announcements.
- Import syllabus content.
- Collect resource and attachment links.
- Add “Open in LMS” links to imported Akada records.
- Synchronize when the user opens the LMS or presses a Sync button.

Advantages:

- Does not require Akada to store the LMS password.
- Provides substantially richer information than a calendar feed.
- Can use the structured Sakai APIs rather than fragile page scraping.
- Does not initially require an official institutional integration.

Limitations:

- Requires the user to install an extension and grant domain access.
- Background synchronization depends on browser and extension permissions.
- Private academic data would be transferred from the LMS to Akada and requires clear consent and careful security controls.
- Changes to Sakai endpoints or institutional security configuration may require maintenance.

This is the strongest option for a full personal integration.

### Option 3: Direct server-to-Sakai session integration

Integration depth: High  
Reliability: Low to uncertain  
Implementation complexity and security risk: High

Akada's backend could technically authenticate through the advertised Sakai session endpoint and then request the Entity Broker APIs.

This is not recommended as the initial implementation because:

- Akada would need to receive or store the student's LMS credentials.
- Sakai sessions expire and need renewal.
- LUMS may enforce SSO, multifactor authentication, or other institutional controls.
- It changes Akada's security and trust model substantially.
- It may conflict with institutional security policies.

This path should only be pursued if LUMS provides an approved authentication method or dedicated integration credentials.

### Option 4: Official LUMS LTI/API integration

Integration depth: Very high  
Reliability: Very high  
Organizational complexity: High

Sakai supports LTI, including LTI 1.3/Advantage in modern versions. With LUMS approval, Akada could be registered as an external tool and launched from inside the LMS.

Possible benefits:

- Institution-controlled authentication.
- Reliable course and enrollment context.
- An Akada link within course sites.
- Potential use of supported assignment and grade services.
- No need for students to provide their LMS passwords.

This is the cleanest long-term integration, but it requires coordination with LMS administrators and security reviewers.

### Option 5: AI-assisted syllabus and document import

Integration depth: Low to medium  
Reliability: Good with user review  
Implementation complexity: Low

Akada's existing MCP connector already provides most of the foundation:

1. The user downloads or opens a syllabus or assignment document.
2. An AI extracts readings, preparation work, assignments, and explicit dates.
3. The AI finds the corresponding Akada course.
4. The AI creates the tasks after user approval.

This is not continuous synchronization, but it can deliver immediate value while the automatic integration is being developed.

## Practical integratability rating

| Approach | Integration depth | Expected reliability | Main constraint |
| --- | ---: | ---: | --- |
| Browser extension with active Sakai login | 8.5/10 | Good | Requires extension permissions |
| Browser extension with active Zambeel login | 8/10 | Moderate | Stateful PeopleSoft pages |
| Private Sakai calendar feed | 6/10 | Very good | Calendar data only |
| Akada stores LMS credentials | 8/10 technically | Poor | Security and session lifecycle |
| Official LUMS API/LTI integration | 9.5/10 | Best | Requires institutional approval |
| Zambeel schedule/print import | 6.5/10 | Good | User-initiated rather than automatic |
| Ordinary Akada website alone | 2/10 | Poor | Cross-origin authentication isolation for both systems |

These ratings describe the potential integration depth, not the amount of engineering work required.

## Recommended Akada data-model additions

### Courses

Suggested fields:

- `external_source`, for example `sakai`
- `external_site_id`
- `zambeel_class_number`
- `enrollment_status`
- `external_url`
- `last_synced_at`

Course meetings may eventually need a separate model containing component type, days, start time, end time, room, instructor, and effective date range. The existing `meetingTime` display string cannot reliably represent multiple lectures, labs, or room changes.

### Tasks

Suggested fields:

- `external_source`
- `external_id`
- `source_type`, such as `assignment`, `quiz`, `calendar_event`, or `syllabus_item`
- `source_url`
- `due_at` for an exact timestamp in addition to the existing date-only `due_date`
- `details` or `instructions`
- `source_updated_at`
- `last_synced_at`
- `sync_status`

A uniqueness constraint similar to the following would make synchronization idempotent:

```text
(user_id, external_source, external_id)
```

The existing title-and-date duplicate check should remain useful for manually imported documents, but external IDs should be preferred for synchronized records.

### Assessments and calendar events

Zambeel's exact exam times do not fit cleanly into the current task model. Add either a general `calendar_events` table or an `assessments` table with:

- `course_id`
- `external_source`
- `external_id`
- `event_type`
- `title`
- `starts_at`
- `ends_at`
- `location`
- `maximum_points`
- `source_url`
- `source_updated_at`
- `last_synced_at`

Akada can then create a related preparation task without losing the authoritative exam or assessment time.

## Course matching

The LMS course-site titles contain recognizable course codes and sections, for example a site title ending in a value such as `ECON 240 S1-Lecture`.

Akada already stores course code and section metadata. Initial automatic matching can therefore use:

1. Normalized course code.
2. Section number when available.
3. Course name as a secondary check.
4. A one-time user confirmation when more than one match is possible.

The chosen mapping should store the immutable Sakai site ID so later synchronizations do not depend on parsing titles.

## Synchronization behavior

Imported records should be visibly marked as originating from the LMS. Recommended rules:

- Do not silently overwrite student-authored task titles or notes.
- Show when an instructor changes a deadline.
- Preserve completed Akada tasks even if an LMS record disappears.
- Offer archive/dismiss behavior rather than destructive deletion.
- Keep a direct link back to the authoritative LMS item.
- Treat course announcements as notifications unless they contain an explicit action or deadline.
- Require user review before converting ambiguous syllabus prose into tasks.
- Use exact LMS external IDs for reconciliation.
- Record the last successful synchronization time and any partial errors.

## Recommended rollout

### Phase 1: Foundation

- Add external-source, external-ID, source-URL, and sync metadata.
- Add exact deadline timestamps while preserving the current date-based UI.
- Add enrollment status and Zambeel class-number fields.
- Add a calendar-event or assessment model for exact exam times.
- Implement course mapping and import-preview interfaces.

### Phase 2: Calendar MVP

- Add “Connect LUMS LMS calendar.”
- Accept and securely handle the private Sakai feed URL.
- Implement manual **Sync now** and optional sync-on-app-open behavior.
- Convert appropriate events into reviewable Akada tasks.
- Reconcile updates through stable event identifiers.

### Phase 3: Rich browser integration

- Build an Akada LMS Sync browser extension.
- Add a Zambeel adapter for authoritative terms, enrollment, course meetings, exams, and available assessment records.
- Add a Sakai adapter for the confirmed course, assignment, calendar, announcement, resource, and syllabus endpoints.
- Send normalized records to Akada through a narrowly scoped authenticated endpoint.
- Add incremental synchronization and change review.
- Reconcile duplicate assessments found in both systems.

### Phase 4: Institutional integration

- Validate actual student usage and synchronization reliability.
- Prepare a security and privacy brief.
- Approach LUMS for approved PeopleSoft Integration Broker and Sakai LTI/API integrations.

## Recommended first product

The strongest initial product is:

> One-click Zambeel course and exam import, Sakai deadline import, automatic cross-system course matching, review before import, and “Start studying” directly from every imported task.

It provides immediate value, fits Akada's existing architecture, avoids storing the student's LMS password, and creates a foundation for deeper synchronization later.

## Security and privacy requirements

- Never store the student's LMS password for the calendar or browser-extension approaches.
- Treat private calendar URLs and Sakai or Zambeel session material as secrets.
- Obtain explicit consent before transferring LMS or Zambeel data into Akada.
- Request only the minimum browser-extension permissions required.
- Keep all Akada records protected by the existing per-user RLS model.
- Do not expose LMS identifiers, private links, or imported academic content through logs or analytics.
- Provide disconnect and local-data cleanup controls.
- Document which information is imported and when synchronization occurs.
- Keep the Zambeel integration strictly read-only; never automate enrollment add, drop, edit, or swap actions.
- Give grades and milestones stronger privacy treatment than ordinary task metadata.

## Assessment limitations

- The current course sites did not yet contain published assignments and mostly appeared empty.
- The existence and documentation of Sakai endpoints were confirmed, but a complete production synchronization was not performed.
- No private calendar feed was generated.
- No LMS or Zambeel credentials, cookies, session IDs, personal identifiers, or private feed URLs were recorded in this assessment.
- Grade synchronization was not validated and should not be promised without additional testing or an official LTI/API arrangement.
- Zambeel's rendered class, exam, and assessment views were inspected, but no official LUMS PeopleSoft API was discovered or tested.
- PeopleSoft form automation remains version- and configuration-sensitive.
- Institutional policy and approval requirements remain unknown.

## External technical references

- Sakai calendar implementation and Entity Broker endpoint descriptions: <https://github.com/sakaiproject/sakai/blob/master/calendar/calendar-bundles/resources/calendar.properties>
- Sakai source repository: <https://github.com/sakaiproject/sakai>
- Oracle PeopleSoft REST service management: <https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker/understanding-managing-rest-services.html>
- Oracle PeopleSoft Integration Broker overview: <https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/getting-started-with-peopletools/integration-broker.html>
- Oracle PeopleSoft inbound integration security: <https://docs.oracle.com/en/applications/peoplesoft/peopletools/8.63/integration-broker-administration/validating-security-inbound-integrations.html>

## Conclusion

Akada is strongly integratable with the LUMS academic systems. Zambeel provides authoritative enrollment, timetable, exam, and some assessment data; Sakai provides richer instructor-managed learning content and documented read interfaces. Akada's role is to reconcile those sources into a private planning and study workflow.

For a secure personal integration, start with user-reviewed calendar or schedule import and use a browser extension for richer synchronization from authenticated sessions. Avoid storing institutional credentials. Pursue PeopleSoft Integration Broker, Sakai LTI, or another official integration only when Akada has enough validated demand to justify institutional coordination.
