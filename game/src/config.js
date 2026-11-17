// config.js — the city's facts: geometry, districts, car archetypes, the
// NET roster (every pursuer type and how it behaves), the street-mod
// draft pool, difficulties and the dusk palette. Pure data, no logic.

export const VIEW_W = 1280;
export const VIEW_H = 720;

// Streets run on a grid: vertical streets at x = i*PITCH, horizontal at
// y = j*PITCH, each ROAD_W wide. Blocks between streets hold buildings.
export const PITCH = 320;
export const ROAD_W = 96;
export const GRID_X = 12; // vertical streets
export const GRID_Y = 9;  // horizontal streets
export const WORLD_W = GRID_X * PITCH; // 3840
export const WORLD_H = GRID_Y * PITCH; // 2880

export const DISTRICTS = [
  { name: 'PORTSIDE', sub: 'docks & cranes', tint: '#1d3a4a', accent: '#57c7d4' },
  { name: 'OLD MARKET', sub: 'stalls & alleys', tint: '#3a2c1c', accent: '#e8a34c' },
  { name: 'NEON STRIP', sub: 'clubs & signs', tint: '#33183d', accent: '#ff5fa2' },
  { name: 'PALM HEIGHTS', sub: 'villas & palms', tint: '#1e3a24', accent: '#7ed492' },
  { name: 'UNIVERSITY HILL', sub: 'halls & lawns', tint: '#27354d', accent: '#8fb4ff' },
  { name: 'FOUNDRY ROW', sub: 'mills & yards', tint: '#3d2320', accent: '#ff7a59' },
];

// District of a world point: 3 columns x 2 rows over the world.
// Clamped: a car shoved out of bounds by a collision still names a district.
export function districtAt(x, y) {
  const cx = Math.max(0, Math.min(2, Math.floor(x / (WORLD_W / 3))));
  const cy = Math.max(0, Math.min(1, Math.floor(y / (WORLD_H / 2))));
  return DISTRICTS[cy * 3 + cx];
}

export const CAR_TYPES = [
  { kind: 'taxi', label: 'Cab', color: '#e8b73c', speed: 215, accel: 250, grip: 3.4, hull: 90, weight: 1.0 },
  { kind: 'sedan', label: 'Sedan', color: '#7d8aa0', speed: 225, accel: 255, grip: 3.6, hull: 100, weight: 1.0 },
  { kind: 'coupe', label: 'Coupe', color: '#c94f6d', speed: 265, accel: 310, grip: 3.9, hull: 80, weight: 0.9 },
  { kind: 'muscle', label: 'Muscle', color: '#d4692e', speed: 285, accel: 350, grip: 3.0, hull: 110, weight: 1.15 },
  { kind: 'van', label: 'Van', color: '#9aa38f', speed: 195, accel: 225, grip: 3.1, hull: 140, weight: 1.3 },
  { kind: 'truck', label: 'Pickup', color: '#5f7f5a', speed: 205, accel: 235, grip: 3.2, hull: 130, weight: 1.25 },
  { kind: 'compact', label: 'Compact', color: '#4fa8c9', speed: 235, accel: 285, grip: 4.1, hull: 70, weight: 0.85 },
];

// The NET roster — the six pursuer types of Commissioner Dray's private
// dragnet, each with one behaviour line for the title screen and the AI
// numbers police.js runs on.
export const UNIT_TYPES = {
  cruiser: {
    label: 'NET CRUISER', line: 'Works Dray\u2019s grid; chases what it sees and pins slow cars.',
    color: '#dfe6ee', speed: 252, accel: 300, grip: 3.8, hull: 130,
  },
  interceptor: {
    label: 'INTERCEPTOR', line: 'Fast pursuit coupe; leads your line and rams to spin you out.',
    color: '#2b3442', speed: 305, accel: 380, grip: 4.2, hull: 110,
  },
  detective: {
    label: 'TAIL CAR', line: 'Unmarked sedan; shadows you at a distance and holds the Net at one ring.',
    color: '#4a4238', speed: 240, accel: 280, grip: 3.6, hull: 100,
  },
  roadblock: {
    label: 'GATE CREW', line: 'Seals an intersection shut at four rings, cones and light bars out.',
    color: '#dfe6ee', speed: 0, accel: 0, grip: 0, hull: 200,
  },
  spikevan: {
    label: 'SPIKE VAN', line: 'Runs your route ahead of you and lays strips that pop tyres.',
    color: '#8a8f7d', speed: 235, accel: 260, grip: 3.3, hull: 140,
  },
  footpatrol: {
    label: 'FOOT CREW', line: 'Dray\u2019s crews on foot; they grab you if you linger close on foot.',
    color: '#31435f', speed: 148, accel: 0, grip: 0, hull: 60,
  },
};

