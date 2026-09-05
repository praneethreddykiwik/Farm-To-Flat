# Farm-to-Flat — API contract (mobile view)

**Status:** DRAFT written by Vivek (mobile) from TDD §04, to be frozen with Tharun and Adnan at end of Day 2.
**Base path:** `/api/v1` · JSON only · `Authorization: Bearer <access>` · money = integer paise serialised as **strings**.

The customer app is built against exactly this shape and runs against an in-app mock of it
(`apps/customer/src/api/mock/server.js`). Anything that changes here must change in the mock the same day,
so the app never diverges from the real API.

## Conventions the app relies on

| Convention | App behaviour |
|---|---|
| `X-Request-Id` on every request | Generated client-side (`req_<ts>_<rand>`), logged end to end |
| `Idempotency-Key` on every mutating request | Generated per attempt. `POST /orders` reuses the same key on retry until the order succeeds |
| Errors: `{ "error": { "code", "message", "details"? } }` | `code` drives branching (see table below); `message` is shown to the customer verbatim |
| 401 on an expired access token | App calls `POST /auth/refresh` once, retries, then signs out on failure |
| Cursor pagination `?limit=20&cursor=` | Only `/orders` and `/wallet` ledger in P1 |

## Endpoints

### Auth
| Method | Path | Body → Response |
|---|---|---|
| POST | `/auth/otp/request` | `{ mobile }` → `{ ok, expiresInSeconds }` (mock adds `devOtp`) · 429 `OTP_RATE_LIMITED` |
| POST | `/auth/otp/verify` | `{ mobile, otp }` → `{ accessToken, refreshToken, customer }` · 401 `OTP_INVALID` · 423 `OTP_LOCKED` |
| POST | `/auth/refresh` | `{ refreshToken }` → `{ accessToken, refreshToken, customer }` (rotation) |
| POST | `/auth/logout` | `{}` → `{ ok }` (revokes jti) |

`customer` = `{ id, mobile, name, hasAddress, isNew? }`

### Profile & address
| Method | Path | Body → Response |
|---|---|---|
| GET | `/me` | → `{ customer, walletBalancePaise, defaultAddress, cartCount }` |
| PATCH | `/me` | `{ name }` → `{ customer }` |
| GET | `/communities` | → `{ communities: [{ id, name, area, blocks: string[], deliveryDays: number[] }] }` (public) |
| GET | `/addresses` | → `{ addresses: Address[] }` |
| POST | `/addresses` | `{ communityId?, block, flat, floor?, landmark?, recipientName, contactNumber?, lat?, lng?, isDefault? }` → 201 `{ address }` · 422 `ADDRESS_NOT_SERVICEABLE` |
| POST | `/addresses/:id/default` | → `{ addresses }` |

`Address` = `{ id, communityId, communityName, area, block, flat, floor, landmark, recipientName, contactNumber, isDefault }`

### Catalog (public)
| Method | Path | Response |
|---|---|---|
| GET | `/catalog` | `{ categories: [{ id, name, tint, order }], products: Product[], generatedAt }` |
| GET | `/catalog/search?q=` | `{ products: Product[] }` alias-aware, trigram tolerant |
| GET | `/catalog/:id` | `{ product }` |

`Product` = `{ id, name, aliases: string[], categoryId, categoryName, tint, unit: 'KG'|'BUNCH'|'PIECE'|'DOZEN'|'PACK', increment: "0.250", pricePaise: "3600", dailyCap, farm, image: url|null, blurhash: string|null, variableWeight, isActive }`

### Cart
| Method | Path | Body → Response |
|---|---|---|
| GET | `/cart` | → `{ cart }` |
| PUT | `/cart/items` | `{ productId, quantity: "1.250", note? }` → `{ cart }` (quantity 0 removes) · 422 `VALIDATION` / `CAP_EXCEEDED` |
| DELETE | `/cart/items/:id` | → `{ cart }` |
| POST | `/cart/coupon` | `{ code }` → `{ cart }` · 404 `COUPON_NOT_FOUND` · 410 `COUPON_EXPIRED` · 409 `COUPON_ALREADY_USED` / `COUPON_CAP_REACHED` · 422 `MIN_ORDER_NOT_MET` |
| DELETE | `/cart/coupon` | → `{ cart }` |

`cart` = `{ items: [{ id, productId, name, unit, increment, image, blurhash, tint, variableWeight, quantity, unitPricePaise, lineTotalPaise, note }], subtotalPaise, couponDiscountPaise, deliveryChargePaise, totalPaise, minOrderValuePaise, meetsMinimum, coupon: { code, type, label, discountPaise } | null, walletBalancePaise }`

