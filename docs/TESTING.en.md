# Kōv — Client Testing Guide

> **Purpose of this document**: to let you test the Kōv application yourself, end to end, with no technical knowledge required, to confirm everything works as expected before going live. Follow the sections in order — each one corresponds to a real feature of the app.
>
> **How to use it**: check each box as you go. If anything doesn't match what's described (an unexpected error message, a blank screen, a button that does nothing, a page that stays stuck), note it down with the screen name and what you did right before it — send us that list, it'll be much faster for us to fix.

---

## Before you start

- **Use a real test account**, not your final one — create an account specifically for this testing (you can delete it at the end via Profile → Delete my account).
- **Test on mobile AND on desktop** if possible — the app is designed to work on both, but some screens change layout depending on screen size.
- **Occasionally turn on "offline" mode** on your phone/browser during a test (just to see the "Offline" banner appear at the top of the screen) — that's expected and intentional, not a bug.
- Set aside about **1.5 to 2 hours** for a full, thorough pass through this whole document.

---

## 1. Sign-up and sign-in

- [ ] Go to the sign-up screen, create an account with a valid email (you need to be able to receive the confirmation email).
- [ ] Receive the confirmation email and click the link — you should land in the app, not on an error page.
- [ ] Sign out then sign back in with that same account — it should work on the first try.
- [ ] Try signing in with a wrong password — a clear error message should appear (not a blank screen or a crash).
- [ ] Test "Forgot password" — you should receive an email and be able to set a new password.
- [ ] Once signed in, try manually going back to the sign-in screen (by typing the address) — you should be automatically redirected into the app, not shown the sign-in form again.

## 2. Initial setup (onboarding)

This flow only appears once, when the account is first created.

- [ ] Choose your trade (e.g. plumbing/heating) — the rest of the flow should match this choice.
- [ ] Choose your team mode (solo / with employees).
- [ ] Fill in your business information (name, address, business registration number, VAT, legal notices) — if you leave a required field empty, a message should clearly point it out.
- [ ] Once finished, you should land on the home screen — you should never be sent back to this setup flow afterward (unless you deliberately go to Profile → Business to edit this info later).

## 3. Home screen

- [ ] The home screen should show today's actions/priorities, with no fake data (if you haven't created anything yet, it should clearly say there's nothing yet, never fake numbers).
- [ ] Click a suggested action — it should take you to the right place (not a blank screen or an error).

## 4. Clients

- [ ] Go to "Clients," create a new client with all the details (name, address, phone, email, business registration number if relevant).
- [ ] Deliberately enter a malformed email (e.g. "test@") — an error message should appear before saving.
- [ ] Open the client record you just created — check that all the details you entered are there.
- [ ] Edit a detail (e.g. phone number) and save — leave the record and come back: the change should be kept.
- [ ] **Add a document** from the client record (photo or file) — check that it appears in that client's document list afterward.
- [ ] Add an internal note on this client (free text, with or without a tag) — check that it appears in the notes list.
- [ ] If your phone/computer supports it, test voice dictation for a note — the dictated text should appear in the text field (never sent automatically, you should always be able to re-read/correct it before saving).
- [ ] Once you've created a quote/invoice/project for this client (later sections), come back to their record: the cumulative revenue, the number of projects, and the history (quotes/projects) should reflect the real data — never stay at zero or empty once you have real quotes/projects.
- [ ] Archive this client (the "Archive this client" button) — they should disappear from the main client list, but remain accessible if you search archived clients. Check that their quotes/invoices/projects still exist (nothing should be deleted).

## 5. Price library

- [ ] Go to Profile → Price library. If you chose a trade with a starter catalogue (plumbing/heating), check that a list of services/supplies is already there with realistic prices.
- [ ] Add a new item (name, unit, purchase price, sale price, VAT, supply or labor) — check that it appears in the list.
- [ ] Edit an existing item — check that the change is kept.
- [ ] Deactivate an item — it should disappear from the default list but remain viewable via "Show inactive." Reactivate it, it should go back to normal.
- [ ] Search for an item by name — the list should filter correctly.

## 6. Technical sheets

- [ ] Create a technical sheet (title + content), optionally linked to an item from your price library.
- [ ] Check that it appears in the list and that search works.

## 7. Quotes

