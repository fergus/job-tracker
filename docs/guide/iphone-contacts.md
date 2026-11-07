# People on your iPhone

Your People list can show up in the iPhone Contacts app as an account of its own, apart from Outlook and iCloud. It is read-only: changes made on the phone are not saved back.

**Who appears.** Anyone in People with an email or a phone number. Each card has their name, role, employer, email, phone, LinkedIn link (if set) and a "Job Tracker" link back to them here. Imported LinkedIn connections do not appear until you promote them, and a promoted connection with no email or phone stays off the phone until you add one.

**Setting it up.**
1. In **Settings → iPhone contacts**, choose **Create phone key** and copy the key. It opens this address book and nothing else.
2. On the iPhone: **Settings → Contacts → Accounts → Add Account → Other → Add CardDAV Account**.
3. Server: the address shown in Settings (use `https`). User name: anything. Password: the phone-only key.

Revoke the key in Settings to cut the phone off. The phone decides when to refresh, so a change made here can take a while to show up there.

**Deploying.** The address book is reached without the browser sign-in, so the proxy has to let `/carddav/` and `/.well-known/carddav` through. `docker-compose.yml` already lists them in `OAUTH2_PROXY_SKIP_AUTH_ROUTES`; after pulling, recreate the oauth2-proxy container to pick that up.
