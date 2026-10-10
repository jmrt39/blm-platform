# Nightly POS import

Each store has one POS connection. Whatever the POS sends overnight is read into the shift report's own CSV and staged. In the morning (or at close) the manager opens Shift report, loads the staged figures, reviews them and signs. Nothing is published into ratings without a signed report.

Setup lives at `/pos` (owner, area director over the store, or the store's GM).

## How the figures get in

| Method | Key | Who it suits |
| --- | --- | --- |
| Toast nightly export | `toast_sftp` | Toast stores. We collect the export over SFTP. |
| Nightly report email | `email` | Square, Clover, SpotOn, Aloha, Lightspeed, anything that can schedule an emailed report. |
| Posted file | `upload` | A script, Zapier or a relay posts the CSV to the store's upload link. |
| At close | `manual` | Typed in or uploaded by the manager on Shift report. |

Every connection gets a private key (`inboundKey`). It forms both:

- the store address `pos-{key}@in.bottomlinemultiplied.com`
- the upload link `{origin}/api/pos/upload/{key}`

"New address" on `/pos` rotates the key; the old address and link stop working at once.

## Toast (SFTP)

Toast writes a full data export for each location every night after closeout to
`{export_id}/{YYYYMMDD}/`. Files are kept 7 days.

Restaurant side (Toast Web):

1. Reports > Settings > SSH Keys: add the BLM public key shown on `/pos` (up to 10 keys per restaurant).
2. Copy the SFTP username and the Server URL shown there.
3. Reports > Settings > Data Exports > "view restaurant # mapping" gives the export ID for each location.
4. Paste the SFTP username and export ID into `/pos` for that store, then press Test.

Server side env (root `.env`):

```
TOAST_SFTP_HOST=s-9b0f88558b264dfda.server.transfer.us-east-1.amazonaws.com
TOAST_SFTP_PRIVATE_KEY=<base64 of the PEM private key>
TOAST_SFTP_PUBLIC_KEY="ssh-rsa ..."
```

We read `OrderDetails.csv` and `ItemSelectionDetails.csv`:

- OrderDetails: Server, Service, # of Guests, Checks, Amount (net, before tax and tip), Voided. Voided orders are skipped. "Last, First" names are flipped. Service splits lunch and dinner.
- ItemSelectionDetails: Server, Service, Menu Group, Sales Category, Net Price, Qty, Void?. Wine bottles and desserts are counted from here.
- Orders without a server give a warning, not a failure.

## Email (Resend Inbound)

1. Add an MX record for `in.bottomlinemultiplied.com` pointing at Resend inbound.
2. In Resend, add a webhook for `email.received` pointing at `{origin}/api/pos/inbound`.
3. Put the webhook signing secret in `RESEND_WEBHOOK_SECRET` (root `.env`). `RESEND_API_KEY` must also be set.

The webhook carries metadata only. We verify the Svix signature, find the store by the `pos-{key}` recipient, list attachments with `GET https://api.resend.com/emails/receiving/{email_id}/attachments`, and fetch each `download_url` (valid for 1 hour). CSV attachments are parsed; anything else is ignored.

`POS_INBOUND_DOMAIN` overrides the domain (default `in.bottomlinemultiplied.com`).

## Upload link

```
curl -X POST --data-binary @report.csv "https://platform.bottomlinemultiplied.com/api/pos/upload/{key}?date=2026-10-12"
```

Raw CSV body or multipart (one or more files). `date` is optional; without it the date in the file is used, and failing that the store's previous night before 3 pm local time, or tonight after 3 pm. 20 MB cap. Returns 422 with the reason when the file can't be read.

## What the parser accepts

`shared/pos.ts` `readPosFiles` takes a Toast export pair, or any per person sheet with a name column and net sales (checks and covers if present). Comma, semicolon and tab delimiters are sniffed. Total and summary rows are skipped. Output is the shift report CSV:

```
name,role,shift,type,net_sales,covers,checks,wine_bottles,desserts
```

## The nightly run

`runPosNightly` runs from the server timer every 30 minutes and from `/api/cron/nightly`:

- After each store's pull time (local), it works on the previous business date.
- It skips the night if an ok import or a signed shift report already exists.
- Toast is pulled at most once every 55 minutes after a failure.
- Three hours after the pull time, a night with nothing is marked `missing` and the owner and GMs get an email linking to `/pos`.

External cron (recommended once published): call `/api/cron/nightly` hourly with `Authorization: Bearer $CRON_SECRET`.

## Other systems

| System | Today | Next |
| --- | --- | --- |
| Square | Schedule "Sales by Team Member" to email the store address, or upload | OAuth API connection |
| Clover | Email the Employee Sales report, or upload | OAuth API connection |
| SpotOn | Email the server sales report | Restaurant POS Export API (per location key via partner program, pending approval) |
| Aloha (NCR Voyix) | Reseller schedules the end of day server sales email | Unconfirmed |
| Lightspeed | Email the Staff Report | K Series REST API |
| Kronos | Labor only, not used for sales | Not built |

## Tables

- `pos_connections`: one per store; system, method, pull time, settings (Toast SFTP username, export ID), inbound key, status, last import, last error.
- `pos_imports`: one row per attempt; business date, source, status (`ok`, `failed`, `missing`), rows, net sales, message, and `payload` (the staged CSV the manager loads).
