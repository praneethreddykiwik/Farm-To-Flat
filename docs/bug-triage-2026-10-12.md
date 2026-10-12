# The 12 October bug list — what happened, what is fixed, what is yours

Twenty-two issues were reported after a day of end-to-end testing. **Nine of them are one bug.**
This document says which, why, what was changed, and what is still open.

---

## The single cause behind nine of them

The API was serving its **built-in seed catalogue** instead of your database for the whole of that
testing session.

The seed is not a smaller copy of the real catalogue. It is a different shop:

|                                      | seed                          | your database             |
| ------------------------------------ | ----------------------------- | ------------------------- |
| Communities                          | **3**                         | **8**                     |
| Products                             | 52                            | 54                        |
| Products whose image differs         | **51 of 54**                  | —                         |
| Mutton paya, Rohu Fish, Mutton Keema | **absent**                    | present, all three NONVEG |
| Spinach                              | ₹25                           | ₹57.20                    |
| Staff (procurement, fulfilment)      | **none in production**        | 3 rows                    |
| Orders                               | held in memory, never written | persisted                 |

Line that up against the report and nine entries fall out of it:

| #   | Reported                                               | Why                                                                               |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | 8 communities in admin, 3 in the app                   | the seed has exactly 3                                                            |
| 7   | different product images appeared on their own         | 51 of 54 differ in the seed                                                       |
| 8   | non-veg items in the veg section                       | the seed's categories are not yours                                               |
| 9   | non-veg section empty                                  | all three missing products are NONVEG                                             |
| 10  | cart item names in English, not Telugu                 | the app looks the name up in the catalogue; the seed does not contain the product |
| 11  | same at checkout                                       | same                                                                              |
| 17  | **two orders placed that day never appeared in admin** | persistence was off. **They were never written. They are gone.**                  |
| 19  | procurement number logs in as a customer               | in production the staff list is empty until the database loads                    |
| 22  | no staff role can sign in                              | same                                                                              |

### Why it kept happening

`boot()` called `loadAll()` **exactly once**. One refused connection disabled persistence for the
entire life of the process — and then the API quietly answered 200 out of the seed, so nothing
looked broken from outside.

On Render's free tier the instance **sleeps after about fifteen minutes and wakes by itself**.
Every wake is a fresh boot, and a cold free-tier Postgres is exactly the kind that refuses the
first connection and accepts the second. So this was not a one-off: it could recur every time the
service woke up.

### What changed

1. **The API refuses to serve a different shop.** While the database is unavailable the whole of
   `/api/v1` returns `503 SERVICE_DEGRADED`. Being visibly down is a far smaller failure than
   selling from a catalogue we do not stock and losing the orders people pay for. (`lib/degraded.js`)
2. **The instance heals itself.** Three quick attempts at boot, then a background retry with
   backoff that rehydrates and switches persistence back on the moment the database answers.
   Nobody has to notice; nobody has to redeploy.
3. **Sentry is told.** Losing the database used to be one `console.error` on a disposable host.

---

## Fixed, separately from the above

| #       | Reported                                                                                                                          | Cause and fix                                                                                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3,4,5,6 | OTP slow; Verify bounces back to "What's your number?"; asked for OTP again; sent to community selection instead of the dashboard | The session refresh retried **three times, 1.8s apart — 5.4 seconds** against a cold start that takes **fifty**. All three hit a sleeping server, and the app rendered its logged-out self while the refresh token sat safely in storage. Budget widened to ~70s with backoff.     |
| 10,11   | Telugu names lost in cart and checkout                                                                                            | The cart sent only the English `name`. The catalogue and order-tracking send all three languages; the basket did not, and the app's workaround — look the product up in the catalogue — fails for any product the loaded catalogue lacks. The cart now sends the same `names` map. |

---

## Needs a decision or an action from you

| #   | Issue                                          | What to do                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | No WhatsApp OTP; every number accepts `123456` | `ALLOW_DEV_OTP=1` was set on Render **with no allowlist**, and that takes precedence over MSG91: no WhatsApp message is ever sent, however well MSG91 is configured. The code warns about this on boot. It currently reads as **off** (`devCode.allowed: false`), so real codes should be going out — please confirm. **Anyone who guesses a staff number can sign in as that role while it is on.** |
| 20  | GST not in the order total                     | GST **is** in the total — the basket I tested showed ₹250 items + ₹25 = ₹275. What is missing is the **line explaining it**, on any app that has not taken the latest update. See below.                                                                                                                                                                                                             |
| —   | **Tax is set to 10% on items**                 | Set from the admin console on 12 Oct at 16:44 (audit trail: actor `shared-token`). Fresh produce is **nil-rated** — 0%, not 10%. Every basket since has been overcharged. Change it on the Fees & tax screen, or say the word and I will.                                                                                                                                                            |
| —   | **Render is on the free tier**                 | This is the cause of the sleeping, the cold starts, the webhook timeouts and the self-healing being needed at all. Upgrading to Starter removes the whole class. **This is the single highest-value thing you can do.**                                                                                                                                                                              |

---

## Still open, honestly

| #     | Issue                                                           | Status                                                                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12,14 | Order placed / wallet credited without the bank being debited   | Both happened while persistence was off, so neither order nor payment was real. **Needs re-testing now the API is healthy** before I can say whether a genuine bug exists underneath.                                                                                                                         |
| 15,18 | Tab counts missing on "Past delivery day" and "Cancel requests" | Not yet investigated.                                                                                                                                                                                                                                                                                         |
| 16    | What is the "Past delivery day" tab for                         | A question, not a bug — it lists orders whose delivery date has passed but which are not yet closed.                                                                                                                                                                                                          |
| 21    | Wallet toggle on by default while looking off                   | The default **is** on (`useState(true)`), so wallet balance is spent unless the customer turns it off. Whether it also renders wrong on Android needs an on-device check with a signed-in session, which I could not do — dev OTP is disabled in production and I will not send a real code to a real number. |
| 13    | Order tracking in English                                       | The tracking endpoint already sends `names`; this was most likely the seed-mode case. Re-test.                                                                                                                                                                                                                |

---

## What I could not test, and why

Signing in. `devCode.allowed` is **false** in production, so every sign-in sends a real WhatsApp
message to a real number. I tested everything reachable without a session — catalogue, search,
product pages, adding to basket, the whole admin console, and the database directly — but the
signed-in flows (checkout, wallet, order placement, staff roles) need either a test number on
`DEV_OTP_ALLOWLIST` or you driving the app while I watch the API.

**Setting `DEV_OTP_ALLOWLIST` to one or two tester numbers is the single thing that would unblock
the rest of this testing** — and unlike `ALLOW_DEV_OTP` with no allowlist, it is safe: only those
numbers accept the fixed code, everyone else still needs a real one.