- [ ] Create a new quote: choose a client, describe the work (also test the AI assistant if available — it should propose lines based on your price library, never invent a price).
- [ ] Add lines from your price library AND as free-text entries.
- [ ] Edit the quantity/price of a line directly in the table — check that the total and margin recalculate immediately.
- [ ] Delete a line — check that it disappears properly and that the total updates.
- [ ] Check that the VAT rate and the VAT legal notice are selectable and consistent.
- [ ] Watch the "margin" box while you edit prices — the color and message should change depending on whether the margin is good, average, or poor.
- [ ] Issue the quote (final send button) — the status should change to "Issued," and a PDF should be generated and downloadable.
- [ ] Open the generated PDF — check that all the information (client, business, lines, totals, legal notices) is correct and readable.
- [ ] Try editing an already-issued quote ("Edit this quote") — it should revert to draft, and re-issuing it should generate a NEW PDF (version 2) without overwriting the first one.
- [ ] Simulate the client accepting the quote (accept/signature button) — check that the status changes to "Accepted."
- [ ] Also test declining a quote (on a different test quote) — the status should change to "Declined."
- [ ] Go back to the quotes list — check that filtering by status (Draft/Issued/Accepted/Declined) works.

## 8. Converting to a project

- [ ] From an accepted quote, convert it into a project — check that a new project appears, correctly linked to that quote and that client.
- [ ] Open the project — check that the schedule, the real vs. planned margin, and the original quote's information are consistent.

## 9. Project follow-up

- [ ] On a project, add a progress report (text or voice dictation) with a completion percentage.
- [ ] Check "Notify client by SMS" and send — check that a confirmation message appears.
- [ ] Look at the client's "activity log" (exchange history) — this report should appear there automatically.
- [ ] Add a supply order linked to the project (see the Orders section below) and check that the project's real cost updates.
- [ ] Look at the project's profitability block — the real margin should update as you add costs/invoices, and compare against the margin planned in the quote.

## 10. Change order (extra work)

- [ ] From an ongoing project, create a change order (extra work line item(s)).
- [ ] Edit the proposed lines before sending (nothing should go out without your explicit approval).
- [ ] Send the change order — check that a new quote is properly created (quote number, matching amount) and that you can track it like a normal quote (see section 7).

## 11. Invoicing

- [ ] From an accepted quote or a project, create an invoice (deposit, progress billing, balance, or full amount) — check that the calculated amount matches the correct percentage of the quote.
- [ ] Check that the legal notice about late-payment penalties and the flat-rate collection fee appears correctly.
- [ ] Go back to "Invoicing" — the invoice should appear in the list with the correct status, and clicking it should take you to the relevant client's record (unless it's overdue: in that case you should land on the "Unpaid" screen).
- [ ] Filter invoices by status (Draft/Sent/Paid/Overdue/Cancelled) — check that filtering is correct.

## 12. Unpaid invoices and reminders

