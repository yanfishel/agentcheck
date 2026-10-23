---
title: "Privacy Policy"
url: "https://agentcheck.dev/privacy"
description: "What AgentCheck collects, why, and how long it keeps it."
---

# Privacy Policy

Last updated 20 October 2026

AgentCheck is operated by Yan Fishel \(fishart\). This policy explains what the hosted service on this website collects and why. We keep it short and specific, and because the code is [open source](https://github.com/yanfishel/agentcheck), you can check every point below against what the service actually does.

## Who this covers

This policy covers the AgentCheck service on this website only. The AgentCheck code is published under the MIT licence, and anyone can run their own copy; a copy run by someone else is that person's service, and their own privacy terms apply to it.

## What we collect

- **Your account, if you create one.** Sign-in is handled by Clerk. We store your account id, your email address, your role and whether the account is active. Passwords and sign-in tokens stay with Clerk; we never see them.
- **The checks you run.** The address you submit, the address it redirected to, the mode \(quick or full\), the result, the score and the times it was queued, started and finished. For signed-in users the check is linked to the account so it shows in History.
- **A screenshot, for full checks.** For a full check, a screenshot of the first screen of the checked page, as our browser saw it.
- **A site icon.** The site's icon \(favicon\), as its server provides it.
- **Fix files, if you generate them.** For a check linked to your account you can generate ready-made files \(robots.txt, llms.txt and page tags\). They are built from the public pages of the checked site and stored with the check.
- **A hash of your network address.** We do not store your IP address. To enforce rate limits we keep a keyed hash of it \(for IPv6, of its /64 network\), which cannot be turned back into the address without a secret key that never leaves our servers.
- **Cookies and browser storage.** Clerk sets the cookies needed to keep you signed in. Your light or dark theme choice is kept in your browser's local storage. We use no analytics, advertising or tracking cookies.

A check reads the public pages of the website you name, such as its robots.txt, llms.txt and page markup. The report keeps what the checks found there; it does not keep whole pages.

## How we use it

Only to run the service: to perform the checks, show your reports and history, keep usage within fair limits and stop abuse. We do not sell data, show ads or use your data to train AI models.

## Who else handles it

- **Clerk** provides sign-in and holds your account credentials.
- **Our hosting and database provider** runs the service and stores the data described above.
- **The websites you check** receive requests from our checker, which identifies itself with an AgentCheck user agent. They learn nothing about you from it.

If you share a report, anyone with the share link can open it and its badge until you stop sharing.

## How long we keep it

- Checks run without an account are deleted automatically after 30 days.
- Checks linked to an account are kept until the account is deleted. When you delete your account \(in Manage account\), we delete your user record and all your checks automatically. Screenshots and site icons are kept and deleted together with their audit, and so are fix files.
- The network address hash is stored with the check and goes when the check does.
- Backups of the server are kept for up to 4 weeks, so deleted data can remain in a backup for that long before it is overwritten. Backups are never used to restore data you deleted, except to recover the whole service after a failure.

## Your rights

Depending on where you live, including under Israel's Protection of Privacy Law and the GDPR, you may ask us to show, correct or delete your data. Write to yan.fishel@gmail.com. You can delete your account yourself at any time, or ask us to, and we do it within 30 days.

## Security

The service runs over HTTPS, stores network addresses only as keyed hashes and refuses to check private or internal network addresses. Because the code is public, anyone can review how this is done.

## Children

AgentCheck is a tool for website owners and is not meant for children under 16.

## Changes

If this policy changes, we update it here and change the date at the top.

## Contact

Questions or requests: yan.fishel@gmail.com.
