/**
 * RTK Query surface of the frozen /api/v1 contract (docs/api-contract.md).
 * Screens import hooks from here and never call fetch directly.
 */
import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { KV_KEYS, kv } from '../lib/kv';
import { forgetSettledLines } from '../lib/cartWrites';

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: [
    'Consent',
    'Me',
    'Addresses',
    'Demand',
    'Catalog',
    'Cart',
    'Windows',
    'Orders',
    'Wallet',
    'Notifications',
    'Meals',
    'Growth',
    'Waitlist',
    'Review',
    'Tickets',
  ],
  endpoints: (b) => ({
    // ---- auth ----
    requestOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    verifyOtp: b.mutation({ query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }) }),
    // DPDP: has this account agreed to the current privacy notice (and said it is 18+)?
    consentStatus: b.query({ query: () => '/me/consent', providesTags: ['Consent'] }),
    consentSave: b.mutation({
      query: (body) => ({ url: '/me/consent', method: 'POST', body }),
      invalidatesTags: ['Consent'],
    }),
    // `expoPushToken`: this phone stops getting the signed-out account's notifications (review #42).
    logout: b.mutation({
      query: (/** @type {{ expoPushToken?: string|null } | undefined} */ arg) => ({
        url: '/auth/logout',
        method: 'POST',
        body: arg?.expoPushToken ? { expoPushToken: arg.expoPushToken } : {},
      }),
    }),

    // ---- profile & address ----
    getMe: b.query({ query: () => '/me', providesTags: ['Me'] }),
    updateMe: b.mutation({
      query: (body) => ({ url: '/me', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
    // Right-to-erasure: anonymises the account server-side and revokes the session. The caller
    // signs out immediately after; the returned walletBalancePaise lets us warn first.
    deleteAccount: b.mutation({ query: () => ({ url: '/me', method: 'DELETE' }) }),
    // Support requests: problems or complaints about using the app, answered by the team.
    getTickets: b.query({ query: () => '/support/tickets', providesTags: ['Tickets'] }),
    getTicket: b.query({
      query: (id) => `/support/tickets/${encodeURIComponent(id)}`,
      providesTags: ['Tickets'],
    }),
    createTicket: b.mutation({
      query: (body) => ({ url: '/support/tickets', method: 'POST', body }),
      invalidatesTags: ['Tickets'],
    }),
    replyTicket: b.mutation({
      query: ({ id, text }) => ({
        url: `/support/tickets/${encodeURIComponent(id)}/messages`,
        method: 'POST',
        body: { text },
      }),
      invalidatesTags: ['Tickets'],
    }),
    // Deletion with a 60-day grace period, confirmed by a code to the account's own number.
    getDeletionStatus: b.query({ query: () => '/me/deletion', keepUnusedDataFor: 0 }),
    requestDeletionCode: b.mutation({
      query: () => ({ url: '/me/deletion/request', method: 'POST', body: {} }),
    }),
    confirmDeletion: b.mutation({
      // `consent`: the tick-box ("I have read what is deleted and kept, and I agree"), recorded
      // on the server with the request. Accepts the old plain-code call too.
      query: (arg) => ({
        url: '/me/deletion/confirm',
        method: 'POST',
        body: typeof arg === 'string' ? { otp: arg } : arg,
      }),
    }),
    // Changing the number keeps the same account — see apps/api/src/routes/me.js. Invalidating Me
    // and Addresses is what makes the profile show the new number without a sign-out.
    requestMobileChange: b.mutation({
      query: (body) => ({ url: '/me/mobile/request', method: 'POST', body }),
    }),
    verifyMobileChange: b.mutation({
      query: (body) => ({ url: '/me/mobile/verify', method: 'POST', body }),
      invalidatesTags: ['Me', 'Addresses'],
    }),
    getCommunities: b.query({ query: () => '/communities' }),
    getAddresses: b.query({ query: () => '/addresses', providesTags: ['Addresses'] }),
    createAddress: b.mutation({
      query: (body) => ({ url: '/addresses', method: 'POST', body }),
      invalidatesTags: ['Addresses', 'Me', 'Windows'],
    }),
    setDefaultAddress: b.mutation({
      query: (id) => ({ url: `/addresses/${id}/default`, method: 'POST', body: {} }),
      invalidatesTags: ['Addresses', 'Me', 'Windows'],
    }),
    // Editing changes where FUTURE orders go; an order already placed keeps its own snapshot.
    updateAddress: b.mutation({
      query: ({ id, ...body }) => ({ url: `/addresses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Addresses', 'Me', 'Windows'],
    }),
    // The server refuses to remove the last address (409 LAST_ADDRESS) and hands the default on.
    deleteAddress: b.mutation({
      query: (id) => ({ url: `/addresses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Addresses', 'Me', 'Windows'],
    }),

    // ---- "come and deliver here" ----
    // An out-of-area location check. Counted with NO identity attached: the server stores a
    // rounded area and nothing about who asked.
    checkDemand: b.mutation({
      query: (body) => ({ url: '/demand/checks', method: 'POST', body }),
    }),
    // The opt-in half: "tell me when you deliver here". This one does carry the account.
    getDemandSubscriptions: b.query({
      query: () => '/demand/subscriptions',
      providesTags: ['Demand'],
    }),
    subscribeDemand: b.mutation({
      query: (body) => ({ url: '/demand/subscriptions', method: 'POST', body }),
      invalidatesTags: ['Demand'],
    }),
    removeDemandSubscription: b.mutation({
      query: (id) => ({ url: `/demand/subscriptions/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Demand'],
    }),

    // ---- catalog ----
    getCatalog: b.query({
      query: () => '/catalog',
      providesTags: ['Catalog'],
      keepUnusedDataFor: 600,
      transformResponse: (res) => {
        kv.setJSON(KV_KEYS.catalog, res);
        return res;
      },
    }),
    searchCatalog: b.query({ query: (q) => `/catalog/search?q=${encodeURIComponent(q)}` }),
    getProduct: b.query({ query: (id) => `/catalog/${id}` }),
    // What we say about a product beyond its price: computed nutrition statements, its story, how to
    // keep it, a recipe. Changes only when we publish new content, so it is held for an hour.
    getProductKnowledge: b.query({
      query: (id) => `/catalog/${id}/knowledge`,
      // Five minutes, not an hour: the words are edited in the admin console, and a phone that
      // held yesterday's recipe for an hour would make a correction look like it had not saved.
      keepUnusedDataFor: 300,
    }),
    // Available coupons + their terms. Pass the cart subtotal (paise) so each carries an accurate
    // "Add ₹X more to unlock" line.
    getCoupons: b.query({ query: (subtotalPaise = 0) => `/coupons?subtotal=${subtotalPaise}` }),
    // Support contact the app shows (email/phone, each only if the admin enabled it).
    getSupport: b.query({ query: () => '/support' }),

    // ---- cart ----
    getCart: b.query({ query: () => '/cart', providesTags: ['Cart'] }),
    // What a list of items would cost, fees and tax included, without touching the basket
    // (tomorrow's plan, before it is ordered). Re-asked when the coupon or wallet changes.
    quoteItems: b.query({
      query: (items) => ({ url: '/cart/quote', method: 'POST', body: { items } }),
      providesTags: ['Cart', 'Wallet'],
    }),
    setCartItem: b.mutation({
      query: (body) => ({ url: '/cart/items', method: 'PUT', body }),
      invalidatesTags: ['Cart'],
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        // optimistic quantity so the stepper feels instant; server response wins on settle
        const patch = dispatch(
          api.util.updateQueryData('getCart', undefined, (draft) => {
            const cart = draft?.cart;
            if (!cart) return;
            const line = cart.items.find((i) => i.productId === body.productId);
            if (line) {
              if (Number(body.quantity) === 0)
                cart.items = cart.items.filter((i) => i.productId !== body.productId);
              else {
                line.quantity = Number(body.quantity).toFixed(3);
                line.lineTotalPaise = String(
                  Math.round(Number(line.unitPricePaise) * Number(body.quantity)),
                );
              }
            }
          }),
        );
        try {
          // The reply IS the basket after this change. Use it, rather than showing the old one
          // until a second request has fetched the same thing: that is one round trip sooner for
          // every tap, and it is what lets a newly added line appear without a refetch at all.
          // (The basket is still refetched once everything in flight has landed, as the check.)
          const { data } = await queryFulfilled;
          if (data?.cart) dispatch(api.util.updateQueryData('getCart', undefined, () => data));
        } catch {
          patch.undo();
        }
      },
    }),
    removeCartItem: b.mutation({
      query: (id) => ({ url: `/cart/items/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Cart'],
      // A line taken out by its own button: any figure still being held for it would put it back
      // on screen for a moment.
      //
      // And it goes at once (21 Nov 2026). Removing used to wait for the DELETE and then a fresh
      // GET of the basket — two round trips to the server before the line moved, about a second
      // from Hyderabad — so it felt broken. Now the line leaves the cached basket immediately and
      // the totals follow when the server answers (they are its to work out: coupons, fees, tax);
      // if the server refuses, the line comes back.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        forgetSettledLines();
        const patch = dispatch(
          api.util.updateQueryData('getCart', undefined, (draft) => {
            const cart = draft?.cart;
            if (!cart?.items) return;
            const line = cart.items.find((i) => i.id === id);
            if (!line) return;
            cart.items = cart.items.filter((i) => i.id !== id);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    applyCoupon: b.mutation({
      query: (code) => ({ url: '/cart/coupon', method: 'POST', body: { code } }),
      invalidatesTags: ['Cart'],
    }),
    removeCoupon: b.mutation({
      query: () => ({ url: '/cart/coupon', method: 'DELETE' }),
      invalidatesTags: ['Cart'],
    }),

    // ---- windows & orders ----
    // Ask for the schedule of the customer's OWN community. communityId is the direct hint; addressId
    // is resolved server-side from the signed-in customer's addresses. (Without either the server
    // used to fall back to the first community, so everyone saw the wrong delivery days.)
    getWindows: b.query({
      query: (/** @type {any} */ { addressId, communityId, date } = {}) =>
        `/delivery-windows?${new URLSearchParams({
          ...(communityId ? { communityId } : {}),
          ...(addressId ? { addressId } : {}),
          ...(date ? { date } : {}),
        }).toString()}`,
      providesTags: ['Windows'],
      // The schedule is live in two ways: the countdown to each cut-off is ticking, and the
      // operator can change a community's delivery days at any moment. A cached copy therefore goes
      // stale on its own — which is why changing the days on the website appeared to have no effect
      // in the app. Refetch whenever the picker is opened, and keep the cached copy only briefly so
      // an app left open overnight is not still offering yesterday's slots.
      keepUnusedDataFor: 60,
    }),
    placeOrder: b.mutation({
      // The key goes in the header (baseQuery) AND the body: API builds before 21 Nov 2026 read only
      // the body, so the header alone never reached them (review #2).
      query: ({ idempotencyKey, ...body }) => ({
        url: '/orders',
        method: 'POST',
        body: { ...body, idempotencyKey },
        idempotencyKey,
      }),
      invalidatesTags: ['Cart', 'Orders', 'Wallet', 'Windows', 'Me'],
    }),
    getOrders: b.query({ query: () => '/orders', providesTags: ['Orders'] }),
    getOrder: b.query({
      query: (id) => `/orders/${id}`,
      providesTags: (r, e, id) => [{ type: 'Orders', id }, 'Orders'],
    }),
    /** Report a problem with a delivered order — photos as base64, uploaded by the API. */
    reportOrderIssue: b.mutation({
      query: ({ id, ...body }) => ({ url: `/orders/${id}/issue`, method: 'POST', body }),
      invalidatesTags: (r, e, { id }) => [{ type: 'Orders', id }, 'Orders'],
    }),
    cancelOrder: b.mutation({
      query: (id) => ({ url: `/orders/${id}/cancel`, method: 'POST', body: {} }),
      // Cancelling an order that never got paid for hands the basket back too — same reason.
      invalidatesTags: ['Orders', 'Wallet', 'Me', 'Cart'],
    }),
    /**
     * Add items to an order still inside its edit window. COD grows the door amount and the response
     * carries the updated order; PREPAID returns a paymentIntent for the delta ONLY, settled through
     * the same /payments/verify leg as a new order. We don't invalidate here — the caller refetches
     * the order once the delta (if any) is paid, so the list never flashes a half-applied total.
     */
    addItemsToOrder: b.mutation({
      query: ({ id, items }) => ({
        url: `/orders/${id}/add-items`,
        method: 'POST',
        body: { items },
      }),
    }),

    // ---- wallet & payments ----
    getWallet: b.query({ query: () => '/wallet', providesTags: ['Wallet'] }),
    createTopup: b.mutation({
      query: (amountPaise) => ({
        url: '/wallet/topup',
        method: 'POST',
        body: { amountPaise: String(amountPaise) },
      }),
    }),
    verifyPayment: b.mutation({
      query: (body) => ({ url: '/payments/verify', method: 'POST', body }),
      // 'Cart' matters on the FAILURE path: the server gives the basket back when a payment is
      // abandoned, and without this the app kept serving the emptied cart it had cached at
      // checkout — the customer saw an empty bag and had to pick everything out again.
      invalidatesTags: ['Wallet', 'Orders', 'Me', 'Cart'],
    }),
    registerDevice: b.mutation({ query: (body) => ({ url: '/devices', method: 'POST', body }) }),

    // ---- notifications (the in-app notification centre) ----
    getNotifications: b.query({ query: () => '/notifications', providesTags: ['Notifications'] }),
    getUnreadCount: b.query({
      query: () => '/notifications/unread-count',
      providesTags: ['Notifications'],
    }),
    markNotificationRead: b.mutation({
      query: (id) => ({ url: `/notifications/${id}/read`, method: 'POST', body: {} }),
      invalidatesTags: ['Notifications'],
    }),
    markAllNotificationsRead: b.mutation({
      query: () => ({ url: '/notifications/read-all', method: 'POST', body: {} }),
      invalidatesTags: ['Notifications'],
    }),

    // ---- ai planner (production path; keeps the provider key server-side) ----
    aiPlan: b.mutation({ query: (body) => ({ url: '/ai/plan', method: 'POST', body }) }),

    // ---- lens: a photograph in, a product from our catalogue out ----
    aiIdentify: b.mutation({ query: (body) => ({ url: '/ai/identify', method: 'POST', body }) }),

    // ---- meal tracking (super-admin only server-side, for now) ----
    // One meal in, by photo, by picking foods, as "had my planned meal", or as skipped.
    mealDay: b.query({
      query: (date) => `/meals/day?date=${encodeURIComponent(date)}`,
      providesTags: ['Meals'],
    }),
    mealLog: b.mutation({
      query: (body) => ({ url: '/meals/log', method: 'POST', body }),
      invalidatesTags: ['Meals'],
    }),
    // "Bigger portion", "how much oil", "that item is wrong".
    mealCorrect: b.mutation({
      query: ({ id, ...body }) => ({ url: `/meals/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Meals'],
    }),
    mealDelete: b.mutation({
      query: (id) => ({ url: `/meals/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Meals'],
    }),
    // Per day: the plan's figures, everything logged and the photo-only estimate — the charts.
    mealRange: b.query({
      query: ({ from, to }) =>
        `/meals/range?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      providesTags: ['Meals'],
    }),
    // The diet plan + profile, saved on the server so the calendar survives a reinstall.
    mealPlan: b.query({ query: () => '/meals/plan', keepUnusedDataFor: 0 }),
    mealPlanSave: b.mutation({
      query: (body) => ({ url: '/meals/plan', method: 'PUT', body }),
      invalidatesTags: ['Meals'],
    }),
    mealStreak: b.query({
      query: (today) => `/meals/streak?today=${encodeURIComponent(today)}`,
      providesTags: ['Meals'],
    }),
    mealFoods: b.query({
      query: (q = '') => `/meals/foods?q=${encodeURIComponent(q)}`,
      keepUnusedDataFor: 3600,
    }),
    // the original two-step flow, still used by the plan-adherence card
    mealCheckin: b.mutation({
      query: (body) => ({ url: '/meals/checkin', method: 'POST', body }),
      invalidatesTags: ['Meals'],
    }),
    mealPhoto: b.mutation({
      query: ({ id, ...body }) => ({ url: `/meals/${id}/photo`, method: 'POST', body }),
      invalidatesTags: ['Meals'],
    }),
    mealAdherence: b.query({
      /** @param {{ from?: string, to?: string }} [range]  both ends optional, as is the range itself */
      query: ({ from, to } = {}) => {
        const q = new URLSearchParams();
        if (from) q.set('from', from);
        if (to) q.set('to', to);
        const s = q.toString();
        return `/meals/adherence${s ? `?${s}` : ''}`;
      },
      providesTags: ['Meals'],
    }),

    // ---- growth (17 Nov 2026 review): invites, promoter codes, waitlist, ratings ----
    getInvite: b.query({ query: () => '/growth/invite', providesTags: ['Growth'] }),
    checkCode: b.mutation({
      query: (code) => ({ url: '/growth/check-code', method: 'POST', body: { code } }),
    }),
    // Tracking brief (Rapture7, 19 Nov 2026): the Play install referrer, and the few events only
    // the phone can see. Fire-and-forget — see src/lib/tracking.js.
    postInstallSource: b.mutation({
      query: (referrer) => ({ url: '/growth/install-source', method: 'POST', body: { referrer } }),
    }),
    trackEvent: b.mutation({
      query: ({ name, props }) => ({ url: '/events', method: 'POST', body: { name, props } }),
    }),
    getFirstOrder: b.query({
      query: () => '/growth/first-order',
      providesTags: ['Growth', 'Orders'],
    }),
    getWaitlist: b.query({
      query: (q = '') => `/growth/waitlist${q ? `?q=${encodeURIComponent(q)}` : ''}`,
      providesTags: ['Waitlist'],
    }),
    joinWaitlist: b.mutation({
      query: (id) => ({ url: `/growth/waitlist/${id}/join`, method: 'POST', body: {} }),
      invalidatesTags: ['Waitlist'],
    }),
    leaveWaitlist: b.mutation({
      query: (id) => ({ url: `/growth/waitlist/${id}/join`, method: 'DELETE' }),
      invalidatesTags: ['Waitlist'],
    }),
    requestCommunity: b.mutation({
      query: (body) => ({ url: '/growth/community-requests', method: 'POST', body }),
      invalidatesTags: ['Waitlist'],
    }),
    getReview: b.query({
      query: (orderId) => `/orders/${orderId}/review`,
      providesTags: (_r, _e, id) => [{ type: 'Review', id }],
    }),
    saveReview: b.mutation({
      query: ({ orderId, ...body }) => ({ url: `/orders/${orderId}/review`, method: 'PUT', body }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Review', id: orderId }],
    }),
  }),
});

export const {
  useGetDeletionStatusQuery,
  useRequestDeletionCodeMutation,
  useConfirmDeletionMutation,
  useGetTicketsQuery,
  useGetTicketQuery,
  useCreateTicketMutation,
  useReplyTicketMutation,
  useGetInviteQuery,
  useCheckCodeMutation,
  usePostInstallSourceMutation,
  useTrackEventMutation,
  useGetFirstOrderQuery,
  useGetWaitlistQuery,
  useJoinWaitlistMutation,
  useLeaveWaitlistMutation,
  useRequestCommunityMutation,
  useGetReviewQuery,
  useSaveReviewMutation,
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useLogoutMutation,
  useConsentStatusQuery,
  useConsentSaveMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useDeleteAccountMutation,
  useRequestMobileChangeMutation,
  useVerifyMobileChangeMutation,
  useGetCommunitiesQuery,
  useGetAddressesQuery,
  useCreateAddressMutation,
  useSetDefaultAddressMutation,
  useUpdateAddressMutation,
  useDeleteAddressMutation,
  useCheckDemandMutation,
  useGetDemandSubscriptionsQuery,
  useSubscribeDemandMutation,
  useRemoveDemandSubscriptionMutation,
  useGetCatalogQuery,
  useGetCouponsQuery,
  useGetSupportQuery,
  useSearchCatalogQuery,
  useLazySearchCatalogQuery,
  useGetProductQuery,
  useGetProductKnowledgeQuery,
  useGetCartQuery,
  useQuoteItemsQuery,
  useSetCartItemMutation,
  useRemoveCartItemMutation,
  useApplyCouponMutation,
  useRemoveCouponMutation,
  useGetWindowsQuery,
  usePlaceOrderMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCancelOrderMutation,
  useAddItemsToOrderMutation,
  useReportOrderIssueMutation,
  useGetWalletQuery,
  useCreateTopupMutation,
  useVerifyPaymentMutation,
  useRegisterDeviceMutation,
  useGetNotificationsQuery,
  useGetUnreadCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useAiPlanMutation,
  useAiIdentifyMutation,
  useMealDayQuery,
  useMealRangeQuery,
  useMealPlanQuery,
  useLazyMealPlanQuery,
  useMealPlanSaveMutation,
  useMealLogMutation,
  useMealCorrectMutation,
  useMealDeleteMutation,
  useMealStreakQuery,
  useMealFoodsQuery,
  useMealCheckinMutation,
  useMealPhotoMutation,
  useMealAdherenceQuery,
} = api;