### Delivery windows & orders
| Method | Path | Body → Response |
|---|---|---|
| GET | `/delivery-windows?addressId=&date=` | → `{ windows: [{ id, date: "2026-09-06", window: 'MORNING'|'EVENING', capacity, remaining, isOpen, cutoffAt }] }` 14 days ahead |
| POST | `/orders` | `{ addressId, deliveryDate, window, couponCode?, useWallet }` → 201 `{ order, paymentIntent: { paymentId, razorpayOrderId, amountPaise, description } | null }` · 409 `WINDOW_FULL` (details.nextAvailable) · 422 `MIN_ORDER_NOT_MET` / `CART_EMPTY` · coupon codes as above |
| GET | `/orders` | → `{ orders: Order[], nextCursor }` |
| GET | `/orders/:id` | → `{ order }` |
| POST | `/orders/:id/cancel` | → `{ order }` · 409 `CANNOT_CANCEL` |

`Order` = `{ id, orderNumber: "F2F-K7QD9X", status: 'PENDING_PAYMENT'|'PAYMENT_FAILED'|'CONFIRMED'|'PACKED'|'OUT_FOR_DELIVERY'|'DELIVERED'|'CANCELLED', items (cart item shape), subtotalPaise, couponDiscountPaise, deliveryChargePaise, totalPaise, walletAppliedPaise, gatewayAmountPaise, couponCode, deliveryDate, window, address, createdAt, timeline: [{ status, at }], canCancel }`

**Serialiser rule:** the customer role never receives `margin`, `procurementCost`, `consumablesCost` or `costPaise`. The app does not read them and never will.

### Wallet & payments
| Method | Path | Body → Response |
|---|---|---|
| GET | `/wallet` | → `{ balancePaise, ledger: [{ id, direction: 'CREDIT'|'DEBIT', amountPaise, balanceAfterPaise, source: 'TOPUP'|'ORDER'|'REFUND'|'ADJUSTMENT', reference, note, createdAt }], nextCursor, denominationsPaise: string[] }` |
| POST | `/wallet/topup` | `{ amountPaise }` → 201 `{ paymentIntent }` · 422 `VALIDATION` (not a configured denomination) |
| POST | `/payments/verify` | `{ paymentId, razorpayPaymentId, razorpayOrderId?, razorpaySignature?, success }` → `{ status: 'CAPTURED'|'FAILED', order?, walletBalancePaise? }` **advisory only** — the webhook is the source of truth |
| POST | `/devices` | `{ expoPushToken }` → `{ ok }` (push registration) |

### What the app expects of the money flow
1. `POST /orders` runs the whole transaction (re-price, ₹500 check, coupon lock, window decrement, wallet debit) and returns `paymentIntent` only when `gatewayAmountPaise > 0`.
2. The app opens the Razorpay SDK with `razorpayOrderId` + `amountPaise`, then posts the SDK result to `/payments/verify`.
3. The order becomes `CONFIRMED` when the **webhook** lands. The app polls `GET /orders/:id` every 30 s on the detail screen, so a late webhook still shows up.
4. Abandoned payments: the release job flips the order to `PAYMENT_FAILED` after 20 min; the app shows "Payment not completed" and keeps the basket empty (server already consumed it), so the customer re-adds from history. **Open question for Adnan:** should the cart be restored on release? The mock does not.


### AI diet planner (added 5 Sep 2026 after the client call)
| Method | Path | Body → Response |
|---|---|---|
| POST | `/ai/plan` | `{ profile, request, horizon: 'meal'\|'day'\|'week'\|'month' }` → `{ plan }` where `plan` is the raw model JSON `{ title, summary, days:[{day, meals:[{slot,name,items:[{productId,grams}],steps,prepMinutes}]}], cautions }` |

The server builds the same system prompt the app uses in dev (`apps/customer/src/lib/ai.js` → `systemPrompt`) from the catalog + `src/lib/nutrition.js`, calls Groq (`openai/gpt-oss-120b`, JSON mode) or Gemini (`gemini-3.6-flash`, `responseMimeType: application/json`) with the **server-side** key, and returns the JSON untouched. The app validates it against the catalog and computes every calorie itself. Rate-limit this route (it is the most expensive call in the app). In dev the app calls the providers directly with `EXPO_PUBLIC_*` keys; those must never be live keys.

## Error codes the app branches on
`OTP_INVALID`, `OTP_LOCKED`, `OTP_RATE_LIMITED`, `ADDRESS_NOT_SERVICEABLE`, `MIN_ORDER_NOT_MET`, `COUPON_NOT_FOUND`, `COUPON_EXPIRED`, `COUPON_ALREADY_USED`, `COUPON_CAP_REACHED`, `WINDOW_FULL`, `CAP_EXCEEDED`, `PAYMENT_SIGNATURE_INVALID`, `IDEMPOTENCY_CONFLICT`, `NETWORK` (client-side only).
