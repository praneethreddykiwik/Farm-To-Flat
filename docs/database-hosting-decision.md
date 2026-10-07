# Supabase or AWS — the honest numbers

Written 7 October 2026, because the first Supabase invoice came to ~$59 against an advertised
$25 and the question was raised whether to move the database to AWS.

**Recommendation: do not migrate yet.** Not because Supabase is better in principle, but because
the bill has not been diagnosed, and at least one known bug in our own code inflates it. Migrating
now would carry that bug to a provider whose bandwidth is _more_ expensive per gigabyte.

---

## 1. The bug that is probably costing the money

The phone app loads every product photo at **full resolution, directly from Supabase**.

- `apps/customer/src/lib/supabase.js:34` builds `/storage/v1/object/public/...` — the raw original,
  with no width and no quality parameter.
- `apps/api/src/routes/admin/products.js:143` accepts uploads up to **5 MB** and stores them exactly
  as received. There is no `sharp` or any other resizer in the API's dependencies.

So a customer opening the catalog downloads multi-megabyte photographs to paint them into small
tiles. Every customer, every cold cache.

The API already does this correctly elsewhere: `apps/api/src/lib/storage.js:139` serves complaint
photos through Supabase's transform endpoint with `?width=&quality=70`. Product images simply never
got the same treatment. The fix is to point `storagePublicUrl` at
`/storage/v1/render/image/public/...?width=N&quality=70` — the same endpoint, already proven in this
codebase.

Rough order of magnitude: a 2 MB original rendered into a ~200px tile needs about 25 KB. That is
roughly **80× more bandwidth than required**, on the single most-viewed asset in the product.

**Moving to AWS does not fix this.** S3 egress from Mumbai is **$0.1093/GB** against Supabase's
**$0.09/GB** — we would ship the same oversized bytes and pay _more_ for them.

---

## 2. What the $59 actually is

It cannot be derived from the published rates, so it has to be read off the invoice. Two things to
know before looking:

**Compute is billed separately from the $25.** Pro is $25/month for the organisation plus an hourly
compute charge per project, offset by a **$10/month compute credit** that covers exactly one Micro
instance.

| Instance | Per month | Net of the $10 credit      |
| -------- | --------- | -------------------------- |
| Micro    | $10       | $0 — so the bill stays $25 |
| Small    | $15       | $5 → $30 total             |
| Medium   | $60       | $50 → $75 total            |

A second project pays its own compute, and the credit only applies once per organisation.

**Pro's Spend Cap is ON by default.** With it on, exceeding an included quota _throttles_ rather than
bills. That matters for the diagnosis: if the Spend Cap is still on, the $59 is **not** egress
overage — it is a fixed charge like compute, an add-on, or first-month proration. A first invoice
very often combines a pro-rated remainder of the month the plan was upgraded with the next full
month, which lands at an odd number exactly like this one.

**Where to look:** Supabase Dashboard → Organisation → Billing → the current invoice, then
Usage. The line items are named: Compute Hours, Disk Size, Disk IOPS, Disk Throughput, Egress, IPv4,
Point-in-Time Recovery, Read Replicas, Branching, Storage Size, Storage Image Transformations,
Monthly Active Users, Realtime, Edge Function Invocations, Custom Domains, Log Drains.

Whichever line is large is the answer. Guessing is not necessary — it is itemised.

---

## 3. The $599 fear is unfounded

Pro does **not** graduate into Team. Team at $599/month is sold on _features_ — SOC 2 and ISO
reports, dashboard SSO, longer backup and log retention, granular roles, an SLA. It is not a usage
ceiling, and no published policy forces a Pro organisation onto it for growth.

Pro keeps billing overages at published per-unit rates for as long as you stay on it. There is no
cliff to brace for.

---

## 4. Like-for-like cost, at our scale

What Supabase Pro bundles today: Postgres, connection pooling (pgBouncer), file storage, on-the-fly
image transforms, authentication, automated backups, a SQL editor and dashboard, and logs.

Assembling the same thing on AWS in Mumbai (`ap-south-1`):

