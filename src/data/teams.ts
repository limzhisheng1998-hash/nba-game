import type { PlayerDef, Position, Ratings, TeamDef } from './types';

/**
 * Legendary teams. Ratings are built from an archetype (offsets from the
 * player's overall) plus per-player overrides for signature skills.
 * Edit this file to tweak ratings or add teams — game code reads it as-is.
 */

type Arch =
  | 'playmaker'
  | 'shooter'
  | 'slasher'
  | 'threeD'
  | 'star'
  | 'post'
  | 'rim'
  | 'stretch'
  | 'twoWayF';

const ARCH: Record<Arch, Omit<Ratings, 'stamina'>> = {
  playmaker: { inside: -10, mid: -4, three: -4, ft: 0, pass: 4, handle: 3, speed: 2, strength: -25, perD: -8, intD: -40, steal: -6, block: -45, reb: -35 },
  shooter: { inside: -12, mid: 1, three: 4, ft: 4, pass: -8, handle: -6, speed: -2, strength: -28, perD: -10, intD: -40, steal: -12, block: -48, reb: -38 },
  slasher: { inside: 2, mid: -3, three: -10, ft: -6, pass: -10, handle: -4, speed: 1, strength: -10, perD: -6, intD: -25, steal: -10, block: -25, reb: -20 },
  threeD: { inside: -12, mid: -4, three: 2, ft: -2, pass: -14, handle: -14, speed: -4, strength: -12, perD: 4, intD: -18, steal: -4, block: -25, reb: -22 },
  star: { inside: 0, mid: 0, three: -4, ft: -4, pass: -4, handle: -3, speed: 0, strength: -6, perD: -2, intD: -15, steal: -6, block: -20, reb: -14 },
  post: { inside: 2, mid: -14, three: -50, ft: -22, pass: -18, handle: -38, speed: -18, strength: 4, perD: -26, intD: 2, steal: -28, block: -4, reb: 2 },
  rim: { inside: -6, mid: -30, three: -60, ft: -30, pass: -22, handle: -44, speed: -16, strength: 2, perD: -26, intD: 6, steal: -26, block: 4, reb: 6 },
  stretch: { inside: -4, mid: 0, three: -6, ft: -2, pass: -14, handle: -26, speed: -14, strength: -4, perD: -22, intD: -4, steal: -26, block: -10, reb: -6 },
  twoWayF: { inside: -2, mid: -6, three: -14, ft: -10, pass: -10, handle: -20, speed: -8, strength: -2, perD: -4, intD: -2, steal: -14, block: -10, reb: -4 },
};

const DEFAULT_HEIGHT: Record<Position, number> = { PG: 75, SG: 78, SF: 80, PF: 82, C: 84 };

const clamp = (v: number) => Math.max(25, Math.min(99, Math.round(v)));

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

type Spec = [name: string, pos: Position, num: string, ovr: number, arch: Arch, over?: Partial<Ratings> & { h?: number }];

function team(
  id: string,
  label: string,
  name: string,
  season: string,
  abbr: string,
  primary: string,
  secondary: string,
  specs: Spec[],
): TeamDef {
  const players: PlayerDef[] = specs.map(([pname, pos, num, ovr, arch, over = {}]) => {
    const base = ARCH[arch];
    const r = {} as Ratings;
    for (const k of Object.keys(base) as (keyof typeof base)[]) r[k] = clamp(ovr + base[k]);
    r.stamina = clamp(78 + (ovr - 80) * 0.4);
    const { h, ...rest } = over;
    Object.assign(r, rest);
    return {
      id: `${id}:${slug(pname)}`,
      name: pname,
      pos,
      num,
      ovr,
      heightIn: h ?? DEFAULT_HEIGHT[pos],
      r,
      teamId: id,
      era: label,
    };
  });
  return { id, label, name, season, abbr, primary, secondary, players };
}