- [ ] On the "Unpaid" screen, check that overdue invoices appear with the correct reminder level (courteous / firm / formal notice) depending on how many days overdue.
- [ ] Send a reminder — read the pre-filled message carefully (matched to the overdue level), edit it if needed, then confirm sending (an explicit confirmation step should appear before it's actually sent).
- [ ] Check that this reminder then appears in the client's activity log.

## 13. Supply orders

- [ ] From a quote/project, open "Order" — select the supplies to order.
- [ ] Check that the stock status (available / in transit / out of stock) and lead time are shown for each item.
- [ ] Confirm the order — check that the corresponding cost is properly added to the relevant project.

## 14. Planning

- [ ] Go to "Planning" — check that your ongoing projects appear on the correct dates.
- [ ] If you have several projects/employees overlapping, check that a scheduling conflict warning appears.

## 15. Messages (global activity log)

- [ ] Go to "Messages" — you should see one thread per client, sorted by most recent exchange.
- [ ] Test the filters (All / Received / No reply) — check that they filter correctly.
- [ ] Click a thread — you should land on the corresponding client's record.

## 16. Kōv Assistant (AI agent)

- [ ] Open the Kōv Assistant, type a simple request (e.g. "send a reminder to [name of a test client]").
- [ ] Check that the assistant understands the intent and presents you with an action plan to approve — **nothing should be sent automatically**, there should always be an explicit "Confirm" step.
- [ ] Before confirming, try removing a step from the plan and re-reading/editing a proposed message — check that it works.
- [ ] Confirm the plan — check that each action executes (you should see step-by-step visual feedback), and that the result appears in the relevant client's activity log.
- [ ] If your request is ambiguous (e.g. an approximate client name), the assistant should ask you to clarify rather than guess.
- [ ] Also test voice dictation in the assistant if your device supports it.

## 17. Team (if you work with employees)

- [ ] Go to Profile → Business → Manage team.
- [ ] Add an employee (name, role).
- [ ] Deactivate then reactivate them — check that it works without error.

## 18. Financing

- [ ] Go to Profile → Financing — check that the "indicative simulation only, not a real offer" message is clearly visible and impossible to miss.
- [ ] Create a simulation for a client (amount, term, partner) — check that the calculated monthly payment is consistent.
- [ ] Send the simulation to the client — check that it appears in the simulation history and in the client's activity log.

## 19. Satisfaction / client follow-up

- [ ] Schedule a satisfaction follow-up reminder from a client's record (if this option is accessible from the client record).
- [ ] Go to Profile → Satisfaction — the client with a scheduled reminder should appear.
- [ ] Click "Mark as sent" — the client should disappear from this list, and the action should appear in their activity log.

## 20. Accounting export

- [ ] Go to Profile → Accounting export — check that the current quarter's figures (revenue, VAT, number of invoices/records) match what you've actually created.
- [ ] Generate an FEC-format export — check that a file downloads.
- [ ] Generate a PDF + Excel/CSV export — check that both files download and that the amounts match.
- [ ] If you have no supporting document attached to an expense, check that a warning appears about it.

## 21. Import my data (migration)

- [ ] Choose your previous software from the list — check that export instructions are displayed.
- [ ] Prepare a small test CSV file (2-3 clients with name/city/phone/email) and import it.
- [ ] Check the preview and column matching before confirming.
- [ ] Confirm the import — check that the number of imported rows is correct and that the new clients appear in your client list.
- [ ] Repeat the test with a deliberately incomplete CSV file (a row with no name, for example) — check that it's properly skipped and flagged, not crashed.

## 22. Profile and account

- [ ] Go to "Profile" — check that all the links (Business, Price library, Technical sheets, Accounting export, Import my data, Financing, Satisfaction) work.
- [ ] Edit your business information — check that it's correctly picked up on a new quote/invoice after the change.
- [ ] Sign out from this screen — check that you're properly redirected to the sign-in screen.

## 23. General situations to test everywhere

These aren't tied to a single screen — test them in a few different places (for example on Clients, Quotes, and Invoices):

- [ ] **While loading**: you should see a clear loading animation (never a frozen blank screen).
- [ ] **Empty list**: a screen with no data at all should clearly say "nothing yet," possibly with a button to create the first item — never a list that looks broken.
- [ ] **Network error**: if possible, cut your internet connection for a few seconds during a load — an error message with a "Retry" button should appear, never a silent crash.
- [ ] **Offline**: cut your connection completely — an "Offline" banner should appear at the top of the screen, and send/save buttons should become disabled (but you should still be able to navigate/read).
- [ ] **Slow connection**: if you're on a very slow connection (3G, or deliberately throttled), a "Still working..." message should appear if an action takes more than a few seconds.
- [ ] **AI assistant temporarily unavailable**: if any AI-powered screen (quotes, Kōv Assistant) returns an error, you should still be able to keep working manually (the AI is never a blocker).

## 24. Mobile-specific testing

- [ ] On your phone, check that nothing overflows the screen horizontally (no sideways scroll).
- [ ] Check that all buttons are large enough to tap easily, even with gloves on if you're on a job site.
- [ ] Check that the floating "+" button (new quote) at the bottom of the screen works properly.

## 25. Account deletion (do this last, only on your test account)

- [ ] Go to Profile → Delete my account.
- [ ] Check that a clear warning message (irreversible) appears before confirmation.
- [ ] Confirm the deletion — check that you're signed out and redirected to the sign-in screen, and that you can no longer sign back in with that account.

---

## How to report a problem to us

For each problem you find, please give us if possible:
1. **The screen involved** (e.g. "Client record," "Quote - Lines step").
2. **What you did** right before it (e.g. "I clicked Archive this client").
3. **What happened** vs. **what you expected to happen**.
4. **A screenshot** if possible.

Thank you for testing this — it's what lets us deliver a genuinely reliable application before the final launch.