| Piece                             | AWS                                          | Per month                       |
| --------------------------------- | -------------------------------------------- | ------------------------------- |
| Postgres, single-AZ               | RDS `db.t4g.micro`                           | $15.33                          |
| …or with failover                 | `db.t4g.micro` Multi-AZ                      | $30.66                          |
| Storage, 8 GB                     | RDS gp3 @ $0.131/GB                          | ~$1.05                          |
| Connection pooling                | RDS Proxy                                    | extra, ~$11+                    |
| Private-subnet egress             | **NAT Gateway**                              | **$40.88** before a single byte |
| File storage                      | S3 @ $0.025/GB-mo                            | pennies at our size             |
| Bandwidth                         | S3 egress @ $0.1093/GB                       | **more than Supabase's $0.09**  |
| Image transforms                  | CloudFront + Lambda@Edge, or imgproxy on EC2 | build and run it yourself       |
| Auth, dashboard, backups UI, logs | not included                                 | build or buy                    |

A deliberately minimal single-AZ setup lands near **$16–20/month** — cheaper than $25, but with no
failover, no pooler, no transforms, no dashboard, and every operational task now ours.

A realistic production setup — Multi-AZ, a pooler, a NAT gateway — is **$85+/month** before
bandwidth, against $25.

The NAT Gateway line deserves attention: $40.88/month, per gateway, per availability zone, charged
at zero traffic. It is the single most common surprise on a first AWS bill, and on its own it
exceeds the entire Supabase Pro plan.

**At our scale, AWS is not cheaper.** It becomes cheaper later, with reserved instances or savings
plans, at volumes where per-unit rates matter, and when there is someone whose job is to run it.

---

## 5. We are not locked in, which is why waiting is free

This is the part that makes the decision low-stakes:

- **The database is plain Postgres.** We use Prisma, with no Supabase-specific SQL, no RLS-dependent
  client queries, no Supabase Auth — our auth is OTP and Google, in our own API. Moving the database
  is `pg_dump`, `pg_restore`, and a new `DATABASE_URL`.
- **Storage is already abstracted.** `apps/api/src/lib/storage.js:16` reads `STORAGE_DRIVER`, and
  `STORAGE_DRIVER=s3` is implemented, with SigV4 signing verified against AWS's own published test
  vector and a migration script at `scripts/migrate-storage.mjs`.

The exit door is built and tested. It will be no harder to walk through in six months than today.
That is precisely why there is no reason to walk through it while the bill is still undiagnosed.

---

## 6. What to do, in order

1. **Read the invoice.** Dashboard → Billing → Usage. Find the large line item. One minute.
2. **Fix the product images** — point `storagePublicUrl` at the transform endpoint. An hour or two,
   and it reduces bandwidth on the most-requested asset in the product by roughly 80×. Worth doing
   regardless of hosting, because it is also the single biggest speed win for customers on mobile
   data.
3. **Check the compute instance.** If the project is on Small or larger without needing it, drop to
   Micro and the $10 credit absorbs it entirely.
4. **Confirm the Spend Cap is on**, so an accident cannot produce a surprise bill.
5. **Watch one full billing cycle** against a fixed bug and a known instance size.
6. **Then decide**, against a real number rather than a worry.

If after that the bill is genuinely high and growing, the move is reasonable and the groundwork is
already laid. Storage can move to S3 on its own without touching the database — the driver switch
exists for exactly that.

---

## Sources

- [Supabase Pricing](https://supabase.com/pricing) · [Manage your usage](https://supabase.com/docs/guides/platform/manage-your-usage) · [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk)
- AWS Price List API, `ap-south-1`, version 20261006 — RDS, S3, EC2, Data Transfer
- [AWS VPC pricing](https://aws.amazon.com/vpc/pricing/)

The Spend Cap default and the Pro-vs-Team behaviour are corroborated by the pricing page's own note
that spend caps are on by default on Pro, plus third-party write-ups; a dedicated Supabase docs page
on Spend Cap mechanics could not be reached, so treat the throttling detail as strongly indicated
rather than confirmed first-hand.
