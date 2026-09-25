/**
 * Complaint photographs are private.
 *
 * They are taken inside someone's home or at their door and attached to a named order with an
 * address on it. They used to be written into a PUBLIC bucket and stored as permanent public URLs,
 * so anyone holding a link could fetch one with no login, forever. They are now stored as object
 * paths and handed out only as short-lived signed links.
 *
 * The rows written before that change still hold full public URLs, so the path has to be recoverable
 * from one — otherwise fixing the bucket would blank every complaint already on file.
 */
import { describe, expect, it } from 'vitest';
import { issuePhotoPath } from '../src/lib/storage.js';

const PUBLIC_URL =
  'https://anphxxszdqkqnbzdsrre.supabase.co/storage/v1/object/public/order-issues/ord_h0G2IxaGbd/1790339037184-7m7osi.png';

describe('recovering the object path from whatever is stored', () => {
  it('reads the path out of a legacy public URL', () => {
    expect(issuePhotoPath(PUBLIC_URL)).toBe('ord_h0G2IxaGbd/1790339037184-7m7osi.png');
  });

  it('leaves a bare path alone — that is what new uploads store', () => {
    const path = 'ord_abc123/1790339037184-7m7osi.png';
    expect(issuePhotoPath(path)).toBe(path);
  });

  it('drops a query string, so a previously signed URL still resolves to its object', () => {
    expect(issuePhotoPath(`${PUBLIC_URL}?token=abc.def.ghi&expires=123`)).toBe(
      'ord_h0G2IxaGbd/1790339037184-7m7osi.png',
    );
  });

  it('decodes an escaped path rather than asking storage for a key that does not exist', () => {
    expect(
      issuePhotoPath(
        'https://x.supabase.co/storage/v1/object/public/order-issues/ord_a%20b/1-2.png',
      ),
    ).toBe('ord_a b/1-2.png');
  });

  it('returns nothing for a URL that is not an issue photo, rather than a bogus key', () => {
    expect(
      issuePhotoPath('https://x.supabase.co/storage/v1/object/public/product-images/tomato.png'),
    ).toBe('');
    expect(issuePhotoPath(null)).toBe('');
  });
});
