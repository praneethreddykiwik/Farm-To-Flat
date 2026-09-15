/**
 * Icon set — inline stroke SVGs (1.75px, rounded), so the panel ships no icon-font dependency and
 * every glyph inherits currentColor. Family and weight match the mobile app's line icons.
 */
const S = ({ children, size = 20, ...p }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...p}
  >
    {children}
  </svg>
);

/** Hamburger — opens the nav rail on phones, where the rail is an off-canvas drawer. */
export const IconMenu = (p) => (
  <S {...p}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </S>
);

export const IconDash = (p) => (
  <S {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </S>
);
export const IconCatalog = (p) => (
  <S {...p}>
    <path d="M3 7l9-4 9 4-9 4-9-4z" />
    <path d="M3 7v10l9 4 9-4V7" />
    <path d="M12 11v10" />
  </S>
);
export const IconTag = (p) => (
  <S {...p}>
    <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0l-7-7A2 2 0 0 1 3 12.2V5a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8z" />
    <circle cx="7.5" cy="7.5" r="1.5" />
  </S>
);
export const IconMap = (p) => (
  <S {...p}>
    <path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </S>
);
export const IconReceipt = (p) => (
  <S {...p}>
    <path d="M5 3v18l2-1.4L9 21l2-1.4L13 21l2-1.4L17 21l2-1.4V3l-2 1.4L15 3l-2 1.4L11 3 9 4.4 7 3 5 4.4z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </S>
);
export const IconTruck = (p) => (
  <S {...p}>
    <path d="M3 6h11v9H3z" />
    <path d="M14 9h4l3 3v3h-7z" />
    <circle cx="7" cy="18" r="1.8" />
    <circle cx="17" cy="18" r="1.8" />
  </S>
);
export const IconSearch = (p) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </S>
);
export const IconPlus = (p) => (
  <S {...p}>
    <path d="M12 5v14M5 12h14" />
  </S>
);
export const IconX = (p) => (
  <S {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </S>
);
export const IconDownload = (p) => (
  <S {...p}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </S>
);
export const IconCheck = (p) => (
  <S {...p}>
    <path d="M20 6 9 17l-5-5" />
  </S>
);
export const IconArrowUp = (p) => (
  <S {...p}>
    <path d="M12 19V5m0 0-6 6m6-6 6 6" />
  </S>
);
export const IconEdit = (p) => (
  <S {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </S>
);
export const IconTrash = (p) => (
  <S {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </S>
);
export const IconLeaf = (p) => (
  <S {...p}>
    <path d="M11 20A7 7 0 0 1 4 13c0-5 4-9 16-9 0 10-4 14-9 14z" />
    <path d="M4 20c3-6 6-8 11-9" />
  </S>
);
export const IconRupee = (p) => (
  <S {...p}>
    <path d="M6 4h12M6 8h12M9 4c4 0 6 2 6 5s-2 5-6 5h-.5L15 20M6 12h6" />
  </S>
);
export const IconBox = (p) => (
  <S {...p}>
    <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
    <path d="M3 7l9 4 9-4M12 11v10" />
  </S>
);
export const IconChart = (p) => (
  <S {...p}>
    <path d="M4 4v16h16" />
    <path d="M8 15v-3M12 15V9M16 15v-6" />
  </S>
);
export const IconBasket = (p) => (
  <S {...p}>
    <path d="M5 10h14l-1.2 9.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 10z" />
    <path d="M9 10 12 4l3 6" />
    <path d="M9.5 14v3M14.5 14v3" />
  </S>
);
export const IconShield = (p) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" />
    <path d="m9 12 2 2 4-4" />
  </S>
);
export const IconClock = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </S>
);
export const IconTicket = (p) => (
  <S {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8z" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </S>
);
export const IconLifeBuoy = (p) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="m4.9 4.9 4.6 4.6M14.5 14.5l4.6 4.6M19.1 4.9l-4.6 4.6M9.5 14.5l-4.6 4.6" />
  </S>
);
