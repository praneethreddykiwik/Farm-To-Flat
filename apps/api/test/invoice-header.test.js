import { describe, expect, it } from 'vitest';
import { buildInvoicePdf, compactAddress } from '../src/lib/invoice.js';

const GST_STYLE = [
  'Building No./Flat No.: Plot No.753',
  'Road/Street: Prashanth Nagar',
  'Nearby Landmark: Vanasthalipuram',
  'Locality/Sub Locality: Vanasthalipuram',
  'City/Town/Village: Hyderabad',
  'District: Hyderabad',
  'State: Telangana',
  'PIN Code: 500070',
].join('\n');

describe('invoice seller address', () => {
  it('drops GST form labels and repeats, and joins the parts on one wrapped paragraph', () => {
    expect(compactAddress(GST_STYLE)).toBe(
      'Plot No.753, Prashanth Nagar, Vanasthalipuram, Hyderabad, Telangana, 500070',
    );
  });

  it('leaves an ordinary address alone', () => {
    expect(compactAddress('Plot 753, Prashanth Nagar, Hyderabad 500070')).toBe(
      'Plot 753, Prashanth Nagar, Hyderabad 500070',
    );
    expect(compactAddress('')).toBeNull();
    expect(compactAddress(null)).toBeNull();
  });

  it('still builds a PDF with a long multi-line address', async () => {
    const prev = { ...process.env };
    process.env.SELLER_LEGAL_NAME = 'KIWIK CONSULTING SERVICES';
    process.env.SELLER_ADDRESS = GST_STYLE;
    try {
      const pdf = await buildInvoicePdf({
        orderNumber: 'F2F-1',
        createdAt: '2026-10-15T10:00:00Z',
        deliveryDate: '2026-10-16',
        status: 'CONFIRMED',
        paymentMethod: 'COD',
        mobile: '9000000000',
        customerName: 'Test',
        address: { block: 'Block 1', flat: '1204', communityName: 'Test Homes' },
        items: [{ name: 'Tomato', qty: 1, unit: 'kg', pricePaise: 4000, lineTotalPaise: 4000 }],
        subtotalPaise: 4000,
        totalPaise: 4000,
      });
      expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    } finally {
      process.env = prev;
    }
  });
});
