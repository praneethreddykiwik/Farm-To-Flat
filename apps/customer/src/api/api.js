/**
 * RTK Query surface of the frozen /api/v1 contract (docs/api-contract.md).
 * Screens import hooks from here and never call fetch directly.
 */
import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { KV_KEYS, kv } from '../lib/kv';

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Me', 'Addresses', 'Catalog', 'Cart', 'Windows', 'Orders', 'Wallet'],
  endpoints: (b) => ({
    // ---- auth ----
    requestOtp: b.mutation({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    verifyOtp: b.mutation({ query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }) }),
    logout: b.mutation({ query: () => ({ url: '/auth/logout', method: 'POST', body: {} }) }),

    // ---- profile & address ----
    getMe: b.query({ query: () => '/me', providesTags: ['Me'] }),
    updateMe: b.mutation({
      query: (body) => ({ url: '/me', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
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
    // Available coupons + their terms. Pass the cart subtotal (paise) so each carries an accurate
    // "Add ₹X more to unlock" line.
    getCoupons: b.query({ query: (subtotalPaise = 0) => `/coupons?subtotal=${subtotalPaise}` }),
    // Support contact the app shows (email/phone, each only if the admin enabled it).
    getSupport: b.query({ query: () => '/support' }),

    // ---- cart ----
    getCart: b.query({ query: () => '/cart', providesTags: ['Cart'] }),
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
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    removeCartItem: b.mutation({
      query: (id) => ({ url: `/cart/items/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Cart'],
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
      query: ({ idempotencyKey, ...body }) => ({
        url: '/orders',
        method: 'POST',
        body,
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

    // ---- ai planner (production path; keeps the provider key server-side) ----
    aiPlan: b.mutation({ query: (body) => ({ url: '/ai/plan', method: 'POST', body }) }),
  }),
});

export const {
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useLogoutMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useRequestMobileChangeMutation,
  useVerifyMobileChangeMutation,
  useGetCommunitiesQuery,
  useGetAddressesQuery,
  useCreateAddressMutation,
  useSetDefaultAddressMutation,
  useGetCatalogQuery,
  useGetCouponsQuery,
  useGetSupportQuery,
  useSearchCatalogQuery,
  useLazySearchCatalogQuery,
  useGetProductQuery,
  useGetCartQuery,
  useSetCartItemMutation,
  useRemoveCartItemMutation,
  useApplyCouponMutation,
  useRemoveCouponMutation,
  useGetWindowsQuery,
  usePlaceOrderMutation,
  useGetOrdersQuery,
  useGetOrderQuery,
  useCancelOrderMutation,
  useReportOrderIssueMutation,
  useGetWalletQuery,
  useCreateTopupMutation,
  useVerifyPaymentMutation,
  useRegisterDeviceMutation,
  useAiPlanMutation,
} = api;