export const TEAMS: TeamDef[] = [
  team('bos86', "'86 Celtics", 'Boston Celtics', '1985-86', 'BOS', '#007A33', '#FFFFFF', [
    ['Dennis Johnson', 'PG', '3', 84, 'playmaker', { perD: 88, steal: 80 }],
    ['Danny Ainge', 'SG', '44', 81, 'shooter', { three: 82 }],
    ['Larry Bird', 'SF', '33', 97, 'star', { three: 92, mid: 97, ft: 92, pass: 92, reb: 88, h: 81 }],
    ['Kevin McHale', 'PF', '32', 90, 'post', { inside: 95, mid: 78, block: 82, h: 82 }],
    ['Robert Parish', 'C', '00', 87, 'post', { reb: 88, mid: 74, h: 84 }],
    ['Bill Walton', 'C', '5', 80, 'rim', { pass: 82, reb: 86, h: 83 }],
    ['Scott Wedman', 'SF', '8', 75, 'shooter'],
    ['Jerry Sichting', 'PG', '12', 73, 'shooter'],
    ['Sam Vincent', 'PG', '11', 70, 'playmaker'],
  ]),
  team('lal87', "'87 Lakers", 'Los Angeles Lakers', '1986-87', 'LAL', '#552583', '#FDB927', [
    ['Magic Johnson', 'PG', '32', 97, 'playmaker', { pass: 99, handle: 92, inside: 88, reb: 80, strength: 80, h: 81 }],
    ['Byron Scott', 'SG', '4', 83, 'shooter'],
    ['James Worthy', 'SF', '42', 89, 'slasher', { inside: 93, speed: 88 }],
    ['A.C. Green', 'PF', '45', 79, 'twoWayF', { reb: 84 }],
    ['Kareem Abdul-Jabbar', 'C', '33', 89, 'post', { inside: 94, mid: 82, ft: 76, block: 84, h: 86 }],
    ['Michael Cooper', 'SG', '21', 80, 'threeD', { perD: 92, three: 78 }],
    ['Mychal Thompson', 'C', '43', 78, 'post'],
    ['Kurt Rambis', 'PF', '31', 72, 'rim'],
    ['Wes Matthews', 'PG', '5', 70, 'playmaker'],
  ]),
  team('chi96', "'96 Bulls", 'Chicago Bulls', '1995-96', 'CHI', '#CE1141', '#000000', [
    ['Ron Harper', 'PG', '9', 78, 'threeD', { perD: 86 }],
    ['Michael Jordan', 'SG', '23', 99, 'star', { mid: 99, inside: 97, three: 82, ft: 86, perD: 96, steal: 93, handle: 94, speed: 94 }],
    ['Scottie Pippen', 'SF', '33', 94, 'star', { perD: 97, steal: 94, pass: 86, h: 80 }],
    ['Dennis Rodman', 'PF', '91', 86, 'rim', { reb: 99, perD: 90, intD: 90, inside: 55, mid: 40, ft: 52, speed: 78 }],
    ['Luc Longley', 'C', '13', 75, 'post', { h: 86 }],
    ['Toni Kukoc', 'SF', '7', 82, 'stretch', { pass: 82, handle: 72, h: 82 }],
    ['Steve Kerr', 'PG', '25', 77, 'shooter', { three: 92, ft: 90 }],
    ['Bill Wennington', 'C', '34', 71, 'stretch'],
    ['Jud Buechler', 'SF', '30', 69, 'threeD'],
  ]),
  team('chi98', "'98 Bulls", 'Chicago Bulls', '1997-98', 'CHI', '#CE1141', '#000000', [
    ['Ron Harper', 'PG', '9', 76, 'threeD', { perD: 84 }],
    ['Michael Jordan', 'SG', '23', 97, 'star', { mid: 99, inside: 93, three: 76, ft: 85, perD: 92, steal: 88, handle: 93, speed: 88 }],
    ['Scottie Pippen', 'SF', '33', 91, 'star', { perD: 95, steal: 90, pass: 85, h: 80 }],
    ['Dennis Rodman', 'PF', '91', 84, 'rim', { reb: 99, perD: 86, intD: 88, inside: 52, mid: 38, ft: 55, speed: 74 }],
    ['Luc Longley', 'C', '13', 74, 'post', { h: 86 }],
    ['Toni Kukoc', 'SF', '7', 82, 'stretch', { pass: 82, handle: 72, h: 82 }],
    ['Steve Kerr', 'PG', '25', 76, 'shooter', { three: 92, ft: 90 }],
    ['Scott Burrell', 'SF', '24', 71, 'threeD'],
    ['Randy Brown', 'PG', '1', 70, 'playmaker', { perD: 78 }],
  ]),
  team('lal01', "'01 Lakers", 'Los Angeles Lakers', '2000-01', 'LAL', '#552583', '#FDB927', [
    ['Derek Fisher', 'PG', '2', 77, 'shooter'],
    ['Kobe Bryant', 'SG', '8', 94, 'star', { mid: 95, inside: 93, handle: 92, perD: 90, speed: 92 }],
    ['Rick Fox', 'SF', '17', 77, 'threeD'],
    ['Horace Grant', 'PF', '54', 78, 'twoWayF'],
    ["Shaquille O'Neal", 'C', '34', 98, 'post', { inside: 99, strength: 99, reb: 95, block: 88, ft: 50, mid: 55, h: 85 }],
    ['Robert Horry', 'PF', '5', 78, 'stretch', { three: 78 }],
    ['Ron Harper', 'PG', '4', 74, 'threeD'],
    ['Brian Shaw', 'PG', '20', 73, 'playmaker'],
    ['Tyronn Lue', 'PG', '10', 70, 'playmaker'],
  ]),
  team('bos08', "'08 Celtics", 'Boston Celtics', '2007-08', 'BOS', '#007A33', '#BA9653', [
    ['Rajon Rondo', 'PG', '9', 82, 'playmaker', { pass: 90, steal: 86, three: 55, ft: 62 }],
    ['Ray Allen', 'SG', '20', 88, 'shooter', { three: 96, ft: 95, mid: 92 }],
    ['Paul Pierce', 'SF', '34', 91, 'star', { mid: 92, three: 86, ft: 87 }],
    ['Kevin Garnett', 'PF', '5', 94, 'twoWayF', { mid: 88, intD: 96, perD: 88, reb: 92, block: 85, h: 83 }],
    ['Kendrick Perkins', 'C', '43', 77, 'rim'],
    ['James Posey', 'SF', '41', 76, 'threeD'],
    ['Eddie House', 'PG', '50', 74, 'shooter'],
    ['Leon Powe', 'PF', '0', 72, 'post'],
    ['P.J. Brown', 'C', '93', 72, 'rim'],
  ]),
  team('lal08', "'08 Lakers", 'Los Angeles Lakers', '2007-08', 'LAL', '#552583', '#FDB927', [
    ['Derek Fisher', 'PG', '2', 77, 'shooter'],
    ['Kobe Bryant', 'SG', '24', 97, 'star', { mid: 97, inside: 94, three: 85, ft: 90, handle: 94, perD: 90 }],
    ['Vladimir Radmanovic', 'SF', '4', 74, 'stretch'],
    ['Pau Gasol', 'PF', '16', 88, 'post', { mid: 84, pass: 82, h: 84 }],
    ['Andrew Bynum', 'C', '17', 80, 'rim', { inside: 84, h: 84 }],
    ['Lamar Odom', 'PF', '7', 84, 'twoWayF', { pass: 82, handle: 76, reb: 88 }],
    ['Jordan Farmar', 'PG', '1', 74, 'playmaker'],
    ['Sasha Vujacic', 'SG', '18', 74, 'shooter'],
    ['Ronny Turiaf', 'PF', '21', 72, 'rim'],
  ]),
  team('mia13', "'13 Heat", 'Miami Heat', '2012-13', 'MIA', '#98002E', '#F9A01B', [
    ['Mario Chalmers', 'PG', '15', 77, 'shooter'],
    ['Dwyane Wade', 'SG', '3', 91, 'slasher', { inside: 96, block: 72, steal: 85, three: 60 }],
    ['LeBron James', 'SF', '6', 98, 'star', { inside: 98, pass: 94, strength: 95, speed: 94, perD: 94, three: 82, reb: 86, h: 80 }],
    ['Chris Bosh', 'PF', '1', 88, 'stretch', { mid: 88, three: 74, block: 76, h: 83 }],
    ['Udonis Haslem', 'PF', '40', 74, 'twoWayF'],
    ['Ray Allen', 'SG', '34', 82, 'shooter', { three: 93, ft: 92 }],
    ['Shane Battier', 'SF', '31', 77, 'threeD', { three: 82 }],
    ['Chris Andersen', 'C', '11', 76, 'rim'],
    ['Mike Miller', 'SF', '13', 73, 'shooter'],
    ['Norris Cole', 'PG', '30', 72, 'playmaker'],
  ]),
  team('gsw14', "'14 Warriors", 'Golden State Warriors', '2013-14', 'GSW', '#1D428A', '#FFC72C', [
    ['Stephen Curry', 'PG', '30', 93, 'playmaker', { three: 97, ft: 92, handle: 95, mid: 90 }],
    ['Klay Thompson', 'SG', '11', 86, 'shooter', { three: 92, perD: 84, h: 79 }],
    ['Andre Iguodala', 'SF', '9', 83, 'threeD', { perD: 90, pass: 82, steal: 86 }],
    ['David Lee', 'PF', '10', 82, 'post', { reb: 86, pass: 74 }],
    ['Andrew Bogut', 'C', '12', 82, 'rim', { pass: 72, block: 86, h: 84 }],
    ['Draymond Green', 'PF', '23', 78, 'twoWayF', { pass: 80, perD: 85, h: 79 }],
    ['Harrison Barnes', 'SF', '40', 77, 'twoWayF'],
    ['Steve Blake', 'PG', '25', 72, 'shooter'],
    ["Jermaine O'Neal", 'C', '7', 74, 'post'],
  ]),
  team('gsw17', "'17 Warriors", 'Golden State Warriors', '2016-17', 'GSW', '#1D428A', '#FFC72C', [
    ['Stephen Curry', 'PG', '30', 96, 'playmaker', { three: 99, ft: 95, handle: 98, mid: 93 }],
    ['Klay Thompson', 'SG', '11', 90, 'shooter', { three: 95, perD: 87, h: 79 }],
    ['Kevin Durant', 'SF', '35', 97, 'star', { mid: 98, three: 90, ft: 89, block: 78, h: 82 }],
    ['Draymond Green', 'PF', '23', 88, 'twoWayF', { pass: 90, perD: 92, intD: 92, steal: 88, h: 79 }],
    ['Zaza Pachulia', 'C', '27', 76, 'rim'],
    ['Andre Iguodala', 'SF', '9', 82, 'threeD', { perD: 88, pass: 82 }],
    ['Shaun Livingston', 'PG', '34', 77, 'playmaker', { mid: 84, three: 40 }],
    ['JaVale McGee', 'C', '1', 77, 'rim', { block: 86, h: 84 }],
    ['David West', 'PF', '3', 76, 'post', { mid: 82 }],
    ['Ian Clark', 'SG', '21', 73, 'shooter'],
  ]),
];

export const ALL_PLAYERS: PlayerDef[] = TEAMS.flatMap((t) => t.players);

export function playerById(id: string): PlayerDef | undefined {
  return ALL_PLAYERS.find((p) => p.id === id);
}
