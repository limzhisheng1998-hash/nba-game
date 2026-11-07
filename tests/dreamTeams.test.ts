import { describe, expect, it } from 'vitest';
import { ALL_PLAYERS, TEAMS } from '../src/data/teams';
import { abbrFromName, deleteDreamTeam, dreamToTeamDef, listDreamTeams, saveDreamTeam } from '../src/state/dreamTeams';

describe('teams data', () => {
  it('has 10 legendary teams with at least 9 players and valid ratings', () => {
    expect(TEAMS).toHaveLength(10);
    for (const t of TEAMS) {
      expect(t.players.length).toBeGreaterThanOrEqual(9);
      for (const p of t.players) for (const v of Object.values(p.r)) expect(v).toBeGreaterThanOrEqual(25), expect(v).toBeLessThanOrEqual(99);
    }
    expect(new Set(ALL_PLAYERS.map((p) => p.id)).size).toBe(ALL_PLAYERS.length);
  });
});

describe('dream teams', () => {
  it('saves, lists, converts and deletes', () => {
    const ids = ALL_PLAYERS.slice(0, 6).map((p) => p.id);
    saveDreamTeam({ id: 'd1', name: 'Test Team', abbr: 'TT', primary: '#000', secondary: '#fff', playerIds: ids });
    expect(listDreamTeams()).toHaveLength(1);
    const t = dreamToTeamDef(listDreamTeams()[0]);
    expect(t.players.map((p) => p.id)).toEqual(ids);
    expect(t.dream).toBe(true);
    saveDreamTeam({ ...listDreamTeams()[0], name: 'Renamed' });
    expect(listDreamTeams()).toHaveLength(1);
    expect(listDreamTeams()[0].name).toBe('Renamed');
    deleteDreamTeam('d1');
    expect(listDreamTeams()).toHaveLength(0);
  });
  it('makes abbreviations', () => {
    expect(abbrFromName('Goat Squad')).toBe('GS');
    expect(abbrFromName('Monstars')).toBe('MON');
    expect(abbrFromName('Big Three Legends')).toBe('BTL');
  });
});