// How many of each unit the city fields per ring level (index = rings).
export const HEAT_TABLE = [
  { cruiser: 0, detective: 0, interceptor: 0, spikevan: 0, roadblock: 0, footpatrol: 2 },
  { cruiser: 2, detective: 0, interceptor: 0, spikevan: 0, roadblock: 0, footpatrol: 2 },
  { cruiser: 3, detective: 1, interceptor: 0, spikevan: 0, roadblock: 0, footpatrol: 3 },
  { cruiser: 3, detective: 1, interceptor: 2, spikevan: 0, roadblock: 0, footpatrol: 3 },
  { cruiser: 4, detective: 1, interceptor: 2, spikevan: 1, roadblock: 2, footpatrol: 4 },
  { cruiser: 4, detective: 1, interceptor: 3, spikevan: 1, roadblock: 3, footpatrol: 4 },
];

// Street mods — the safehouse draft pool. Every effect is real and wired
// into the systems named in `line`.
export const MODS = [
  { id: 'nitro', name: 'NITRO TANKS', line: 'Hold SHIFT in a car for a boost burst. Recharges as you drive.' },
  { id: 'ghost', name: 'GHOST PLATES', line: 'Witnessed crimes add 30% less heat.' },
  { id: 'bumper', name: 'REINFORCED BUMPER', line: 'Your rams hit harder; your car keeps 40% more speed in crashes.' },
  { id: 'jammer', name: 'RADAR JAMMER', line: 'Heat drains 60% faster once no unit has eyes on you.' },
  { id: 'runflat', name: 'RUN-FLAT TYRES', line: 'Spike strips cannot pop your tyres.' },
  { id: 'magnet', name: 'CASH MAGNET', line: 'Cash pickups pull in from twice as far.' },
  { id: 'slick', name: 'SLICK PAINT', line: 'Units lose your trail sooner; the pin meter fills 35% slower.' },
  { id: 'adrenaline', name: 'ADRENALINE', line: 'On foot you sprint faster and hotwire twice as fast.' },
  { id: 'decoy', name: 'DECOY FLARES', line: 'Press F: units chase a flare point for 5 s. Two charges a stage.' },
];

export const DIFFICULTIES = [
  { id: 'cruise', name: 'CRUISE', heatGain: 0.75, heatDecay: 1.3, payMult: 0.8, line: 'A cooler city. Learn the streets.' },
  { id: 'hot', name: 'HOT', heatGain: 1.0, heatDecay: 1.0, payMult: 1.0, line: 'The city as it is. The intended run.' },
  { id: 'inferno', name: 'INFERNO', heatGain: 1.3, heatDecay: 0.8, payMult: 1.35, line: 'Every corner watched. Bigger money.' },
];

// Names for clients, packages and callouts — all invented for this game.
export const CLIENT_NAMES = [
  'a drummer late for her own gig', 'a chef carrying a wedding cake',
  'a jeweller with a heavy briefcase', 'a sprinter with a sprained ankle',
  'a magician who lost his rabbit', 'a bride in full dress',
  'a reporter chasing a source', 'a violinist and her violin',
  'a surgeon between hospitals', 'a poet who bet on a deadline',
  'a goalkeeper before the derby', 'a grandmother with lottery gold',
];
export const PACKAGE_NAMES = [
  'crated vinyl pressings', 'a sealed ballot box', 'cold-chain medicine',
  'stage costumes', 'a prototype drone', 'rare seed stock',
  'restored film reels', 'a champion tortoise', 'signed first editions',
  'ceremonial masks', 'a telescope mirror', 'vintage racing leathers',
  'a wedding arch', 'emergency beacons', 'the Commissioner\u2019s Ledger',
];

export const PALETTE = {
  sky: '#0d1026',
  road: '#23232e',
  roadEdge: '#33333f',
  lane: '#c8b269',
  sidewalk: '#3a3a46',
  grass: '#1d3320',
  water: '#12303e',
  sand: '#4a3f2a',
};
