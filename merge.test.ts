// Repeated corrections on the same day must merge, never overwrite each other.
import { describe, it, expect } from 'vitest';
import { mergePunchEdit } from './store';
import type { PunchEdit } from './store';

const T = (hm: string, day = 5) => day * 1440 + Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

const base: PunchEdit = {
  key: 'E1', day: 5, inT: T('07:03'), outT: T('16:30'),
  changeIn: false, changeOut: true, origIn: T('07:03'), origOut: T('15:00'),
  reason: 'approved overtime', by: 'mgr@savola.com',
};

describe('mergePunchEdit — second edit keeps the first correction', () => {
  it('an IN-only follow-up does not revert an earlier OUT correction', () => {
    const second: PunchEdit = {
      key: 'E1', day: 5, inT: T('06:30'), outT: T('16:30'),
      changeIn: true, changeOut: false, origIn: T('07:03'), origOut: T('16:30'),
      reason: 'came early', by: 'mgr@savola.com',
    };
    const merged = mergePunchEdit(base, second);
    expect(merged.changeIn).toBe(true);
    expect(merged.changeOut).toBe(true);         // earlier OUT correction survives
    expect(merged.inT).toBe(T('06:30'));
    expect(merged.outT).toBe(T('16:30'));        // manual OUT kept
  });

  it('an OUT-only follow-up does not revert an earlier IN correction', () => {
    const first: PunchEdit = { ...base, changeIn: true, changeOut: false, inT: T('06:30') };
    const second: PunchEdit = {
      key: 'E1', day: 5, inT: T('06:30'), outT: T('17:45'),
      changeIn: false, changeOut: true, reason: 'stayed late', by: 'mgr@savola.com',
    };
    const merged = mergePunchEdit(first, second);
    expect(merged.changeIn).toBe(true);
    expect(merged.changeOut).toBe(true);
    expect(merged.inT).toBe(T('06:30'));
    expect(merged.outT).toBe(T('17:45'));
  });

  it('preserves the very first original device times for the misuse monitor', () => {
    const second: PunchEdit = {
      ...base, changeIn: true, inT: T('06:30'), origIn: T('07:03'), origOut: T('16:30'), reason: 'came early',
    };
    const merged = mergePunchEdit(base, second);
    expect(merged.origOut).toBe(T('15:00'));     // pre-any-edit device time, not the first manual value
  });

  it('chains distinct reasons for the audit/report column', () => {
    const merged = mergePunchEdit(base, { ...base, changeIn: true, inT: T('06:30'), reason: 'came early' });
    expect(merged.reason).toBe('approved overtime · came early');
  });

  it('no earlier edit → incoming applies unchanged', () => {
    expect(mergePunchEdit(undefined, base)).toEqual(base);
  });
});
