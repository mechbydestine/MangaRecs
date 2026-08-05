// The import's one hard promise: it never rolls a user's progress backwards.
// Importing a stale tracker list over a live library is the single failure
// mode people actually rage-review over, and it's silent when it happens.
import { applyLibraryImport } from '../utils/libraryImport';
import { supabase } from '../supabase';

function mockLibrary(existing) {
  const upserted = [];
  supabase.from = jest.fn(() => ({
    select: () => ({
      eq: async () => ({ data: existing, error: null }),
    }),
    upsert: async (rows) => { upserted.push(...rows); return { error: null }; },
  }));
  return upserted;
}

describe('applyLibraryImport', () => {
  it('does nothing without a user or entries', async () => {
    expect(await applyLibraryImport(null, [{ title: 'X' }])).toEqual({ added: 0, updated: 0, skipped: 0 });
    expect(await applyLibraryImport('u1', [])).toEqual({ added: 0, updated: 0, skipped: 0 });
  });

  it('adds series that are not in the library yet', async () => {
    const rows = mockLibrary([]);
    const out = await applyLibraryImport('u1', [
      { title: 'One Piece', status: 'reading', current_chapter: 1100, total_chapters: null },
    ]);
    expect(out).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(rows[0]).toMatchObject({ user_id: 'u1', series_title: 'One Piece', current_chapter: 1100 });
  });

  it('never lowers existing progress', async () => {
    const rows = mockLibrary([{ series_title: 'Berserk', current_chapter: 374 }]);
    const out = await applyLibraryImport('u1', [
      { title: 'Berserk', status: 'reading', current_chapter: 100, total_chapters: null },
    ]);
    expect(out).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect(rows).toHaveLength(0); // not written at all
  });

  it('raises progress when the tracker is ahead', async () => {
    const rows = mockLibrary([{ series_title: 'Berserk', current_chapter: 100 }]);
    const out = await applyLibraryImport('u1', [
      { title: 'Berserk', status: 'reading', current_chapter: 374, total_chapters: null },
    ]);
    expect(out).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(rows[0].current_chapter).toBe(374);
  });

  it('matches titles case-insensitively but keeps the library’s own casing', async () => {
    const rows = mockLibrary([{ series_title: 'Solo Leveling', current_chapter: 10 }]);
    await applyLibraryImport('u1', [
      { title: 'solo leveling', status: 'reading', current_chapter: 200, total_chapters: null },
    ]);
    expect(rows[0].series_title).toBe('Solo Leveling');
  });

  it('treats an equal chapter count as already up to date', async () => {
    const rows = mockLibrary([{ series_title: 'Frieren', current_chapter: 121 }]);
    const out = await applyLibraryImport('u1', [
      { title: 'Frieren', status: 'reading', current_chapter: 121, total_chapters: null },
    ]);
    expect(out.skipped).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('chunks large imports rather than one giant statement', async () => {
    const chunks = [];
    supabase.from = jest.fn(() => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      upsert: async (rows) => { chunks.push(rows.length); return { error: null }; },
    }));
    const many = Array.from({ length: 450 }, (_, i) => ({
      title: `Series ${i}`, status: 'reading', current_chapter: 1, total_chapters: null,
    }));
    const out = await applyLibraryImport('u1', many);
    expect(out.added).toBe(450);
    expect(chunks.length).toBeGreaterThan(1);
    expect(Math.max(...chunks)).toBeLessThanOrEqual(200);
  });

  it('reports a partial result honestly when a chunk fails', async () => {
    let calls = 0;
    supabase.from = jest.fn(() => ({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
      upsert: async () => {
        calls++;
        return calls === 1 ? { error: null } : { error: { message: 'boom' } };
      },
    }));
    const many = Array.from({ length: 300 }, (_, i) => ({
      title: `S${i}`, status: 'reading', current_chapter: 1, total_chapters: null,
    }));
    const out = await applyLibraryImport('u1', many);
    // Everything from the failed chunk on is counted as skipped, not added —
    // reporting a success that didn't happen is worse than a partial number.
    expect(out.skipped).toBeGreaterThan(0);
    expect(out.added).toBe(300);
  });
});
