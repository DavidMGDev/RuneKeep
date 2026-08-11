import { migrateEncounter, migrateList, migrateParty, migrateSession } from './dm-migrate';

/** What a party looked like before any of v0.41.4's fields existed, and while it was NOT the active one. */
const OLD_PARTY = {
  schemaVersion: 1,
  id: 'pt-1',
  createdAt: '2025-01-01T00:00:00.000Z',
  name: 'Shattered Crown',
  color: '#8A2A2A',
  memberIds: ['ch-1', 'ch-2'],
  present: { 'ch-1': true },
  enabled: false,
  global: { 'ch-1': { hp: 3, stress: 1, hope: 2, armor: 0 } },
};

const OLD_SESSION = { schemaVersion: 1, id: 'ss-1', partyId: 'pt-1', createdAt: '2025-02-01T00:00:00.000Z', name: 'Night One' };

const OLD_ENCOUNTER = {
  schemaVersion: 1, id: 'en-1', sessionId: 'ss-1', index: 1, createdAt: '2025-02-01T00:00:00.000Z',
  name: 'Encounter #1', status: 'completed', allies: [], adversaries: [], log: [], options: { globalSync: true, autoLog: true },
};

describe('migrateParty', () => {
  it('opens a party that was never the active one', () => {
    // The whole of "no data lost": those sessions were on disk and simply unreachable.
    expect(migrateParty(OLD_PARTY)?.enabled).toBe(true);
  });

  it('keeps everything the old record had', () => {
    const p = migrateParty(OLD_PARTY)!;
    expect(p.memberIds).toEqual(['ch-1', 'ch-2']);
    expect(p.global['ch-1']).toEqual({ hp: 3, stress: 1, hope: 2, armor: 0 });
    expect(p.name).toBe('Shattered Crown');
    expect(p.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('leaves the new identity fields absent rather than inventing them', () => {
    const p = migrateParty(OLD_PARTY)!;
    expect(p.description).toBeUndefined();
    expect(p.imageUri).toBeUndefined();
  });

  it('keeps fields this version has never heard of', () => {
    // An older build may write a record a newer one reads, and the reverse. Neither may eat the other.
    expect((migrateParty({ ...OLD_PARTY, somethingNew: 42 }) as unknown as { somethingNew: number }).somethingNew).toBe(42);
  });

  it('repairs a record whose lists went missing', () => {
    const p = migrateParty({ id: 'pt-2' })!;
    expect(p.memberIds).toEqual([]);
    expect(p.present).toEqual({});
    expect(p.global).toEqual({});
    expect(p.name).toBe('Campaign');
  });

  it('refuses a record with no id, rather than returning something unaddressable', () => {
    expect(migrateParty({ name: 'Nameless' })).toBeNull();
    expect(migrateParty(null)).toBeNull();
    expect(migrateParty('a string')).toBeNull();
  });

  it('drops a colour that is not one', () => {
    expect(migrateParty({ ...OLD_PARTY, color: 'not a colour' })!.color).toBe('#8A8F98');
  });
});

describe('migrateSession', () => {
  it('keeps an old session whole', () => {
    const s = migrateSession(OLD_SESSION)!;
    expect(s.name).toBe('Night One');
    expect(s.partyId).toBe('pt-1');
    expect(s.color).toBeUndefined();
  });

  it('keeps the active encounter it was pointing at', () => {
    expect(migrateSession({ ...OLD_SESSION, activeEncounterId: 'en-9' })!.activeEncounterId).toBe('en-9');
  });

  it('refuses a session with no party to belong to', () => {
    expect(migrateSession({ id: 'ss-2' })).toBeNull();
  });
});

describe('migrateEncounter', () => {
  it('keeps an old encounter whole, status included', () => {
    const e = migrateEncounter(OLD_ENCOUNTER)!;
    expect(e.status).toBe('completed');
    expect(e.options).toEqual({ globalSync: true, autoLog: true });
  });

  it('repairs lists that came back as something else, rather than crashing the night', () => {
    const e = migrateEncounter({ ...OLD_ENCOUNTER, adversaries: null, log: 'oops', options: 7 })!;
    expect(e.adversaries).toEqual([]);
    expect(e.log).toEqual([]);
    expect(e.options).toEqual({ globalSync: false, autoLog: true });
  });

  it('treats an unrecognised status as prepared', () => {
    expect(migrateEncounter({ ...OLD_ENCOUNTER, status: 'halfway' })!.status).toBe('prepared');
  });

  it('refuses an encounter with no session', () => {
    expect(migrateEncounter({ id: 'en-2' })).toBeNull();
  });
});

describe('migrateList', () => {
  it('keeps the good records when one is unreadable', () => {
    const out = migrateList([OLD_PARTY, { name: 'no id' }, { ...OLD_PARTY, id: 'pt-2' }], migrateParty);
    expect(out.map((p) => p.id)).toEqual(['pt-1', 'pt-2']);
  });

  it('survives a record that throws on repair', () => {
    const boom = { get id() { throw new Error('bad'); } };
    expect(migrateList([boom, OLD_PARTY], migrateParty).map((p) => p.id)).toEqual(['pt-1']);
  });

  it('has nothing to say about a blob that is not a list', () => {
    expect(migrateList({ not: 'a list' }, migrateParty)).toEqual([]);
    expect(migrateList(null, migrateParty)).toEqual([]);
  });
});
