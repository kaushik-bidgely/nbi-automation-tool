# User Guide

This guide explains what the NBI Automation Tool does and how to use it — for anyone using the app itself, not developing it. If you're setting up a local dev environment or deploying it, see [`README.md`](README.md) instead.

## Contents

1. [What this tool is for](#1-what-this-tool-is-for)
2. [Core concepts](#2-core-concepts)
3. [Roles and what each can do](#3-roles-and-what-each-can-do)
4. [Getting around the app](#4-getting-around-the-app)
5. [Working with Actions and Insights](#5-working-with-actions-and-insights)
6. [Working with Interactions](#6-working-with-interactions)
7. [Creating and managing pilots](#7-creating-and-managing-pilots)
8. [Uploading sheets](#8-uploading-sheets)
9. [Downloading sheets](#9-downloading-sheets)
10. [Schema Reference page](#10-schema-reference-page)
11. [Audit Log](#11-audit-log)
12. [Managing users](#12-managing-users)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What this tool is for

Bidgely runs behavioral-energy-efficiency programs for utilities, delivered as "Actions" (recommendations, e.g. "run your dishwasher at night") and "Insights" (personalized observations about a customer's usage, e.g. "your bill was 20% higher than similar homes"). Each utility program ("pilot") gets its own catalog of Actions and Insights, and PE's delivery pipeline needs a third thing — "Interactions" — which pair a specific Action with a specific Insight according to a fixed rule set (matching appliance, fuel type, and a handful of other tags).

Before this tool existed, all of this was managed in a single, sprawling Excel workbook per pilot — hard to review, easy to break, no audit trail, no access control. This tool replaces that spreadsheet with a real app: structured fields instead of free-form cells, role-based edit permissions, a review/publish workflow, and a full history of who changed what.

## 2. Core concepts

- **Pilot** — one utility program. Each pilot has its own independent set of Actions, Insights, and Interactions; the same underlying Action can exist (with different content) across multiple pilots.
- **Action** — a recommendation shown to a customer (e.g. an email or paper-mail nudge). Has an ID, a description, subject lines, a short description and title (shown in emails/app), tags describing when/who it applies to, and more.
- **Insight** — a personalized data point shown to a customer, similarly tagged.
- **Interaction** — a pairing of one Action with one Insight, used by PE's delivery pipeline. You don't write these by hand field-by-field — they're generated (see [§6](#6-working-with-interactions)) — but you can review, tweak, and manage their lifecycle like any other content.
- **Content lifecycle** — every Action, Insight, and Interaction moves through the same four statuses:

  ```
  Draft → Ready for QA → Published → Modified → Ready for QA → Published → ...
  ```

  - **Draft** — being worked on, not yet reviewed.
  - **Ready for QA** — submitted for review. Editing it again reverts it to Draft (an edit invalidates whatever review already happened).
  - **Published** — locked. To change a Published item, you must explicitly **Unlock** it first (see below).
  - **Modified** — was Published, has since been unlocked and is being edited again; submit it back to Ready for QA when done.

## 3. Roles and what each can do

| | **Admin** | **TPM / CSM** | **Utility** |
|---|---|---|---|
| View Actions/Insights | ✅ all pilots | ✅ all pilots | ✅ only pilots they're scoped to |
| Edit Actions/Insights content fields | ✅ all fields | ✅ all fields | ✅ **9 specific fields only** (see below) |
| Move Draft/Modified → Ready for QA | ✅ | ✅ | ✅ |
| Publish (Ready for QA → Published) | ✅ | ❌ | ❌ |
| Unlock a Published item | ✅ | ✅ | ❌ |
| Open the full per-item editor page | ✅ | ✅ | ❌ (condensed table only) |
| View/manage Interactions | ✅ | ❌ | ❌ |
| Create/upload pilots | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View Audit Log / Schema Reference | ✅ | ❌ | ❌ |

**Utility accounts** are external-facing and scoped two ways: which **pilots** they can see (`allowed_pilot_ids`), and which **content type** (`actions`, `insights`, or `both`) and **channel** (`email`, `paper`, or `both`) they're limited to. Within that scope, a utility account can edit exactly these 9 fields — the same ones shown as editable columns in the condensed table, nothing from the full editor:

- **Actions:** description, subject line (email), footer disclaimer, short description, title
- **Insights:** subject line, insight text, insight semantic, paper text

Everything else a utility account can see (images, CTA text/links, appliance) is view-only — there's no route to the full editor where those live.

## 4. Getting around the app

The top nav (visible items depend on your role and, for Actions/Insights/Interactions, on whether the currently-selected pilot has any content of that type yet):

- **Dashboard** — a quick per-pilot snapshot: how many Actions/Insights exist, their status breakdown, and how many are merged into an Interaction.
- **Actions / Insights** — the condensed, editable table for the selected pilot.
- **Interactions** (admin-only) — the pairing table, bulk-merge tools, and per-interaction detail view.
- **Audit Log** (admin-only) — a chronological feed of every field change, status transition, and (for Interactions) create/delete, across all entities.
- **Users** (admin-only) — create, edit, and delete accounts.
- **Pilots** (admin-only) — create new pilots, and upload sheets onto existing ones.
- **Schema** (admin-only) — a read-only reference for every field's category, type, channel, and accepted values.

The **pilot selector** at the top-left switches which pilot's content the rest of the app is showing.

## 5. Working with Actions and Insights

Both pages work the same way: a table where each row is one Action or Insight.

- **Editing:** click into any cell that shows as editable (this depends on your role — see §3) and type. A row's **Save** icon becomes active once you've changed something.
- **Character limits:** three fields have a hard limit sourced from the original master spreadsheet — Action `short_desc` (110 chars), Action `title` (55 chars), Insight `insight_semantic` (135 chars). If a dirty field is over its limit, **Save is disabled** (with a tooltip explaining why) until you fix it.
- **Status column:** a dropdown right in the table. Selecting "Ready for QA" submits that row for review — the same action as the bulk button below.
- **Bulk actions:** check rows via the checkboxes, then use "Move to Ready for QA" (any editor role) or "Publish Selected" (admin-only) at the top of the table.
- **Published items are locked** — you'll see an "Unlock" action instead of inline editing. Unlocking moves the item to Modified so it can be edited again, then re-submitted through the normal lifecycle.
- **"Open full editor"** (the icon next to the ID, admin/TPM-CSM only) opens a dedicated page with every field the condensed table doesn't show — images, CTAs, tag/targeting fields, etc.
- **"merged" chip** (admin only) — shows whether this Action/Insight currently has at least one Interaction pairing. This is informational only and independent of publish status — an item can be Draft and merged, or Published and unmerged.

## 6. Working with Interactions

Interactions pair one Action with one Insight, following the same rules PE's own delivery-config script uses (appliance/fuel-type match, plus a handful of tag-compatibility rules). There are two ways to create them:

- **Manual merge** — pick one Action and one Insight from the dropdowns and merge them yourself. Useful for one-off pairings or fixing a gap.
- **"Merge All" (bulk merge)** — runs the full rule engine over every Action and Insight currently in the pilot and creates an Interaction for every valid pair that doesn't already exist. This can create hundreds or thousands of rows at once (that's expected — PE's real config sets run into the thousands per pilot) and creates them immediately, with no preview step. It also automatically creates "seasonal variant" pairings for certain AC/heating actions (a second Interaction tagged Summer or Winter).

Each Interaction has its own:
- **Status** — the same four-stage lifecycle as Actions/Insights (Draft → Ready for QA → Published → Modified), managed independently of the underlying Action/Insight's own status.
- **Three overrides** — `insight_semantic`, `insight_text`, and `action` text can each be tweaked per-pairing without touching the shared Action/Insight record (useful when the same Action needs slightly different wording depending on which Insight it's paired with). Leaving one unset means it just tracks whatever the live Action/Insight currently says.
- **A detail view** — click the NBI ID (the blue link in the first column) to see every other computed field for that pairing (tags, filters, family/type, fuel/appliance, min/max thresholds) without leaving the page.

**Un-merging** (the delete/unmerge action) removes the Interaction but never touches the underlying Action or Insight's own status — they can be re-merged into a different pairing at any time.

## 7. Creating and managing pilots

From the **Pilots** page (admin-only), **Create Pilot** gives you two ways to populate a new pilot:

- **Clone from Master Catalog** — copies the entire master content set (every Action/Insight Bidgely maintains) into the new pilot as a starting point.
- **Upload pilot-specific files** — upload your own Actions (.xlsx), Insights (.xlsx), and optionally an Interactions (.csv) file, populating only what you provide.

If one of several files fails partway through (e.g. a good Actions file but a malformed Insights file), the pilot is **not** thrown away — whatever succeeded is kept, and the error tells you exactly which file to re-upload. Do that from the same Pilots page's per-pilot "Upload Actions/Insights/Interactions" buttons, which work on any existing pilot at any time (not just at creation).

## 8. Uploading sheets

**Actions and Insights** are `.xlsx` workbooks matching the master template's column layout. The workbook's internal tab needs to be named exactly `"Actions"`/`"Insights"` — **unless the workbook only has one sheet**, in which case that sheet is used regardless of its name (there's nothing else it could be). If a multi-tab workbook has no sheet named correctly, you'll get a clear error listing the sheet names found — rename the right one and re-upload.

**Interactions** are a `.csv` in the same 20-column format the app's own Interaction export produces — this is meant for round-tripping data the app already exported, or for a pilot-specific interactions set prepared by PE, not for hand-authoring from scratch.

Re-uploading any of these onto an existing pilot **updates rows in place** by their ID (never duplicates) and **skips anything already Published** (unlock it first if it genuinely needs to change). If a row you're updating was sitting at "Ready for QA," the re-upload reverts it to Draft — the same "an edit invalidates prior review" rule that applies everywhere else.

## 9. Downloading sheets

Every list page (Actions, Insights, Interactions) has a **Download Sheet** button (admin-only) that lets you pick which statuses to include (Draft / Ready for QA / Published / Modified — defaults to the latter three) and produces a CSV in the original master-template column layout. This is separate from **Publish**, which always produces a CSV of just what it published, as a record of that specific publish action.

## 10. Schema Reference page

A read-only, always-up-to-date reference (admin-only) listing every field on Actions, Insights, and Interactions: its category (content / image / internal / generated), which channel it applies to, its type, accepted values, and a plain-English description. Useful for looking up "what does this tag mean" or "what's the accepted vocabulary for this field" without digging through code. It also flags any field that exists in the data model but isn't actually shown anywhere in the app's UI yet.

## 11. Audit Log

A chronological record (admin-only) of every field edit and status change across Actions, Insights, and Interactions — who changed it, from what value to what value, and when. Filterable by entity type. This is the tool's substitute for "track changes" in the old spreadsheet workflow.

## 12. Managing users

From the **Users** page (admin-only), create or edit accounts:

- **Role** — `admin`, `tpm_csm`, or `utility` (see §3 for what each can do).
- For **utility** accounts specifically: which pilots they're allowed to see, which content type (Actions / Insights / both), and which channel (email / paper / both) they're limited to.
- **Password reset** — admin-driven only; there's currently no self-service "change my own password" flow, so a user who wants to change their password needs to ask an admin to reset it for them (8-character minimum).

Deleting a user or changing their password immediately invalidates any of their existing login sessions.

## 13. Troubleshooting

- **"Couldn't read this as an Actions/Insights sheet" / a 422 error on upload** — the file's internal sheet name doesn't match (and the workbook has more than one sheet, so the app can't guess which one you mean), or the column layout doesn't match the master template. The error message names the sheets it actually found — rename the correct one to `"Actions"`/`"Insights"` and try again.
- **Save button greyed out** — usually a character-limit violation on a dirty field (hover the Save button for which one and by how much).
- **Can't edit a row** — either it's Published (unlock it first) or the field simply isn't editable for your role — check §3.
- **A pilot's Actions/Insights/Interactions tab is missing from the nav** — for TPM/CSM and Utility roles, a tab only shows once that pilot has at least one item of that type (Admins always see all three regardless).
- **An upload's error still shows an old failure after you fixed the file** — make sure you're re-selecting the corrected file (the file input doesn't remember a previous bad selection), and that the backend picked up any recent code change (`--reload` should handle this automatically in local dev).
