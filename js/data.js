// All game content: heroes (+ specs), items, relics, mobs, bosses, events, economy.
// "mods" is the shared vocabulary read by run.js (stats) and sim.js (combat hooks). See CLAUDE.md for the full list.
(function (G) {
  const B = G.B = G.B || {};

  // ---------------------------------------------------------------- economy / pacing
  B.CFG = {
    startGold: 10, maxTeam: 3, heroCost: 7, reroll: 2,
    itemCost: { common: 3, uncommon: 4, rare: 5, epic: 8, set: 7, legendary: 10, mythic: 13 }, relicCost: 8,
    gold: { easy: 6, medium: 9, hard: 13, boss: 16 },
    xpLevels: [0, 0, 30, 85, 180, 330], // cumulative XP to reach level N (index = level); 1 XP per second alive
    maxLevel: 5, baseSlots: 1,          // item slots: 1 at Lv1-2, +1 at Lv3, Lv4, Lv5
    // by fight number (1..8). Review #22: 8 fights, bosses at 4 and 8 keep the strength they had at 3 and 6 (1.3, 2)
    fightScale: [1, 0.9, 1.0, 1.15, 1.55, 1.6, 1.8, 2.0, 2.45],
    firstFight: 0.5,  // review #22: the first fight is fought by a single hero: half the usual enemy budget
    suddenDeath: 45, fightCap: 150,     // seconds
    suddenDeathRamp: 0.01,              // review #24: sudden death burns every unit for 1%, 2%, 3%... of max HP per second
    // node sequence: F = fight (2 of easy/medium/hard), X = shop or event (2 options), B = boss (no option),
    // S = final shop choice (2 shops), G = the PvP gauntlet against player ghosts (review #9 removed the Onslaught)
    // Review #22 (David): the run starts with 1 hero and 1 relic, and each boss gets 1 more fight and 1 more shop/event
    seq: ['F', 'X', 'F', 'X', 'F', 'X', 'B', 'X', 'F', 'X', 'F', 'X', 'F', 'X', 'B', 'S', 'G'],
    startHeroes: 1, startOffer: 3,
  };

  // ---------------------------------------------------------------- heroes
  // base stats at level 1. as = attacks/sec, ms = hexes/sec, mana = max mana, m0 = starting mana
  const H = (o) => o;
  B.HEROES = {
    bastion: H({ name: 'Aegir', glyph: '🛡', role: 'Tank', color: '#4f7cff',
      hp: 950, atk: 45, armor: 45, mr: 30, as: 0.65, range: 1, ms: 2, mana: 90, m0: 30,
      abil: 'bulwark', abName: 'Stoneward', abDesc: 'Raises a stone ward: a shield of 33% of his max HP. Taunts enemies within 2 hexes for 2.5s.',
      ab: { shield: 0.33, radius: 2, taunt: 2.5, allyShield: 0, burst: 0, stun: 0 },
      specs: [
        [{ id: 'bas2a', name: 'Iron Hide', desc: '+15 armor and MR, then +1 more every second in combat (up to +25).', mods: { armor: 15, mr: 15, rampArmor: 1, rampArmorCap: 25 } },
         { id: 'bas2b', name: 'Spiked Plates', desc: 'Reflects 30% of damage taken back to melee attackers.', mods: { thorns: 0.3 } }],
        [{ id: 'bas3a', name: 'Shoulder to Shoulder', desc: 'Stoneward also shields allies within 2 hexes for half the amount.', ab: { allyShield: 0.5 } },
         { id: 'bas3b', name: 'Wide Taunt', desc: 'Taunt radius +1 and lasts 1s longer.', ab: { radius: 1, taunt: 1 } }],
        [{ id: 'bas4a', name: 'Unbroken', desc: 'Once per fight, dropping below 30% HP makes Aegir invulnerable for 2s and casts Stoneward.', fl: ['laststand'] },
         { id: 'bas4b', name: 'Shield Burst', desc: 'Casting Stoneward deals magic damage equal to 60% of the shield to adjacent enemies.', ab: { burst: 0.6 } }],
        [{ id: 'bas5a', name: 'Fortress', desc: 'Shield is 66% max HP. +20% max HP.', ab: { shield: 0.33 }, mods: { hpPct: 0.2 } },
         { id: 'bas5b', name: 'Tremor', desc: 'Taunted enemies are also stunned for 1.2s.', ab: { stun: 1.2 } }],
      ] }),
    vex: H({ name: 'Vex', glyph: '🗡', role: 'Assassin', color: '#a05cff',
      hp: 560, atk: 72, armor: 20, mr: 20, as: 0.95, range: 1, ms: 3, mana: 60, m0: 40, crit: 0.2,
      abil: 'shadowstep', abName: 'Veilstrike', abDesc: 'Blinks next to the weakest enemy and strikes for 300% AD physical damage.',
      ab: { dmg: 3, twin: 0, execute: 0, untarg: 0, mark: 0 },
      specs: [
        [{ id: 'vex2a', name: 'Ambush', desc: 'Veilstrike always critically strikes.', fl: ['ambush'] },
         { id: 'vex2b', name: 'Venom Edge', desc: 'Attacks poison for 2% max HP per second (3s).', mods: { poisonOnHit: 0.02 } }],
        [{ id: 'vex3a', name: 'Twin Step', desc: 'Veilstrike also strikes a second nearby enemy for 60% of the damage.', ab: { twin: 0.6 } },
         { id: 'vex3b', name: 'Smoke Veil', desc: 'Untargetable for 1.5s after Veilstrike.', ab: { untarg: 1.5 } }],
        [{ id: 'vex4a', name: 'Executioner', desc: 'Veilstrike kills enemies left below 20% HP.', ab: { execute: 0.2 } },
         { id: 'vex4b', name: 'Red Surge', desc: 'On kill: refill 60% mana and +30% attack speed for 3s.', fl: ['bloodrush'] }],
        [{ id: 'vex5a', name: 'Marked for Ruin', desc: 'Veilstrike target takes +25% damage from all sources for 5s.', ab: { mark: 0.25 } },
         { id: 'vex5b', name: 'Phantom', desc: '+25% dodge and +1 move speed.', mods: { dodge: 0.25, ms: 1 } }],
      ] }),
    pyra: H({ name: 'Feuer', glyph: '🔥', role: 'Mage', color: '#ff7a3d',
      hp: 735, atk: 56, armor: 15, mr: 30, as: 0.75, range: 3, ms: 2, mana: 50, m0: 20,
      abil: 'fireball', abName: 'Cinder Comet', abDesc: 'Hurls a comet at the densest enemy group: 95% AP magic damage in 1 hex, and a burn of 14% AP per second for 3s.',
      ab: { dmg: 0.95, radius: 1, burn: 0.14, twin: 0, stun: 0, patch: 0 },
      specs: [
        [{ id: 'pyr2a', name: 'Kindling', desc: 'Burn damage doubled.', ab: { burn: 0.14 } },
         { id: 'pyr2b', name: 'Quick Cast', desc: '-20 max mana, and +3 AP per attack.', mods: { manaMax: -20, apPerAtk: 3 } }],
        [{ id: 'pyr3a', name: 'Big Bang', desc: 'Cinder Comet radius +1.', ab: { radius: 1 } },
         { id: 'pyr3b', name: 'Twin Flame', desc: 'A second comet hits another group for 50% of the damage.', ab: { twin: 0.5 } }],
        [{ id: 'pyr4a', name: 'Scorched Earth', desc: 'Leaves burning ground for 3s: 16% AP magic damage per second to enemies on it.', ab: { patch: 3 } },
         { id: 'pyr4b', name: 'Flashpoint', desc: 'Burning enemies explode on death: 24% AP magic damage in 1 hex.', fl: ['combustion'] }],
        [{ id: 'pyr5a', name: 'Meteor', desc: '+80% Cinder Comet damage and it stuns for 1s.', ab: { dmg: 0.76, stun: 1 } },
         { id: 'pyr5b', name: 'Rekindle', desc: 'Once per fight, revives at 40% HP after dying.', mods: { revive: 0.4 } }],
      ] }),
    glacia: H({ name: 'Frostbane', glyph: '❄', role: 'Controller', color: '#5fd4ff',
      hp: 810, atk: 54, armor: 20, mr: 35, as: 0.7, range: 3, ms: 2, mana: 53, m0: 30,
      abil: 'blizzard', abName: 'Rime Squall', abDesc: 'Freezes the densest enemy group for 1.5s with 70% AP magic damage, then slows them by 40% for 2s.',
      ab: { dmg: 0.7, radius: 1, freeze: 1.5, slow: 0.4, shatter: 0, iceArmor: 0 },
      specs: [
        [{ id: 'gla2a', name: 'Deep Chill', desc: 'Freeze lasts 0.7s longer.', ab: { freeze: 0.7 } },
         { id: 'gla2b', name: 'Cold Hands', desc: 'Attacks slow by 25% for 1.5s.', mods: { slowOnHit: 0.25 } }],
        [{ id: 'gla3a', name: 'Whiteout', desc: 'Rime Squall radius +1.', ab: { radius: 1 } },
         { id: 'gla3b', name: 'Shatter', desc: 'Frozen enemies take +30% damage.', ab: { shatter: 0.3 } }],
        [{ id: 'gla4a', name: 'Frost Mantle', desc: 'Casting shields Frostbane and the weakest ally for 25% max HP.', ab: { iceArmor: 0.25 } },
         { id: 'gla4b', name: 'Frostbite', desc: 'Rime Squall deals double damage.', ab: { dmg: 0.7 } }],
        [{ id: 'gla5a', name: 'Absolute Zero', desc: 'Freeze +1s and radius +1.', ab: { freeze: 1, radius: 1 } },
         { id: 'gla5b', name: 'Glacial Prison', desc: 'At fight start, freezes the toughest enemy for 3s.', fl: ['prison'] }],
      ] }),
    brakk: H({ name: 'Ironhorn', glyph: '🐗', role: 'Bruiser', color: '#c4513a',
      hp: 680, atk: 50, armor: 30, mr: 20, as: 0.8, range: 1, ms: 2.5, mana: 84, m0: 50, ls: 0.1,
      abil: 'charge', abName: 'Ramming Charge', abDesc: 'Charges the farthest enemy within 4 hexes: 150% AD physical damage and a 1s stun to adjacent enemies, and gains 30% lifesteal for 4s.',
      ab: { dmg: 1.5, stun: 1, lsBuff: 0.3, frenzy: 0, sunder: 0, reach: 4 },
      specs: [
        [{ id: 'bra2a', name: 'Red Hunger', desc: '+15% lifesteal.', mods: { ls: 0.15 } },
         { id: 'bra2b', name: 'Thick Hide', desc: '+150 max HP, then +1% max HP every second in combat (up to +25%).', mods: { hp: 150, rampHpPct: 0.01, rampHpPctCap: 0.25 } }],
        [{ id: 'bra3a', name: 'Stampede', desc: 'Ramming Charge stun +0.7s and reach +2.', ab: { stun: 0.7, reach: 2 } },
         { id: 'bra3b', name: 'Frenzy', desc: '+40% attack speed for 4s after charging.', ab: { frenzy: 0.4 } }],
        [{ id: 'bra4a', name: 'Rampage', desc: 'Kills refund 50% mana.', fl: ['rampage'] },
         { id: 'bra4b', name: 'Gore', desc: 'Ramming Charge deals double damage and shreds 25 armor for 5s.', ab: { dmg: 1.5, sunder: 25 } }],
        [{ id: 'bra5a', name: 'Iron Bull', desc: 'Immune to crowd control while above 50% HP.', fl: ['juggernaut'] },
         { id: 'bra5b', name: 'Warlord', desc: 'Adjacent allies gain +20% attack.', mods: { aura: [{ r: 1, stat: 'atkPct', val: 0.2 }] } }],
      ] }),
    lumen: H({ name: 'Solace', glyph: '✚', role: 'Healer', color: '#ffe066',
      hp: 515, atk: 28, armor: 20, mr: 30, as: 0.7, range: 3, ms: 2, mana: 82, m0: 25,
      abil: 'radiance', abName: 'Dawnmend', abDesc: 'Heals the weakest ally for 245% AP and allies next to them for 105% AP.',
      ab: { heal: 2.45, splash: 1.05, radius: 1, shield: 0, regen: 0, smite: 0, cleanse: 0 },
      specs: [
        [{ id: 'lum2a', name: 'Purify', desc: 'Dawnmend also removes stun, slow, root and silence.', ab: { cleanse: 1 } },
         { id: 'lum2b', name: 'Swift Prayer', desc: '-20 max mana.', mods: { manaMax: -20 } }],
        [{ id: 'lum3a', name: 'Sanctuary', desc: 'Splash radius +1 and the splash heals 70% AP more.', ab: { radius: 1, splash: 0.7 } },
         { id: 'lum3b', name: 'Aegis Light', desc: 'Dawnmend also shields the target for 15% max HP.', ab: { shield: 0.15 } }],
        [{ id: 'lum4a', name: 'Rebuke', desc: 'Attacks deal an extra 50% AD as magic damage; Dawnmend also strikes the nearest enemy for 60% AP magic damage.', mods: { onHitMagic: 0.5 }, ab: { smite: 0.6 } },
         { id: 'lum4b', name: 'Renewal', desc: 'Dawnmend leaves 3% max HP regen per second for 5s.', ab: { regen: 0.03 } }],
        [{ id: 'lum5a', name: 'Resurrection', desc: 'Once per fight, revives the first fallen ally at 50% HP.', fl: ['resurrect'] },
         { id: 'lum5b', name: 'Hallowed Aura', desc: 'All allies gain +15 armor and magic resist.', mods: { aura: [{ r: 9, stat: 'armor', val: 15 }, { r: 9, stat: 'mr', val: 15 }] } }],
      ] }),
    kestrel: H({ name: 'Talon', glyph: '🏹', role: 'Ranger', color: '#7bd66b',
      hp: 450, atk: 50, armor: 15, mr: 15, as: 0.9, range: 4, ms: 2, mana: 69, m0: 0,
      abil: 'volley', abName: 'Volley', abDesc: 'Passive (Focus): each attack gives +3% attack speed (stacks 15x). Active: fires 5 arrows at random enemies, 100% AD physical damage each.',
      ab: { count: 5, dmg: 1, all: 0, pierce: 0, focus: 0.03, focusCap: 15 },
      specs: [
        [{ id: 'kes2a', name: 'Keen Eye', desc: '+1 range and +10% crit chance.', mods: { range: 1, crit: 0.1 } },
         { id: 'kes2b', name: 'Barbed Arrows', desc: 'Attacks poison for 1.5% max HP per second.', mods: { poisonOnHit: 0.015 } }],
        [{ id: 'kes3a', name: 'Split Nock', desc: 'Attacks hit a second target for 50%.', mods: { multishot: 0.5 } },
         { id: 'kes3b', name: 'Full Quiver', desc: 'Volley fires 3 more arrows.', ab: { count: 3 } }],
        [{ id: 'kes4a', name: 'Sniper', desc: '+8% damage per hex of distance to the target.', fl: ['sniper'] },
         { id: 'kes4b', name: 'Rapid Fire', desc: 'Focus gives twice as much and stacks 30x.', ab: { focus: 0.03, focusCap: 15 } }],
        [{ id: 'kes5a', name: 'Rain of Arrows', desc: 'Volley hits every enemy.', ab: { all: 1 } },
         { id: 'kes5b', name: 'Piercing Shots', desc: 'Ignore 50% armor, +50% crit damage.', mods: { armorPen: 0.5, critDmg: 0.5 } }],
      ] }),
    morrow: H({ name: 'Graveborn', glyph: '💀', role: 'Summoner', color: '#9aa3b5',
      hp: 475, atk: 30, armor: 20, mr: 30, as: 0.7, range: 3, ms: 2, mana: 85, m0: 40,
      abil: 'raise', abName: 'Bone Call', abDesc: 'Raises 2 skeleton warriors next to Graveborn, each with 300% AP as HP and 30% AP as attack.',
      ab: { count: 2, hpMul: 1, archers: 0, explode: 0, colossus: 0 },
      specs: [
        [{ id: 'mor2a', name: 'Ribcage Plating', desc: 'Skeletons have +50% HP.', ab: { hpMul: 0.5 } },
         { id: 'mor2b', name: 'Graveside Oath', desc: 'Gains 15 mana whenever an enemy dies within 3 hexes.', fl: ['gravepact'] }],
        [{ id: 'mor3a', name: 'Legion', desc: 'Raises one more skeleton.', ab: { count: 1 } },
         { id: 'mor3b', name: 'Bone Archers', desc: 'Skeletons are archers (range 3) with 30% less HP.', ab: { archers: 1 } }],
        [{ id: 'mor4a', name: 'Bursting Bones', desc: 'Skeletons explode on death: 35% AP magic damage in 1 hex.', ab: { explode: 0.35 } },
         { id: 'mor4b', name: 'Reaping Tithe', desc: 'Heals 5% max HP whenever any unit dies.', fl: ['soulharvest'] }],
        [{ id: 'mor5a', name: 'Bone Colossus', desc: 'Raises one giant skeleton instead (4x HP, 2x attack, taunts).', ab: { colossus: 1 } },
         { id: 'mor5b', name: 'Deathless Shape', desc: '+50 AP and attacks splash 30%.', mods: { ap: 50, splash: 0.3 } }],
      ] }),
    tempest: H({ name: 'Tempest', glyph: '⚡', role: 'Mage', color: '#b9a8ff',
      hp: 660, atk: 52, armor: 15, mr: 30, as: 0.8, range: 3, ms: 2, mana: 54, m0: 30,
      abil: 'chain', abName: 'Arc Cascade', abDesc: 'Lightning bounces between 4 enemies: 90% AP magic damage each (10% less per bounce), stunning each for 0.4s.',
      ab: { bounces: 4, dmg: 0.9, stun: 0.4, falloff: 0.1, twice: 0 },
      specs: [
        [{ id: 'tem2a', name: 'Overcharge', desc: 'Arc Cascade bounces 2 more times.', ab: { bounces: 2 } },
         { id: 'tem2b', name: 'Static', desc: 'Every 4th attack arcs to 2 more enemies for 60%.', mods: { chainEvery: 4, chainTargets: 2, chainDmg: 0.6 } }],
        [{ id: 'tem3a', name: 'Conductor', desc: 'Arc Cascade stun lasts 1s.', ab: { stun: 0.6 } },
         { id: 'tem3b', name: 'Capacitor', desc: 'Starts every fight with full mana.', mods: { manaStart: 999 } }],
        [{ id: 'tem4a', name: 'Storm Surge', desc: 'Casting gives allies within 2 hexes +30% attack speed for 4s.', fl: ['surge'] },
         { id: 'tem4b', name: 'Arc Flash', desc: 'No damage falloff and +40% Arc Cascade damage.', ab: { falloff: -0.1, dmg: 0.36 } }],
        [{ id: 'tem5a', name: 'Skyfall Bolts', desc: 'Every 3s a bolt strikes a random enemy for 40% AP magic damage.', fl: ['thunderstorm'] },
         { id: 'tem5b', name: 'Twin Cascade', desc: 'Arc Cascade is cast twice.', ab: { twice: 1 } }],
      ] }),
    grimhook: H({ name: 'Hookjaw', glyph: '⚓', role: 'Controller', color: '#2fb3a0',
      hp: 925, atk: 62, armor: 35, mr: 30, as: 0.75, range: 1, ms: 2, mana: 64, m0: 30,
      abil: 'hook', abName: 'Hook', abDesc: 'Hooks the farthest enemy within 5 hexes and drags it next to Hookjaw: 120% AD physical damage and a 1.5s stun.',
      ab: { reach: 5, dmg: 1.2, stun: 1.5, count: 1, vuln: 0, whirl: 0, pullAll: 0 },
      specs: [
        [{ id: 'gri2a', name: 'Barbed Chain', desc: 'Hook deals double damage, and his attacks poison for 1% max HP per second.', ab: { dmg: 1.2 }, mods: { poisonOnHit: 0.01 } },
         { id: 'gri2b', name: 'Long Chain', desc: 'Hook reach +3.', ab: { reach: 3 } }],
        [{ id: 'gri3a', name: 'Double Hook', desc: 'Pulls two enemies.', ab: { count: 1 } },
         { id: 'gri3b', name: 'Anchor', desc: '+300 max HP and +15 armor.', mods: { hp: 300, armor: 15 } }],
        [{ id: 'gri4a', name: 'Drag Under', desc: 'Hooked enemies take +30% damage for 4s.', ab: { vuln: 0.3 } },
         { id: 'gri4b', name: 'Chain Whirl', desc: 'After hooking, spins to hit all adjacent enemies for 100% AD physical damage and slow them 30% for 2s.', ab: { whirl: 1 } }],
        [{ id: 'gri5a', name: 'Dread Anchor', desc: 'Hook stun +1.5s.', ab: { stun: 1.5 } },
         { id: 'gri5b', name: 'Pull of the Deep', desc: 'Also drags every enemy within 3 hexes one step closer and stuns them 1s.', ab: { pullAll: 1 } }],
      ] }),
    mirage: H({ name: 'Mirage', glyph: '🎭', role: 'Trickster', color: '#ff6fb5',
      hp: 445, atk: 45, armor: 18, mr: 25, as: 0.9, range: 2, ms: 3, mana: 73, m0: 20, dodge: 0.15,
      abil: 'mirror', abName: 'Twinned Veil', abDesc: 'Creates 2 decoy clones with 40% of her HP, attack and armor, and blinks to the safest hex.',
      ab: { count: 2, stat: 0.4, explode: 0, backstab: 0, silence: 0 },
      specs: [
        [{ id: 'mir2a', name: 'Sharper Images', desc: 'Clones have 60% stats.', ab: { stat: 0.2 } },
         { id: 'mir2b', name: 'Evasion', desc: '+15% dodge.', mods: { dodge: 0.15 } }],
        [{ id: 'mir3a', name: 'Hall of Mirrors', desc: 'One more clone.', ab: { count: 1 } },
         { id: 'mir3b', name: 'Shatterglass', desc: 'Clones explode on death for 120% AD damage in 1 hex, and slow.', ab: { explode: 1.2 } }],
        [{ id: 'mir4a', name: 'Backstab', desc: 'The attack after casting deals triple damage.', ab: { backstab: 3 } },
         { id: 'mir4b', name: 'Confusion', desc: 'Enemies next to a new clone are silenced for 2s.', ab: { silence: 2 } }],
        [{ id: 'mir5a', name: 'Mass Illusion', desc: 'Clones have 80% stats.', ab: { stat: 0.4 } },
         { id: 'mir5b', name: 'Phase Shift', desc: 'Once per fight, lethal damage instead leaves Mirage untargetable for 2s and heals 30%.', fl: ['phaseshift'] }],
      ] }),
    rook: H({ name: 'Rivet', glyph: '⚙', role: 'Engineer', color: '#d9a441',
      hp: 590, atk: 40, armor: 25, mr: 20, as: 0.8, range: 2, ms: 2, mana: 74, m0: 50,
      abil: 'turret', abName: 'Clockwork Turret', abDesc: 'Builds a turret (range 3, 80% of his AD as attack) next to Rivet. Max 2; at max, repairs them instead.',
      ab: { max: 2, hpMul: 1, asMul: 1, burn: 0, stun: 0, mortar: 0 },
      specs: [
        [{ id: 'roo2a', name: 'Reinforced', desc: 'Turrets have double HP.', ab: { hpMul: 1 } },
         { id: 'roo2b', name: 'Rapid Fire', desc: 'Turrets attack 40% faster.', ab: { asMul: 0.4 } }],
        [{ id: 'roo3a', name: 'Flamethrower', desc: "Turret shots burn for 40% of the turret's AD per second.", ab: { burn: 0.4 } },
         { id: 'roo3b', name: 'Overclock', desc: 'Max turrets +1.', ab: { max: 1 } }],
        [{ id: 'roo4a', name: 'Spark Coil', desc: 'Every 3rd turret shot stuns for 0.6s.', ab: { stun: 0.6 } },
         { id: 'roo4b', name: 'Mortar', desc: 'Turrets get range 6 and splash, but shoot slower.', ab: { mortar: 1 } }],
        [{ id: 'roo5a', name: 'Mech Suit', desc: '+50% max HP, +30% attack, attacks cleave 40%.', mods: { hpPct: 0.5, atkPct: 0.3, splash: 0.4 } },
         { id: 'roo5b', name: 'Factory', desc: 'Starts each fight with a turret already built.', fl: ['factory'] }],
      ] }),
    // ---- v5 (review #2): heroes whose power grows during the fight (passive scaling, from the start or on upgrade)
    thorne: H({ name: 'Ravager', glyph: '🪓', role: 'Berserker', color: '#d4483b',
      hp: 875, atk: 58, armor: 25, mr: 20, as: 0.8, range: 1, ms: 2.5, mana: 62, m0: 20,
      mods: { stackAtk: 2, stackAtkCap: 25 },
      abil: 'whirl', abName: 'Crimson Spin', abDesc: 'Passive (Fury): +2 AD per hit (stacks 25x). Active: spins, hitting every adjacent enemy for 180% AD physical damage and healing 15% of the damage.',
      ab: { dmg: 1.8, heal: 0.15, radius: 1 },
      specs: [
        [{ id: 'thr2a', name: 'Scarred Hide', desc: '+150 max HP and +20 armor.', mods: { hp: 150, armor: 20 } },
         { id: 'thr2b', name: 'Unending Rage', desc: 'Fury stacks 15 more times.', mods: { stackAtkCap: 15 } }],
        [{ id: 'thr3a', name: 'Wide Swing', desc: 'The spin reaches 2 hexes.', ab: { radius: 1 } },
         { id: 'thr3b', name: 'Red Thirst', desc: 'The spin heals 20% more of its damage.', ab: { heal: 0.2 } }],
        [{ id: 'thr4a', name: 'Savage', desc: '+15% crit chance and +40% crit damage.', mods: { crit: 0.15, critDmg: 0.4 } },
         { id: 'thr4b', name: 'Momentum', desc: 'Each hit also gives +1% attack speed (up to +40%).', mods: { stackAs: 0.01, stackAsCap: 40 } }],
        [{ id: 'thr5a', name: 'Refusal to Fall', desc: 'Once per fight, lethal damage leaves Ravager at 1 HP and invulnerable for 2s.', fl: ['undying'] },
         { id: 'thr5b', name: 'Titan Swing', desc: 'The spin deals double damage.', ab: { dmg: 1.8 } }],
      ] }),
    seraph: H({ name: 'Radiant', glyph: '😇', role: 'Paladin', color: '#f0d27a',
      hp: 860, atk: 44, armor: 35, mr: 30, as: 0.7, range: 1, ms: 2, mana: 80, m0: 30,
      mods: { rampArmor: 2, rampArmorCap: 40 },
      abil: 'consecrate', abName: 'Hallowed Ground', abDesc: 'Passive: +2 armor and MR every second (up to +40). Active: hallows the ground around her for 4s: enemies on it take 30% AP magic damage per second, allies on it heal 3% of their max HP per second.',
      ab: { radius: 1, dur: 4, dps: 0.3, heal: 0.03, shield: 0 },
      specs: [
        [{ id: 'ser2a', name: 'Holy Plate', desc: '+20 armor.', mods: { armor: 20 } },
         { id: 'ser2b', name: 'Fervor', desc: '+15 attack.', mods: { atk: 15 } }],
        [{ id: 'ser3a', name: 'Sanctified Ground', desc: 'Hallowed Ground radius +1.', ab: { radius: 1 } },
         { id: 'ser3b', name: 'Mending Light', desc: 'Hallowed Ground heals twice as much.', ab: { heal: 0.03 } }],
        [{ id: 'ser4a', name: 'Sunward Guard', desc: 'Casting shields Radiant for 25% max HP.', ab: { shield: 0.25 } },
         { id: 'ser4b', name: 'Verdict', desc: 'Hallowed Ground burns twice as hard.', ab: { dps: 0.3 } }],
        [{ id: 'ser5a', name: 'Martyr', desc: 'Allies within 2 hexes gain +20 armor and MR.', mods: { aura: [{ r: 2, stat: 'armor', val: 20 }, { r: 2, stat: 'mr', val: 20 }] } },
         { id: 'ser5b', name: 'Ascension', desc: 'Her armor and MR keep growing up to +80.', mods: { rampArmorCap: 40 } }],
      ] }),
    nyx: H({ name: 'Nyx', glyph: '🌑', role: 'Hexblade', color: '#35c6d6',
      hp: 760, atk: 74, armor: 20, mr: 25, as: 0.9, range: 1, ms: 3, mana: 47, m0: 20,
      mods: { killAtk: 8, killAtkCap: 80 },
      abil: 'eclipse', abName: 'Umbral Edge', abDesc: 'Passive: +8 AD whenever an enemy dies within 3 hexes (up to +80). Active: her next 3 attacks deal an extra 100% AD as magic damage and heal her for 20% of it.',
      ab: { hits: 3, bonus: 1, heal: 0.2 },
      specs: [
        [{ id: 'nyx2a', name: 'Hunger', desc: 'Each nearby death gives +4 more attack.', mods: { killAtk: 4 } },
         { id: 'nyx2b', name: 'Shade Walk', desc: '+1 move speed and +10% dodge.', mods: { ms: 1, dodge: 0.1 } }],
        [{ id: 'nyx3a', name: 'Long Night', desc: 'Umbral Edge empowers 2 more attacks.', ab: { hits: 2 } },
         { id: 'nyx3b', name: 'Umbral Leech', desc: 'Umbral Edge heals 20% more.', ab: { heal: 0.2 } }],
        [{ id: 'nyx4a', name: 'Night Reaper', desc: 'Kills refund 50% mana.', fl: ['rampage'] },
         { id: 'nyx4b', name: 'Gloaming Blade', desc: '+20% crit chance.', mods: { crit: 0.2 } }],
        [{ id: 'nyx5a', name: 'Endless Night', desc: 'Her kill stacks can reach +160 attack.', mods: { killAtkCap: 80 } },
         { id: 'nyx5b', name: 'Void Burst', desc: 'Umbral Edge attacks deal +200% instead.', ab: { bonus: 1 } }],
      ] }),
    bramble: H({ name: 'Bramble', glyph: '🌳', role: 'Warden', color: '#6a9a3a',
      hp: 1210, atk: 51, armor: 35, mr: 25, as: 0.6, range: 1, ms: 1.8, mana: 74, m0: 30,
      mods: { rampHpPct: 0.01, rampHpPctCap: 0.4 },
      abil: 'entangle', abName: 'Rootsnare', abDesc: 'Passive: +1% max HP every second (up to +40%). Active: roots every enemy within 2 hexes for 2s and deals 45% AP magic damage.',
      ab: { radius: 2, root: 2, dmg: 0.45, shield: 0 },
      specs: [
        [{ id: 'brm2a', name: 'Thornbark', desc: 'Reflects 25% of melee damage taken.', mods: { thorns: 0.25 } },
         { id: 'brm2b', name: 'Moss Cover', desc: 'Regenerates 1% max HP per second.', mods: { regen: 0.01 } }],
        [{ id: 'brm3a', name: 'Wide Roots', desc: 'Rootsnare radius +1.', ab: { radius: 1 } },
         { id: 'brm3b', name: 'Strangle', desc: 'Roots last 1s longer.', ab: { root: 1 } }],
        [{ id: 'brm4a', name: 'Oakhide', desc: 'Casting shields Bramble for 30% max HP.', ab: { shield: 0.3 } },
         { id: 'brm4b', name: 'Toxic Thorns', desc: 'Rootsnare deals double damage.', ab: { dmg: 0.45 } }],
        [{ id: 'brm5a', name: 'Ancient', desc: 'Max HP keeps growing up to +80%.', mods: { rampHpPctCap: 0.4 } },
         { id: 'brm5b', name: 'Grove Guardian', desc: 'Adjacent allies gain +15 armor.', mods: { aura: [{ r: 1, stat: 'armor', val: 15 }] } }],
      ] }),
    echo: H({ name: 'Lyric', glyph: '🎻', role: 'Bard', color: '#c77dff',
      hp: 540, atk: 33, armor: 18, mr: 30, as: 0.75, range: 3, ms: 2, mana: 73, m0: 30,
      fl: ['crescendo'],
      abil: 'anthem', abName: 'Rallying Refrain', abDesc: 'Passive: every 4s all allies gain +3% attack speed (Crescendo, stacks 10x). Active: allies within 2 hexes heal 90% AP and gain +25% attack for 4s.',
      ab: { radius: 2, heal: 0.9, atk: 0.25, slow: 0, stun: 0 },
      specs: [
        [{ id: 'ech2a', name: 'Encore', desc: '-15 max mana.', mods: { manaMax: -15 } },
         { id: 'ech2b', name: 'Harmony', desc: 'Rallying Refrain heals 55% AP more.', ab: { heal: 0.55 } }],
        [{ id: 'ech3a', name: 'Power Chord', desc: 'Rallying Refrain gives +15% more attack.', ab: { atk: 0.15 } },
         { id: 'ech3b', name: 'Big Stage', desc: 'Rallying Refrain radius +1.', ab: { radius: 1 } }],
        [{ id: 'ech4a', name: 'Tempo', desc: 'Crescendo stacks 5 more times.', fl: ['tempo'] },
         { id: 'ech4b', name: 'Lullaby', desc: 'Rallying Refrain slows enemies within 2 hexes by 40% for 2s.', ab: { slow: 0.4 } }],
        [{ id: 'ech5a', name: 'Symphony', desc: 'Each Crescendo stack also gives +2 armor.', fl: ['symphony'] },
         { id: 'ech5b', name: 'Showstopper', desc: 'Rallying Refrain stuns adjacent enemies for 1s.', ab: { stun: 1 } }],
      ] }),
    blaze: H({ name: 'Flint', glyph: '🔫', role: 'Gunslinger', color: '#e08a3a',
      hp: 610, atk: 56, armor: 15, mr: 15, as: 0.95, range: 3, ms: 2.5, mana: 53, m0: 10, crit: 0.1,
      mods: { critStack: 0.02, critStackCap: 0.3 },
      abil: 'fan', abName: 'Six-Shot Flurry', abDesc: 'Passive: every crit gives +2% crit chance (up to +30%). Active: fires 6 quick shots at the target, 70% AD physical damage each.',
      ab: { shots: 6, dmg: 0.7, ricochet: 0, splash: 0, pen: 0 },
      specs: [
        [{ id: 'blz2a', name: 'Quickdraw', desc: '+20% attack speed.', mods: { asPct: 0.2 } },
         { id: 'blz2b', name: 'Hollow Points', desc: '+10 attack.', mods: { atk: 10 } }],
        [{ id: 'blz3a', name: 'Extra Mag', desc: 'Six-Shot Flurry fires 3 more shots.', ab: { shots: 3 } },
         { id: 'blz3b', name: 'Ricochet', desc: 'Each shot also hits another enemy for 50%.', ab: { ricochet: 0.5 } }],
        [{ id: 'blz4a', name: 'True Aim', desc: 'Crit stacks go up to +50%.', mods: { critStackCap: 0.2 } },
         { id: 'blz4b', name: 'Explosive Rounds', desc: 'Shots splash 30% to adjacent enemies.', ab: { splash: 0.3 } }],
        [{ id: 'blz5a', name: 'Sundown Duel', desc: 'Shots deal 50% more and ignore 30% armor.', ab: { dmg: 0.35, pen: 0.3 } },
         { id: 'blz5b', name: 'Gunslinger', desc: '+1 range and +40% crit damage.', mods: { range: 1, critDmg: 0.4 } }],
      ] }),
    // ---- v12 (review #11, David: "many more unique heroes, go wild")
    hippolyta: H({ name: 'Skara', glyph: '🔱', role: 'Amazon', color: '#c98a3a',
      hp: 510, atk: 41, armor: 22, mr: 20, as: 1.0, range: 2, ms: 2.5, mana: 73, m0: 10,
      mods: { stackAs: 0.04, stackAsCap: 10, poisonOnHit: 0.012 },
      abil: 'javelin', abName: 'Skyspear Barrage', abDesc: 'Passive: +4% attack speed per hit (10x) and her spear poisons. Active: hurls javelins at 3 enemies, 150% AD physical damage each, poisoning them for 2% of their max HP per second.',
      ab: { count: 3, dmg: 1.5, poison: 0.02, root: 0 },
      specs: [
        [{ id: 'hip2a', name: 'Spear Dance', desc: 'Attack speed stacks 10 more times.', mods: { stackAsCap: 10 } },
         { id: 'hip2b', name: 'Venom Tips', desc: 'Attacks poison 1% max HP per second more.', mods: { poisonOnHit: 0.01 } }],
        [{ id: 'hip3a', name: 'Volley of Spears', desc: 'Hurls 2 more javelins.', ab: { count: 2 } },
         { id: 'hip3b', name: 'Impale', desc: 'Javelins root for 1s.', ab: { root: 1 } }],
        [{ id: 'hip4a', name: 'Warrior Queen', desc: 'Allies within 2 hexes gain +15% attack speed.', mods: { aura: [{ r: 2, stat: 'asPct', val: 0.15 }] } },
         { id: 'hip4b', name: 'Fleet Foot', desc: '+1 move speed and +10% dodge.', mods: { ms: 1, dodge: 0.1 } }],
        [{ id: 'hip5a', name: 'Hydra Venom', desc: 'All her poisons deal double.', ab: { poison: 0.02 }, mods: { poisonOnHit: 0.012 } },
         { id: 'hip5b', name: 'Shieldmaiden', desc: '+25 attack and +1 range.', mods: { atk: 25, range: 1 } }],
      ] }),
    deadshot: H({ name: 'Deadeye', glyph: '🎯', role: 'Sniper', color: '#6a7a5a',
      hp: 530, atk: 97, armor: 12, mr: 12, as: 0.45, range: 7, ms: 1.8, mana: 64, m0: 20, crit: 0.2, fl: ['sniper'],
      abil: 'headshot', abName: 'Longwatch Round', abDesc: 'Passive: +8% damage per hex to the target. Active: aims at the weakest enemy anywhere and fires for 400% AD physical damage, executing it below 15% HP.',
      ab: { dmg: 4, shots: 1, stun: 0, camo: 0, exec: 0.15 },
      specs: [
        [{ id: 'dsh2a', name: 'Steady Aim', desc: '+15% crit chance.', mods: { crit: 0.15 } },
         { id: 'dsh2b', name: 'Hollow Point', desc: 'Longwatch Round deals 100% more.', ab: { dmg: 1 } }],
        [{ id: 'dsh3a', name: 'Double Tap', desc: 'Longwatch Round fires twice.', ab: { shots: 1 } },
         { id: 'dsh3b', name: 'Suppressing Fire', desc: 'Longwatch Round stuns for 1.5s.', ab: { stun: 1.5 } }],
        [{ id: 'dsh4a', name: 'Camouflage', desc: 'Untargetable for 2s after each Longwatch Round.', ab: { camo: 2 } },
         { id: 'dsh4b', name: 'Armor Piercing', desc: 'Ignores 50% armor.', mods: { armorPen: 0.5 } }],
        [{ id: 'dsh5a', name: 'One Shot', desc: 'Longwatch Round executes below 30% HP.', ab: { exec: 0.15 } },
         { id: 'dsh5b', name: 'Spotter', desc: '+10 mana per attack.', mods: { manaOnHit: 10 } }],
      ] }),
    vesper: H({ name: 'Vesper', glyph: '🧛', role: 'Vampire', color: '#8a1f3a',
      hp: 685, atk: 51, armor: 20, mr: 30, as: 0.85, range: 1, ms: 3, mana: 65, m0: 20, ls: 0.15,
      mods: { omni: 0.2 },
      abil: 'bloodfeast', abName: 'Crimson Draught', abDesc: 'Passive: abilities heal 20% of their damage. Active: drains every enemy within 2 hexes for 70% AD + 40% AP magic damage and heals for all of it.',
      ab: { radius: 2, dmg: 0.7, apdmg: 0.4, share: 0, bats: 0, bleed: 0 },
      specs: [
        [{ id: 'ves2a', name: 'Thirst', desc: '+10% lifesteal.', mods: { ls: 0.1 } },
         { id: 'ves2b', name: 'Night Cloak', desc: '+15% dodge.', mods: { dodge: 0.15 } }],
        [{ id: 'ves3a', name: 'Crimson Tide', desc: 'Crimson Draught radius +1.', ab: { radius: 1 } },
         { id: 'ves3b', name: 'Blood Bond', desc: 'Crimson Draught also heals allies within 2 hexes for 30% of the damage.', ab: { share: 0.3 } }],
        [{ id: 'ves4a', name: 'Bat Swarm', desc: 'Crimson Draught releases 2 bats.', ab: { bats: 2 } },
         { id: 'ves4b', name: 'Hemorrhage', desc: 'Drained enemies bleed for 2% max HP per second.', ab: { bleed: 0.02 } }],
        [{ id: 'ves5a', name: 'Elder Blood', desc: 'Once per fight, revives at 50% HP.', mods: { revive: 0.5 } },
         { id: 'ves5b', name: 'Sanguine Lord', desc: 'Crimson Draught deals double.', ab: { dmg: 0.7, apdmg: 0.4 } }],
      ] }),
    kage: H({ name: 'Eclipse', glyph: '🥷', role: 'Ninja', color: '#3a3f55',
      hp: 505, atk: 52, armor: 18, mr: 18, as: 1.1, range: 1, ms: 3.2, mana: 61, m0: 20, dodge: 0.2,
      abil: 'smoke', abName: 'Ashveil', abDesc: 'Blinds enemies within 1 hex for 1.5s (their attacks miss), vanishes for 1.5s and throws 4 shuriken, 90% AD physical damage each.',
      ab: { radius: 1, blind: 1.5, count: 4, dmg: 0.9, poison: 0, backstab: 0, heal: 0 },
      specs: [
        [{ id: 'kag2a', name: 'Kunai Rain', desc: 'Throws 2 more shuriken.', ab: { count: 2 } },
         { id: 'kag2b', name: 'Poisoned Stars', desc: 'Shuriken poison for 2% max HP per second.', ab: { poison: 0.02 } }],
        [{ id: 'kag3a', name: 'Thick Smoke', desc: 'Blind radius +1.', ab: { radius: 1 } },
         { id: 'kag3b', name: 'Assassinate', desc: 'The attack after the smoke deals 250%.', ab: { backstab: 2.5 } }],
        [{ id: 'kag4a', name: 'Shade Step', desc: '+1 move speed and +10% dodge.', mods: { ms: 1, dodge: 0.1 } },
         { id: 'kag4b', name: 'Gust Step', desc: 'The smoke heals Eclipse for 15% max HP.', ab: { heal: 0.15 } }],
        [{ id: 'kag5a', name: 'Twin Blades', desc: '+35% attack speed.', mods: { asPct: 0.35 } },
         { id: 'kag5b', name: 'Blossom of Blades', desc: 'Shuriken deal 80% more.', ab: { dmg: 0.72 } }],
      ] }),
    rex: H({ name: 'Fang', glyph: '🐕', role: 'Hound', color: '#a0703a',
      hp: 665, atk: 44, armor: 25, mr: 20, as: 1.2, range: 1, ms: 3.8, mana: 63, m0: 20, mods: { regen: 0.01 },
      abil: 'howl', abName: 'Howl & Pounce', abDesc: 'Passive: regenerates 1% HP per second. Active: allies within 3 hexes gain +20% attack and attack speed for 4s; Fang pounces on the nearest enemy and bites for 150% AD physical damage plus a bleed of 2% max HP per second for 3s.',
      ab: { radius: 3, buff: 0.2, dmg: 1.5, bleed: 0.02, stun: 0, taunt: 0, reach: 0, cleave: 0 },
      specs: [
        [{ id: 'rex2a', name: 'Good Boy', desc: '+200 max HP.', mods: { hp: 200 } },
         { id: 'rex2b', name: 'Sharp Teeth', desc: 'Attacks bleed for 1.5% max HP per second.', mods: { poisonOnHit: 0.015 } }],
        [{ id: 'rex3a', name: 'Pack Leader', desc: 'Howl reaches 2 more hexes.', ab: { radius: 2 } },
         { id: 'rex3b', name: 'Rabid', desc: 'The bite stuns for 1s.', ab: { stun: 1 } }],
        [{ id: 'rex4a', name: 'Guard Dog', desc: 'Howl taunts adjacent enemies for 2s.', ab: { taunt: 2 } },
         { id: 'rex4b', name: 'Fetch!', desc: 'Pounces on the farthest enemy within 4 hexes instead.', ab: { reach: 4 } }],
        [{ id: 'rex5a', name: 'Alpha', desc: 'Howl gives +20% more.', ab: { buff: 0.2 } },
         { id: 'rex5b', name: 'Cerberus', desc: 'The bite hits every adjacent enemy.', ab: { cleave: 1 } }],
      ] }),
    vey: H({ name: 'Mesmer', glyph: '🌀', role: 'Hypnotist', color: '#7a4ac8',
      hp: 655, atk: 44, armor: 15, mr: 35, as: 0.75, range: 3, ms: 2, mana: 63, m0: 30,
      abil: 'hypnosis', abName: 'Dreamspiral', abDesc: 'Hypnotizes the densest enemy group: for 2.5s they attack their own allies, and they take 30% AP magic damage.',
      ab: { radius: 1, dur: 2.5, dmg: 0.3, amp: 0, shield: 0, dot: 0 },
      specs: [
        [{ id: 'vey2a', name: 'Deep Trance', desc: 'Dreamspiral lasts 1s longer.', ab: { dur: 1 } },
         { id: 'vey2b', name: 'Mind Spike', desc: 'Dreamspiral deals 100% more.', ab: { dmg: 0.3 } }],
        [{ id: 'vey3a', name: 'Wide Spiral', desc: 'Dreamspiral radius +1.', ab: { radius: 1 } },
         { id: 'vey3b', name: 'Hypnotic Gaze', desc: 'Attacks slow by 20%.', mods: { slowOnHit: 0.2 } }],
        [{ id: 'vey4a', name: 'Puppet Master', desc: 'Hypnotized enemies deal 50% more damage (to their friends).', ab: { amp: 0.5 } },
         { id: 'vey4b', name: 'Mirror Mind', desc: 'Casting shields Mesmer for 25% max HP.', ab: { shield: 0.25 } }],
        [{ id: 'vey5a', name: 'Mass Delusion', desc: 'Radius +1 and 1s longer.', ab: { radius: 1, dur: 1 } },
         { id: 'vey5b', name: 'Nightmare', desc: 'Hypnotized enemies lose 5% max HP per second.', ab: { dot: 0.05 } }],
      ] }),
    pip: H({ name: 'Jinx', glyph: '🤡', role: 'Clown', color: '#e0406a',
      hp: 745, atk: 53, armor: 22, mr: 22, as: 0.9, range: 2, ms: 2.5, mana: 48, m0: 25, dodge: 0.1,
      abil: 'trick', abName: 'Grab Bag', abDesc: 'Pulls a random trick: a pie (150% AD physical damage, stuns 2s), balloons (every ally heals 85% AP), juggling knives (5 knives, 100% AD each), a confetti bomb (40% AD + 20% AP magic damage, slows 50%) or a squirting flower (blinds 3s).',
      ab: { pie: 2, heal: 0.85, knives: 5, silence: 0, encore: 0 },
      specs: [
        [{ id: 'pip2a', name: 'Bigger Pie', desc: 'The pie stuns 1s longer.', ab: { pie: 1 } },
         { id: 'pip2b', name: 'Encore!', desc: '25% chance to pull a second trick.', ab: { encore: 0.25 } }],
        [{ id: 'pip3a', name: 'Juggler', desc: 'Juggles 3 more knives.', ab: { knives: 3 } },
         { id: 'pip3b', name: 'Party Balloons', desc: 'Balloons heal 55% AP more.', ab: { heal: 0.55 } }],
        [{ id: 'pip4a', name: 'Laughing Gas', desc: 'Confetti also silences for 2s.', ab: { silence: 2 } },
         { id: 'pip4b', name: 'Rubber Nose', desc: '+200 max HP and reflects 15% of melee damage.', mods: { hp: 200, thorns: 0.15 } }],
        [{ id: 'pip5a', name: 'Grand Finale', desc: 'Always pulls two tricks.', ab: { encore: 1 } },
         { id: 'pip5b', name: 'Sinister Grin', desc: '+20 attack and +20% crit chance.', mods: { atk: 20, crit: 0.2 } }],
      ] }),
    barley: H({ name: 'Rumble', glyph: '🍺', role: 'Brawler', color: '#b8792a',
      hp: 740, atk: 43, armor: 28, mr: 22, as: 0.8, range: 1, ms: 2, mana: 78, m0: 30, dodge: 0.2,
      abil: 'keg', abName: 'Barrel Breaker', abDesc: 'Passive: drunken stagger gives 20% dodge. Active: smashes a barrel on adjacent enemies for 150% AD physical damage, stunning 1s and slowing, then takes a swig healing 15% of his max HP.',
      ab: { radius: 1, dmg: 1.5, stun: 1, heal: 0.15, burn: 0 },
      specs: [
        [{ id: 'bar2a', name: 'Liquid Courage', desc: '+20% attack speed.', mods: { asPct: 0.2 } },
         { id: 'bar2b', name: 'Iron Liver', desc: 'Regenerates 1.5% max HP per second.', mods: { regen: 0.015 } }],
        [{ id: 'bar3a', name: 'Belch of Fire', desc: 'The barrel burns for 40% AD per second.', ab: { burn: 0.4 } },
         { id: 'bar3b', name: 'Bar Brawl', desc: 'Barrel Breaker radius +1.', ab: { radius: 1 } }],
        [{ id: 'bar4a', name: 'Tipsy', desc: '+10% dodge.', mods: { dodge: 0.1 } },
         { id: 'bar4b', name: 'Hair of the Dog', desc: 'The swig heals 15% more.', ab: { heal: 0.15 } }],
        [{ id: 'bar5a', name: 'Blackout', desc: 'The stun lasts 1s longer.', ab: { stun: 1 } },
         { id: 'bar5b', name: 'Last Call', desc: 'Barrel Breaker deals double.', ab: { dmg: 1.5 } }],
      ] }),
    azgul: H({ name: 'Inferno', glyph: '😈', role: 'Demon', color: '#c8321e',
      hp: 720, atk: 58, armor: 25, mr: 25, as: 0.8, range: 1, ms: 2.5, mana: 70, m0: 30, mods: { rageDmg: 1 },
      abil: 'hellfire', abName: 'Brimstone Nova', abDesc: 'Passive: +1% damage for every 1% HP missing. Active: sacrifices 10% of his current HP to blast every enemy within 2 hexes for 120% AD + 70% AP magic damage, and burns them for 40% AD per second for 3s.',
      ab: { radius: 2, dmg: 1.2, apdmg: 0.7, burn: 0.4, cost: 0.1, imps: 0 },
      specs: [
        [{ id: 'azg2a', name: 'Sulfur Stoke', desc: 'Brimstone Nova burns twice as hard.', ab: { burn: 0.4 } },
         { id: 'azg2b', name: 'Demonic Hide', desc: '+20 armor and magic resist.', mods: { armor: 20, mr: 20 } }],
        [{ id: 'azg3a', name: 'Crimson Covenant', desc: 'Abilities heal 25% of their damage.', mods: { omni: 0.25 } },
         { id: 'azg3b', name: 'Wider Inferno', desc: 'Brimstone Nova radius +1.', ab: { radius: 1 } }],
        [{ id: 'azg4a', name: 'Wrath', desc: 'Missing HP gives 50% more damage.', mods: { rageDmg: 0.5 } },
         { id: 'azg4b', name: 'Imp Servants', desc: 'Brimstone Nova summons 2 imps.', ab: { imps: 2 } }],
        [{ id: 'azg5a', name: 'Archfiend', desc: 'Brimstone Nova costs no HP and deals double.', ab: { cost: -0.1, dmg: 1.2, apdmg: 0.7 } },
         { id: 'azg5b', name: 'Undying Flame', desc: 'Once per fight, lethal damage leaves him at 1 HP and invulnerable for 2s.', fl: ['undying'] }],
      ] }),
    grok: H({ name: 'Boulder', glyph: '🪨', role: 'Caveman', color: '#8a6a4a',
      hp: 965, atk: 60, armor: 30, mr: 15, as: 0.7, range: 1, ms: 2, mana: 70, m0: 30, mods: { ccResist: 0.5 },
      abil: 'boulder', abName: 'Boulder Toss', abDesc: 'Passive: thick skull halves crowd control on him. Active: hurls a boulder at the farthest enemy within 5 hexes: 200% AD physical damage and a 1.5s stun, and 100% AD to enemies next to it.',
      ab: { dmg: 2, stun: 1.5, radius: 1, frenzy: 0 },
      specs: [
        [{ id: 'grk2a', name: 'Big Club', desc: '+15 attack.', mods: { atk: 15 } },
         { id: 'grk2b', name: 'Tough', desc: '+250 max HP.', mods: { hp: 250 } }],
        [{ id: 'grk3a', name: 'Avalanche', desc: 'Boulder splash radius +1.', ab: { radius: 1 } },
         { id: 'grk3b', name: 'Concussion', desc: 'The stun lasts 1s longer.', ab: { stun: 1 } }],
        [{ id: 'grk4a', name: 'Unga Bunga', desc: '+40% attack speed for 4s after throwing.', ab: { frenzy: 0.4 } },
         { id: 'grk4b', name: 'Discovered Fire', desc: 'Attacks burn for 25% AD per second.', mods: { burnOnHit: 0.25 } }],
        [{ id: 'grk5a', name: 'Meteor Rock', desc: 'The boulder deals double.', ab: { dmg: 2 } },
         { id: 'grk5b', name: 'Mammoth Rider', desc: '+40% max HP and +1 move speed.', mods: { hpPct: 0.4, ms: 1 } }],
      ] }),
    imhotep: H({ name: 'Ankh', glyph: '🧟', role: 'Mummy', color: '#c8b88a',
      hp: 990, atk: 55, armor: 30, mr: 30, as: 0.7, range: 1, ms: 1.8, mana: 62, m0: 30, mods: { revive: 0.3 },
      abil: 'wrap', abName: 'Linen of Ages', abDesc: 'Passive: once per fight, rises again at 30% HP. Active: bandages the 2 nearest enemies: rooted 2s, healing halved, and they decay for 3% of their max HP per second.',
      ab: { count: 2, root: 2, decay: 0.03, shield: 0, vuln: 0 },
      specs: [
        [{ id: 'imh2a', name: 'Ancient Linen', desc: '+20 armor.', mods: { armor: 20 } },
         { id: 'imh2b', name: 'Tomb Dust', desc: 'Attacks decay for 1% max HP per second.', mods: { poisonOnHit: 0.01 } }],
        [{ id: 'imh3a', name: 'Many Wraps', desc: 'Wraps 2 more enemies.', ab: { count: 2 } },
         { id: 'imh3b', name: 'Tight Wraps', desc: 'The root lasts 1s longer.', ab: { root: 1 } }],
        [{ id: 'imh4a', name: 'Plague of Locusts', desc: 'Decay deals double.', ab: { decay: 0.03 } },
         { id: 'imh4b', name: 'Sarcophagus', desc: 'Casting shields him for 30% max HP.', ab: { shield: 0.3 } }],
        [{ id: 'imh5a', name: 'Eternal Pharaoh', desc: 'He rises at 60% HP instead.', mods: { revive: 0.3 } },
         { id: 'imh5b', name: 'Curse of the Tomb', desc: 'Wrapped enemies take 25% more damage.', ab: { vuln: 0.25 } }],
      ] }),
    leonidas: H({ name: 'Phalanx', glyph: '🏛', role: 'Hoplite', color: '#b8322a',
      hp: 880, atk: 50, armor: 40, mr: 25, as: 0.75, range: 2, ms: 2, mana: 80, m0: 30, mods: { aura: [{ r: 1, stat: 'armor', val: 10 }] },
      abil: 'phalanx', abName: 'Phalanx', abDesc: 'Passive: adjacent allies gain +10 armor. Active: raises his shield (allies within 1 hex take 30% less damage for 4s), then thrusts his spear through the 2 nearest enemies for 180% AD physical damage.',
      ab: { radius: 1, dr: 0.3, dmg: 1.8, hits: 2, stun: 0, taunt: 0 },
      specs: [
        [{ id: 'leo2a', name: 'Bronze Shield', desc: '+20 armor.', mods: { armor: 20 } },
         { id: 'leo2b', name: 'Long Spear', desc: '+1 range.', mods: { range: 1 } }],
        [{ id: 'leo3a', name: 'Shield Wall', desc: 'Damage reduction +15%.', ab: { dr: 0.15 } },
         { id: 'leo3b', name: 'Hoplite Kick', desc: 'The thrust stuns for 1s.', ab: { stun: 1 } }],
        [{ id: 'leo4a', name: 'Stand of the Few', desc: 'Taunts enemies within 2 hexes for 2s on cast.', ab: { taunt: 2 } },
         { id: 'leo4b', name: 'Formation', desc: 'The shield covers allies within 2 hexes.', ab: { radius: 1 } }],
        [{ id: 'leo5a', name: 'Hold the Line', desc: '+40% max HP.', mods: { hpPct: 0.4 } },
         { id: 'leo5b', name: 'Hero of the Pass', desc: 'The thrust hits every enemy within 2 hexes.', ab: { hits: 9 } }],
      ] }),
    harlequin: H({ name: 'Rapture', glyph: '🃏', role: 'Blade Dancer', color: '#d23a8a',
      hp: 695, atk: 69, armor: 18, mr: 20, as: 1.05, range: 1, ms: 3, mana: 48, m0: 20, crit: 0.15, mods: { critStack: 0.015, critStackCap: 0.15 },
      abil: 'waltz', abName: 'Steel Minuet', abDesc: 'Passive: each crit gives +1.5% crit (up to +15%). Active: dances through up to 3 enemies, striking each for 120% AD physical damage.',
      ab: { hits: 3, dmg: 1.2, silence: 0, untarg: 0 },
      specs: [
        [{ id: 'har2a', name: 'Masquerade', desc: '+15% dodge.', mods: { dodge: 0.15 } },
         { id: 'har2b', name: 'Sharp Wit', desc: '+10% crit chance.', mods: { crit: 0.1 } }],
        [{ id: 'har3a', name: 'Encore Minuet', desc: 'Strikes 2 more enemies.', ab: { hits: 2 } },
         { id: 'har3b', name: 'Mockery', desc: 'Each strike silences for 1s.', ab: { silence: 1 } }],
        [{ id: 'har4a', name: 'Grim Jester', desc: 'Kills refund 50% mana.', fl: ['rampage'] },
         { id: 'har4b', name: 'Pirouette', desc: 'Untargetable for 1s after the waltz.', ab: { untarg: 1 } }],
        [{ id: 'har5a', name: 'Final Act', desc: 'The waltz deals double.', ab: { dmg: 1.2 } },
         { id: 'har5b', name: 'Laughing Blade', desc: '+60% crit damage.', mods: { critDmg: 0.6 } }],
      ] }),
    sprocket: H({ name: 'Vial', glyph: '⚗', role: 'Alchemist', color: '#5ab88a',
      hp: 540, atk: 38, armor: 18, mr: 25, as: 0.8, range: 3, ms: 2, mana: 65, m0: 20,
      abil: 'flask', abName: 'Unstable Flasks', abDesc: 'Throws 3 random flasks: acid (65% AP magic damage, -20 armor), healing (120% AP to the weakest ally), frost (stun 1s) or poison (3% of max HP per second).',
      ab: { count: 3, radius: 0, heal: 1.2, acid: 0.65, mana: 0 },
      specs: [
        [{ id: 'spr2a', name: 'Bigger Batch', desc: 'Throws 1 more flask.', ab: { count: 1 } },
         { id: 'spr2b', name: 'Reagents', desc: '+25 AP.', mods: { ap: 25 } }],
        [{ id: 'spr3a', name: 'Volatile', desc: 'Flasks splash 1 hex.', ab: { radius: 1 } },
         { id: 'spr3b', name: 'Transmute', desc: '+3 gold after each won fight.', mods: { gold: 3 } }],
        [{ id: 'spr4a', name: 'Elixir of Life', desc: 'Healing flasks heal double.', ab: { heal: 1.2 } },
         { id: 'spr4b', name: 'Catalyst', desc: 'Each flask gives 8 mana back.', ab: { mana: 8 } }],
        [{ id: 'spr5a', name: 'Great Work', desc: '+25% to every stat.', mods: { allPct: 0.25 } },
         { id: 'spr5b', name: 'Chain Reaction', desc: 'Throws 3 more flasks.', ab: { count: 3 } }],
      ] }),
    zephyr: H({ name: 'Kaze', glyph: '🌪', role: 'Wind Monk', color: '#7ac8c8',
      hp: 770, atk: 62, armor: 22, mr: 28, as: 1.0, range: 1, ms: 3, mana: 48, m0: 20, dodge: 0.1,
      abil: 'galekick', abName: 'Squall Kick', abDesc: 'Kicks the target 2 hexes back for 170% AD physical damage. Anyone it crashes into takes 100% AD and is stunned for 1s.',
      ab: { dmg: 1.7, push: 2, stun: 0, splash: 0, targets: 1, tailwind: 0 },
      specs: [
        [{ id: 'zep2a', name: 'Whirlwind', desc: 'The kick also hits adjacent enemies for 60% AD physical damage.', ab: { splash: 0.6 } },
         { id: 'zep2b', name: 'Calm Mind', desc: '-15 max mana.', mods: { manaMax: -15 } }],
        [{ id: 'zep3a', name: 'Hurricane', desc: 'Knocks back 1 hex farther.', ab: { push: 1 } },
         { id: 'zep3b', name: 'Pressure Point', desc: 'The kick stuns the target for 1.5s.', ab: { stun: 1.5 } }],
        [{ id: 'zep4a', name: 'Tailwind', desc: 'Allies within 2 hexes get +15% attack speed for 3s on cast.', ab: { tailwind: 0.15 } },
         { id: 'zep4b', name: 'Flow', desc: '+15% dodge.', mods: { dodge: 0.15 } }],
        [{ id: 'zep5a', name: 'Still Center', desc: 'The kick deals double.', ab: { dmg: 1.7 } },
         { id: 'zep5b', name: 'Seven Winds', desc: 'Kicks 2 targets.', ab: { targets: 1 } }],
      ] }),
    // v30 (review #28, PC boy): three heroes unlocked by the account level (B.UNLOCKS)
    buzzwell: H({ name: 'Stinger', glyph: '🐝', role: 'Beekeeper', color: '#ffc21a',
      hp: 560, atk: 36, armor: 18, mr: 28, as: 0.8, range: 3, ms: 2, mana: 75, m0: 25,
      abil: 'hive', abName: 'Honey Hive', abDesc: 'Drops a honey hive on the densest enemy group: for 4s the bees sting everyone within 1 hex for 30% AP magic damage per second, and the weakest ally eats honey, healing 120% AP.',
      ab: { radius: 1, dur: 4, dps: 0.3, honey: 1.2, slow: 0, twin: 0 },
      specs: [
        [{ id: 'buz2a', name: 'Busy Bees', desc: 'The hive lasts 1s longer.', ab: { dur: 1 } },
         { id: 'buz2b', name: 'Royal Jelly', desc: 'Honey heals 60% AP more.', ab: { honey: 0.6 } }],
        [{ id: 'buz3a', name: 'Bigger Hive', desc: 'Hive radius +1.', ab: { radius: 1 } },
         { id: 'buz3b', name: 'Sticky Honey', desc: 'Enemies in the hive are slowed 30%.', ab: { slow: 0.3 } }],
        [{ id: 'buz4a', name: 'Angry Bees', desc: 'The bees sting 50% harder.', ab: { dps: 0.15 } },
         { id: 'buz4b', name: 'Pollen Dust', desc: 'Attacks poison for 1.5% max HP per second (3s).', mods: { poisonOnHit: 0.015 } }],
        [{ id: 'buz5a', name: 'Twin Hives', desc: 'A second hive lands on another enemy group.', ab: { twin: 1 } },
         { id: 'buz5b', name: "Queen's Guard", desc: 'Allies within 2 hexes gain +20 armor and MR.', mods: { aura: [{ r: 2, stat: 'armor', val: 20 }, { r: 2, stat: 'mr', val: 20 }] } }],
      ] }),
    coralie: H({ name: 'Maelstrom', glyph: '🌊', role: 'Tidecaller', color: '#2fb8d8',
      hp: 800, atk: 52, armor: 22, mr: 32, as: 0.75, range: 3, ms: 2, mana: 45, m0: 25,
      abil: 'wave', abName: 'Tidal Wave', abDesc: 'A wave crashes over the densest enemy group: 75% AP magic damage within 1 hex, pushes them 1 hex back and slows them 30% for 2s.',
      ab: { radius: 1, dmg: 0.75, push: 1, slow: 0.3, stun: 0, foam: 0, echo: 0 },
      specs: [
        [{ id: 'cor2a', name: 'Undertow', desc: 'The wave pushes 1 hex farther.', ab: { push: 1 } },
         { id: 'cor2b', name: 'Cold Current', desc: 'The slow is 50% instead of 30%.', ab: { slow: 0.2 } }],
        [{ id: 'cor3a', name: 'Riptide', desc: '+35% wave damage.', ab: { dmg: 0.26 } },
         { id: 'cor3b', name: 'Sea Foam', desc: 'Casting shields allies next to her for 20% of their max HP.', ab: { foam: 0.2 } }],
        [{ id: 'cor4a', name: 'High Tide', desc: 'Wave radius +1.', ab: { radius: 1 } },
         { id: 'cor4b', name: 'Pearl Diver', desc: '+25 AP.', mods: { ap: 25 } }],
        [{ id: 'cor5a', name: 'Second Swell', desc: 'A second wave hits 1s later for 60% of the damage.', ab: { echo: 0.6 } },
         { id: 'cor5b', name: 'Whirlpool', desc: 'The wave also stuns for 1s.', ab: { stun: 1 } }],
      ] }),
    stellan: H({ name: 'Astral', glyph: '⭐', role: 'Stargazer', color: '#8a7aff',
      hp: 660, atk: 54, armor: 24, mr: 26, as: 0.85, range: 3, ms: 2, mana: 65, m0: 25,
      abil: 'starfall', abName: 'Falling Star', abDesc: 'Calls a star onto the densest enemy group; 0.8s later it crashes: 120% AD + 60% AP magic damage in 1 hex and a 1.2s stun.',
      ab: { radius: 1, dmg: 1.2, apdmg: 0.6, stun: 1.2, delay: 0.8, shards: 0, blessing: 0, veil: 0 },
      specs: [
        [{ id: 'ste2a', name: 'Quick Comet', desc: 'The star lands 0.5s sooner.', ab: { delay: -0.5 } },
         { id: 'ste2b', name: 'Stardust', desc: '+15% crit chance.', mods: { crit: 0.15 } }],
        [{ id: 'ste3a', name: 'Bright Star', desc: 'Star radius +1.', ab: { radius: 1 } },
         { id: 'ste3b', name: 'Guiding Light', desc: 'Casting gives allies within 2 hexes +20% attack for 4s.', ab: { blessing: 0.2 } }],
        [{ id: 'ste4a', name: 'Shooting Stars', desc: '2 shards hit random enemies for 50% of the damage.', ab: { shards: 2 } },
         { id: 'ste4b', name: 'Constellation', desc: '+15 attack and +25 AP.', mods: { atk: 15, ap: 25 } }],
        [{ id: 'ste5a', name: 'Supernova', desc: '+60% star damage.', ab: { dmg: 0.72, apdmg: 0.36 } },
         { id: 'ste5b', name: 'Starlight Veil', desc: 'When the star lands, allies within 2 hexes get a shield of 15% of their max HP.', ab: { veil: 0.15 } }],
      ] }),
    // v60 (review #72, PC boy): "a hero that doesnt autoattack but casts a continuous ray that goes to the nearest target,
    // friend or foe: if friend heal, if foe, deal damage. Option to have more than 1 ray. Gains mana as more damage or
    // healing is dealt; ultimate is supercharging the beams"
    prism: H({ name: 'Prism', glyph: '🔆', role: 'Channeler', color: '#5fe0ff', fl: ['beam'],
      hp: 640, atk: 35, armor: 18, mr: 35, as: 1, range: 3, ms: 2, mana: 80, m0: 0,
      abil: 'overcharge', abName: 'Overcharge', abDesc: 'Passive (Beam): no attacks. A beam locks onto the nearest unit in range: it heals a hurt ally for 20% AP per second or burns an enemy for 32% AP per second, and fills mana as it works. Active: for 4s the beams deal and heal double and split into one more beam.',
      ab: { dmg: 0.32, heal: 0.2, rays: 1, dur: 4, mult: 2, extra: 1, gain: 1, shield: 0 },
      specs: [
        [{ id: 'pri2a', name: 'Twin Beam', desc: 'One more beam at all times.', ab: { rays: 1 } },
         { id: 'pri2b', name: 'Focused Lens', desc: 'Beams burn enemies 40% harder.', ab: { dmg: 0.13 } }],
        [{ id: 'pri3a', name: 'Mending Light', desc: 'Beams heal 50% more.', ab: { heal: 0.1 } },
         { id: 'pri3b', name: 'Searing Ray', desc: 'Enemies in a beam are slowed by 25%.', fl: ['searslow'] }],
        [{ id: 'pri4a', name: 'Long Lens', desc: '+1 range.', mods: { range: 1 } },
         { id: 'pri4b', name: 'Feedback', desc: 'Beams fill mana 50% faster.', ab: { gain: 0.5 } }],
        [{ id: 'pri5a', name: 'Prismatic Storm', desc: 'Overcharge splits into 2 more beams instead of 1.', ab: { extra: 1 } },
         { id: 'pri5b', name: 'Radiance', desc: 'Overcharge also shields every ally for 15% of their max HP.', ab: { shield: 0.15 } }],
      ] }),
    // v60 (review #72, PC boy): "a literal tower that cannot move, but sends little soldiers, medieval, to fight (spawns
    // them): melees or archers. Cannot move, but can be killed like others. No auto attack. When soldiers attack he
    // charges mana. Ultimate is putting all his units in a frenzy"
    citadel: H({ name: 'Citadel', glyph: '🏰', role: 'Fortress', color: '#c9a26a', fl: ['tower'],
      hp: 1050, atk: 40, armor: 40, mr: 30, as: 0.5, range: 2, ms: 0, mana: 75, m0: 0,
      abil: 'garrison', abName: 'Call to Arms', abDesc: 'Passive (Garrison): cannot move or attack. Every 7s it sends out a soldier, by turns a footman (165% AP as HP, 18% AP as attack) or an archer (100% AP as HP, 16% AP as attack, range 3), up to 3 at once. Its soldiers\' hits fill its mana. Active: every soldier goes into a frenzy for 5s (+50% attack speed, +25% attack) and heals 30%, and one more soldier marches out.',
      ab: { every: 7, max: 3, frenzy: 5, fhp: 1.65, fatk: 0.18, ahp: 1.0, aatk: 0.16, vet: 0, shields: 0, champion: 0, last: 0 },
      specs: [
        [{ id: 'cit2a', name: 'Barracks', desc: 'A soldier every 5s instead of 7s.', ab: { every: -2 } },
         { id: 'cit2b', name: 'Thick Walls', desc: '+30 armor and magic resist.', mods: { armor: 30, mr: 30 } }],
        [{ id: 'cit3a', name: 'Veterans', desc: 'Soldiers have 30% more HP and attack.', ab: { vet: 0.3 } },
         { id: 'cit3b', name: 'Bigger Garrison', desc: 'Up to 5 soldiers at once.', ab: { max: 2 } }],
        [{ id: 'cit4a', name: 'Shield Wall', desc: 'Footmen march out with a shield of 30% of their HP.', ab: { shields: 0.3 } },
         { id: 'cit4b', name: 'Volley Fire', desc: 'Archers attack 50% faster.', ab: { volley: 0.5 } }],
        [{ id: 'cit5a', name: 'Champion', desc: 'Every third soldier is a champion with double HP and attack.', ab: { champion: 1 } },
         { id: 'cit5b', name: 'Last Bastion', desc: 'When the Citadel falls, its soldiers stay in a frenzy until the end.', ab: { last: 1 } }],
      ] }),
  };
  for (const k in B.HEROES) B.HEROES[k].key = k;

  // ---------------------------------------------------------------- items (78 first, 120 since v16: see TYPES below)
  const I = (id, name, tier, mods, desc) => ({ id, name, tier, mods, desc });
  B.ITEMS = [
    // common
    I('longsword', 'Tempered Blade', 'common', { atk: 15 }, '+15 attack'),
    I('chainmail', 'Ringlink Hauberk', 'common', { armor: 20 }, '+20 armor'),
    I('belt', 'Ogrehide Girdle', 'common', { hp: 200 }, '+200 HP'),
    I('recurve', 'Hornbow', 'common', { asPct: 0.2 }, '+20% attack speed'),
    I('rod', 'Runed Wand', 'common', { ap: 20 }, '+20 AP'),
    I('cloak', 'Spellward Cloak', 'common', { mr: 20 }, '+20 magic resist'),
    I('tear', 'Wellspring Charm', 'common', { manaStart: 20 }, '+20 starting mana'),
    I('boots', 'Quickstep Boots', 'common', { ms: 1 }, '+1 move speed'),
    I('gloves', "Brawler's Wraps", 'common', { crit: 0.1, dodge: 0.05 }, '+10% crit, +5% dodge'),
    I('fang', 'Leech Tooth', 'common', { ls: 0.1 }, '+10% lifesteal'),
    I('buckler', 'Studded Buckler', 'common', { shieldStart: 150 }, 'Starts fights with a 150 shield'),
    I('cap', "Scout's Cap", 'common', { hp: 100, armor: 10 }, '+100 HP, +10 armor'),
    I('whetstone', 'Honing Stone', 'common', { atk: 8, asPct: 0.08 }, '+8 attack, +8% attack speed'),
    I('coin', "Gambler's Token", 'common', { gold: 1 }, '+1 gold after each won fight'),
    I('charm', 'Inkwell Charm', 'common', { xpPct: 0.3 }, '+30% XP'),
    I('amber', 'Resin Ring', 'common', { hp: 60, armor: 6, mr: 6 }, '+60 HP, +6 armor and magic resist'),
    I('dagger', 'Stiletto', 'common', { atk: 10, crit: 0.05 }, '+10 attack, +5% crit'),
    I('moss', 'Mendmoss Pouch', 'common', { regen: 0.01 }, 'Regenerate 1% max HP per second'),
    I('sling', "Shepherd's Sling", 'common', { range: 1, atk: -5 }, '+1 range, -5 attack'),
    I('focus', "Seer's Prism", 'common', { manaRegen: 2 }, '+2 mana per second'),
    // rare
    I('bloodthirster', 'Sanguine Saber', 'rare', { atk: 20, ls: 0.2 }, '+20 attack, +20% lifesteal'),
    I('thornmail', 'Bramblemail', 'rare', { armor: 30, thorns: 0.2 }, '+30 armor, reflects 20% melee damage'),
    I('warmog', 'Trollheart Cuirass', 'rare', { hp: 400, regen: 0.015 }, '+400 HP, 1.5% regen per second'),
    I('crossbow', 'Repeating Arbalest', 'rare', { asPct: 0.35 }, '+35% attack speed'),
    I('deathcap', 'Stargazer Hat', 'rare', { ap: 40 }, '+40 AP'),
    I('visage', 'Soulmend Mask', 'rare', { mr: 30, healPower: 0.25 }, '+30 magic resist, +25% healing received'),
    I('bluecrystal', 'Azure Geode', 'rare', { manaRegen: 4 }, '+4 mana per second'),
    I('infinity', 'Fatebreaker', 'rare', { crit: 0.25, critDmg: 0.5 }, '+25% crit, +50% crit damage'),
    I('guardplate', 'Wardplate', 'rare', { shieldStart: 400 }, 'Starts fights with a 400 shield'),
    I('frozenhammer', 'Rimefrost Maul', 'rare', { atk: 15, slowOnHit: 0.3 }, '+15 attack, attacks slow 30%'),
    I('emberblade', 'Kindled Falchion', 'rare', { atk: 10, burnOnHit: 0.25 }, '+10 attack, attacks burn'),
    I('venomvial', 'Adder Vial', 'rare', { poisonOnHit: 0.02 }, 'Attacks poison 2% max HP/s'),
    I('quicksilver', 'Unbound Sash', 'rare', { cleanseOnce: 1, mr: 15 }, 'Ignores the first crowd control, +15 MR'),
    I('phantomdancer', 'Ghoststep Slippers', 'rare', { dodge: 0.2, asPct: 0.15 }, '+20% dodge, +15% attack speed'),
    I('giantslayer', 'Hillbreaker', 'rare', { giantSlayer: 0.3 }, '+30% damage vs enemies with more max HP'),
    I('executioner', "Headsman's Axe", 'rare', { execute: 0.5, atk: 5 }, '+50% damage vs enemies below 30% HP'),
    I('shojin', 'Tidecaller Spear', 'rare', { manaOnHit: 6, atk: 8 }, '+6 mana per attack, +8 attack'),
    I('gunblade', 'Sparkcast Blade', 'rare', { omni: 0.2, ap: 20 }, 'Abilities heal 20% of damage dealt, +20 AP'),
    I('sunfire', 'Emberweave Mantle', 'rare', { hp: 200, sunfire: 0.012 }, '+200 HP, burns adjacent enemies'),
    I('scope', 'Farseer Lens', 'rare', { range: 1, crit: 0.05 }, '+1 range, +5% crit'),
    I('banner', 'Warband Pennant', 'rare', { aura: [{ r: 1, stat: 'atkPct', val: 0.15 }] }, 'Adjacent allies +15% attack'),
    I('totem', 'Ironbark Totem', 'rare', { aura: [{ r: 2, stat: 'armor', val: 12 }, { r: 2, stat: 'mr', val: 12 }] }, 'Allies within 2 hexes +12 armor and MR'),
    I('needle', 'Viper Needle', 'rare', { atk: 15, antiHeal: 1 }, '+15 attack, attacks halve enemy healing'),
    I('tabi', 'Ironshod Boots', 'rare', { ms: 1, armor: 20 }, '+1 move speed, +20 armor'),
    // epic
    I('guardian', 'Second Dawn Locket', 'epic', { revive: 0.4, armor: 10 }, 'Revives once at 40% HP'),
    I('titan', 'Mountain Grips', 'epic', { titan: 1, hp: 100 }, 'Gains +3 attack and +3 armor per hit (max 20 stacks)'),
    I('rabadon', 'Towering Cowl', 'epic', { ap: 80 }, '+80 AP'),
    I('crown', "Conqueror's Circlet", 'epic', { allPct: 0.2 }, '+20% HP, attack, AP, armor and MR'),
    I('stormbringer', 'Thunderspine', 'epic', { chainEvery: 3, chainTargets: 3, chainDmg: 0.6, asPct: 0.1 }, 'Every 3rd attack chains to 3 enemies'),
    I('morello', 'Grimoire of Blight', 'epic', { ap: 25, abilityBurn: 0.03 }, 'Abilities burn 3% max HP/s, +25 AP'),
    I('redemption', "Mercy's Chime", 'epic', { hp: 200, onDeathHeal: 0.35 }, 'On death, heals allies within 2 hexes for 35%'),
    I('zeke', "Herald's Horn", 'epic', { aura: [{ r: 1, stat: 'asPct', val: 0.3 }] }, 'Adjacent allies +30% attack speed'),
    I('botrk', 'Sorrowsteel', 'epic', { curHpOnHit: 0.05, ls: 0.1 }, 'Attacks deal 5% current HP, +10% lifesteal'),
    I('stoneplate', 'Basalt Bulwark', 'epic', { armor: 50, mr: 50, asPct: -0.1 }, '+50 armor and MR, -10% attack speed'),
    I('striders', 'Cloudstriders', 'epic', { ms: 2, firstMoveAtk: 0.6 }, '+2 move speed, attack after moving deals +60%'),
    I('archangel', 'Staff of Ascent', 'epic', { ap: 25, apPerSec: 3 }, '+25 AP, +3 AP every second in combat'),
    I('lastwhisper', 'Final Hush', 'epic', { armorPen: 0.4, atk: 10 }, 'Ignore 40% armor, +10 attack'),
    I('dragonclaw', 'Wyrmscale Gloves', 'epic', { mr: 60, regen: 0.015 }, '+60 MR, 1.5% regen per second'),
    // ---- v5 (review #2): 20 more, several that grow during the fight
    I('knuckles', 'Iron Knuckles', 'common', { atk: 6, stackAtk: 1, stackAtkCap: 15 }, '+6 attack, +1 attack per hit (15x)'),
    I('warpaint', 'Clan Warpaint', 'common', { rampAtk: 1, rampAtkCap: 20 }, '+1 attack every second in combat (up to +20)'),
    I('bandana', "Rogue's Bandana", 'common', { asPct: 0.15, dodge: 0.05 }, '+15% attack speed, +5% dodge'),
    I('oakshield', 'Heartwood Shield', 'common', { armor: 15, hp: 100 }, '+15 armor, +100 HP'),
    I('candle', 'Vigil Candle', 'common', { ap: 12, manaStart: 10 }, '+12 AP, +10 starting mana'),
    I('jerky', 'Trail Rations', 'common', { hp: 120, regen: 0.005 }, '+120 HP, 0.5% regen per second'),
    I('whistle', "Houndmaster's Whistle", 'common', { ms: 1, asPct: 0.08 }, '+1 move speed, +8% attack speed'),
    I('berserkeraxe', "Wildman's Axe", 'rare', { stackAs: 0.03, stackAsCap: 15 }, '+3% attack speed per hit (15x)'),
    I('stoneheart', 'Granite Heart', 'rare', { rampArmor: 2, rampArmorCap: 30 }, '+2 armor and MR every second (up to +30)'),
    I('soulbinder', 'Spirit Tether', 'rare', { killAtk: 5, killAtkCap: 40 }, '+5 attack when an enemy dies within 3 hexes (up to +40)'),
    I('frenzyblade', 'Rushing Blade', 'rare', { atk: 10, stackAs: 0.04, stackAsCap: 12 }, '+10 attack, +4% attack speed per hit (12x)'),
    I('manaweave', 'Starloom Robe', 'rare', { mr: 20, manaRegen: 3 }, '+20 MR, +3 mana per second'),
    I('lightningrod', 'Copper Conductor', 'rare', { asPct: 0.2, chainEvery: 4, chainTargets: 2, chainDmg: 0.5 }, '+20% attack speed, every 4th attack chains'),
    I('lifeline', 'Heartstring Amulet', 'rare', { hp: 250, shieldStartPct: 0.25 }, '+250 HP, starts fights with a 25% shield'),
    I('crackedlens', 'Cracked Monocle', 'rare', { crit: 0.2, critStack: 0.02, critStackCap: 0.2 }, '+20% crit, each crit +2% crit (up to +20%)'),
    I('colossus', 'Behemoth Heart', 'epic', { rampHpPct: 0.015, rampHpPctCap: 0.6 }, '+1.5% max HP every second (up to +60%)'),
    I('eclipsecrown', 'Duskfall Diadem', 'epic', { ap: 40, apPerAtk: 2 }, '+40 AP, +2 AP per attack'),
    I('reaper', 'Harvest Scythe', 'epic', { atk: 15, reap: 0.12 }, '+15 attack, hits execute enemies below 12% HP'),
    I('mirrorshield', 'Glasswall Shield', 'epic', { mr: 30, thorns: 0.35 }, '+30 MR, reflects 35% of melee damage'),
    I('hourglass', 'Stilled Hourglass', 'epic', { ap: 20, armor: 20, stasis: 1 }, 'Once per fight at 40% HP: invulnerable for 2s'),
  ];

  // ---------------------------------------------------------------- itemization v16 (the owner: "items divided by type
  // and rarity, like Obsidian Knight"). Every item has a TYPE, which is its equipment slot: a hero wears at most one item
  // of each type (and still up to Run.slots() items in total). And a RARITY, low to high: common, uncommon, rare, epic,
  // set (pieces of a named set: 2 and 3 pieces on the same hero give set bonuses), legendary, mythic.
  B.TYPES = [
    { id: 'weapon', name: 'Weapon' }, { id: 'offhand', name: 'Off-hand' }, { id: 'helmet', name: 'Helmet' }, { id: 'armor', name: 'Armor' },
    { id: 'gloves', name: 'Gloves' }, { id: 'boots', name: 'Boots' }, { id: 'trinket', name: 'Trinket' },
  ];
  B.TYPE = {}; for (const t of B.TYPES) B.TYPE[t.id] = t;
  B.RARITIES = [
    // v29: brighter so every rarity reads on the new sky-blue panels
    { id: 'common', name: 'Common', color: '#e2e8f2' }, { id: 'uncommon', name: 'Uncommon', color: '#6ff09a' },
    { id: 'rare', name: 'Rare', color: '#7cc8ff' }, { id: 'epic', name: 'Epic', color: '#dca8ff' },
    { id: 'set', name: 'Set', color: '#4ff0dc' }, { id: 'legendary', name: 'Legendary', color: '#ffb35c' }, { id: 'mythic', name: 'Mythic', color: '#ff6f82' },
  ];
  B.RARITY = {}; for (const r of B.RARITIES) B.RARITY[r.id] = r;
  // the first 78 items, sorted into slots (ids never change: saved runs, ghosts and content Elo use them)
  const LEGACY_TYPE = {
    weapon: 'longsword dagger rod recurve sling crossbow bloodthirster infinity emberblade frozenhammer executioner giantslayer gunblade shojin frenzyblade berserkeraxe needle lightningrod stormbringer botrk archangel lastwhisper reaper',
    offhand: 'buckler oakshield focus guardplate bluecrystal banner totem zeke mirrorshield morello stoneplate hourglass',
    helmet: 'cap bandana warpaint deathcap visage crackedlens rabadon crown eclipsecrown',
    armor: 'chainmail belt cloak thornmail warmog sunfire manaweave stoneheart colossus',
    gloves: 'gloves knuckles titan dragonclaw',
    boots: 'boots tabi phantomdancer striders',
    trinket: 'tear fang coin charm amber moss whetstone jerky candle whistle venomvial quicksilver scope lifeline soulbinder guardian redemption',
  };
  for (const t in LEGACY_TYPE) for (const id of LEGACY_TYPE[t].split(' ')) B.ITEMS.find(i => i.id === id).type = t;
  // the old commons with two stats are now uncommon
  for (const id of 'gloves cap whetstone amber dagger oakshield candle jerky whistle bandana knuckles'.split(' ')) B.ITEMS.find(i => i.id === id).tier = 'uncommon';

  const N = (type, id, name, tier, mods, desc, set) => ({ id, name, type, tier, mods, desc, set });
  B.ITEMS.push(
    // slots that had few items
    N('gloves', 'g_leather', 'Hide Gloves', 'common', { asPct: 0.15 }, '+15% attack speed'),
    N('gloves', 'g_gauntlets', 'Plated Gauntlets', 'uncommon', { armor: 15, atk: 8 }, '+15 armor, +8 attack'),
    N('gloves', 'g_silk', "Weaver's Gloves", 'uncommon', { ap: 15, manaOnHit: 3 }, '+15 AP, +3 mana per attack'),
    N('gloves', 'g_assassin', 'Cutpurse Grips', 'rare', { crit: 0.15, critDmg: 0.3 }, '+15% crit, +30% crit damage'),
    N('gloves', 'g_venom', 'Asp Claws', 'rare', { asPct: 0.15, poisonOnHit: 0.015 }, '+15% attack speed, attacks poison 1.5% max HP/s'),
    N('boots', 'b_padded', 'Wool-Lined Boots', 'common', { hp: 150 }, '+150 HP'),
    N('boots', 'b_treads', "Runner's Treads", 'uncommon', { ms: 1, mr: 15 }, '+1 move speed, +15 MR'),
    N('boots', 'b_greaves', 'Wargreaves', 'rare', { ms: 1, asPct: 0.25 }, '+1 move speed, +25% attack speed'),
    N('boots', 'b_shadow', 'Hushsteps', 'rare', { dodge: 0.15, firstMoveAtk: 0.3 }, '+15% dodge, attack after moving deals +30%'),
    N('helmet', 'h_iron', 'Iron Sallet', 'common', { armor: 12, mr: 12 }, '+12 armor and MR'),
    N('helmet', 'h_circlet', "Scholar's Circlet", 'uncommon', { ap: 15, manaStart: 15 }, '+15 AP, +15 starting mana'),
    N('armor', 'a_jerkin', 'Hide Jerkin', 'common', { hp: 120, dodge: 0.04 }, '+120 HP, +4% dodge'),
    N('armor', 'a_plate', 'Banneret Plate', 'uncommon', { armor: 22, hp: 80 }, '+22 armor, +80 HP'),
    // legendary: one per slot
    N('weapon', 'obsidianblade', 'Duskforged Greatsword', 'legendary', { atk: 30, splash: 0.35, armorPen: 0.2 }, '+30 attack, attacks splash 35% to adjacent enemies, ignore 20% armor'),
    N('offhand', 'aegis', 'Shield of First Light', 'legendary', { shieldStartPct: 0.3, aura: [{ r: 1, stat: 'armor', val: 20 }, { r: 1, stat: 'mr', val: 20 }] }, 'Starts fights with a 30% shield, adjacent allies +20 armor and MR'),
    N('helmet', 'magicrown', 'Crown of the Conclave', 'legendary', { ap: 60, manaStart: 30, manaRegen: 2 }, '+60 AP, +30 starting mana, +2 mana per second'),
    N('armor', 'dragonscale', 'Wyrmhide Mail', 'legendary', { hp: 350, armor: 30, mr: 30, dmgReduce: 0.1 }, '+350 HP, +30 armor and MR, takes 10% less damage'),
    N('gloves', 'furygauntlets', 'Gauntlets of Wrath', 'legendary', { asPct: 0.25, rageDmg: 0.5 }, '+25% attack speed, up to +50% damage as HP drops'),
    N('boots', 'windwalkers', 'Galerunners', 'legendary', { ms: 2, dodge: 0.2, asPct: 0.15 }, '+2 move speed, +20% dodge, +15% attack speed'),
    N('trinket', 'mountainheart', 'Heart of the Peak', 'legendary', { hpPct: 0.25, regen: 0.015, ccResist: 0.3 }, '+25% max HP, 1.5% regen per second, crowd control 30% shorter'),
    // mythic: one per slot, only in late shops
    N('weapon', 'worldsplitter', 'Horizon Cleaver', 'mythic', { atk: 40, crit: 0.2, critDmg: 0.5, multishot: 0.5, reap: 0.1 }, '+40 attack, +20% crit, +50% crit damage, attacks also hit a 2nd enemy for 50%, execute enemies below 10% HP'),
    N('offhand', 'eternitytome', 'Codex Without End', 'mythic', { ap: 50, apPerSec: 4, abilityBurn: 0.03, manaMaxPct: -0.2 }, '+50 AP, +4 AP every second, abilities burn 3% max HP/s and need 20% less mana'),
    N('helmet', 'voidmask', 'Mask of the Hollow Star', 'mythic', { allPct: 0.25, cleanseOnce: 1, omni: 0.15 }, '+25% HP, attack, AP, armor and MR, ignores the first crowd control, abilities heal 15% of damage'),
    N('armor', 'obsidianplate', 'Rampart of Dusk', 'mythic', { hp: 500, armor: 40, mr: 40, thorns: 0.3, stasis: 1 }, '+500 HP, +40 armor and MR, reflects 30% melee damage, once per fight at 40% HP: invulnerable for 2s'),
    N('gloves', 'ruinhands', 'Hands of Unmaking', 'mythic', { asPct: 0.35, curHpOnHit: 0.06, chainEvery: 3, chainTargets: 2, chainDmg: 0.6 }, '+35% attack speed, attacks deal 6% current HP, every 3rd attack chains to 2 enemies'),
    N('boots', 'phantomboots', 'Wraithwalkers', 'mythic', { ms: 2, dodge: 0.3, asPct: 0.2, firstMoveAtk: 0.8 }, '+2 move speed, +30% dodge, +20% attack speed, attack after moving deals +80%'),
    N('trinket', 'phoenixheart', 'Emberborn Heart', 'mythic', { revive: 0.7, hp: 250, onDeathHeal: 0.3 }, 'Revives once at 70% HP, +250 HP, on death heals allies within 2 hexes for 30%'),
    // sets: 3 pieces each, in 3 different slots
    N('weapon', 'obs_blade', 'Nightglass Blade', 'set', { atk: 18, armorPen: 0.15 }, '+18 attack, ignore 15% armor', 'obsidian'),
    N('helmet', 'obs_helm', 'Nightglass Helm', 'set', { armor: 20, hp: 100 }, '+20 armor, +100 HP', 'obsidian'),
    N('armor', 'obs_plate', 'Nightglass Cuirass', 'set', { armor: 25, hp: 150 }, '+25 armor, +150 HP', 'obsidian'),
    N('gloves', 'storm_gloves', 'Thunderborn Grips', 'set', { asPct: 0.15, atk: 6 }, '+15% attack speed, +6 attack', 'storm'),
    N('boots', 'storm_boots', 'Thunderborn Treads', 'set', { ms: 1, asPct: 0.1 }, '+1 move speed, +10% attack speed', 'storm'),
    N('trinket', 'storm_sigil', 'Thunderborn Sigil', 'set', { crit: 0.1, manaRegen: 1 }, '+10% crit, +1 mana per second', 'storm'),
    N('helmet', 'arc_hood', 'Starweaver Hood', 'set', { ap: 20, mr: 10 }, '+20 AP, +10 MR', 'arcanist'),
    N('offhand', 'arc_orb', 'Starweaver Orb', 'set', { ap: 20, manaStart: 15 }, '+20 AP, +15 starting mana', 'arcanist'),
    N('armor', 'arc_robe', 'Starweaver Robe', 'set', { mr: 20, manaRegen: 2 }, '+20 MR, +2 mana per second', 'arcanist'),
    N('weapon', 'bm_cleaver', 'Scarlet Cleaver', 'set', { atk: 15, ls: 0.08 }, '+15 attack, +8% lifesteal', 'bloodmoon'),
    N('gloves', 'bm_grips', 'Scarlet Grips', 'set', { atk: 8, crit: 0.08 }, '+8 attack, +8% crit', 'bloodmoon'),
    N('trinket', 'bm_pendant', 'Scarlet Pendant', 'set', { hp: 150, ls: 0.05 }, '+150 HP, +5% lifesteal', 'bloodmoon'),
    N('helmet', 'rg_hood', 'Wildwarden Hood', 'set', { crit: 0.08, asPct: 0.08 }, '+8% crit, +8% attack speed', 'ranger'),
    N('offhand', 'rg_quiver', 'Wildwarden Quiver', 'set', { asPct: 0.15 }, '+15% attack speed', 'ranger'),
    N('boots', 'rg_boots', 'Wildwarden Boots', 'set', { ms: 1, dodge: 0.08 }, '+1 move speed, +8% dodge', 'ranger'),
    // v30 (review #28): five items unlocked by the account level
    N('trinket', 'honeycomb', 'Honeycomb Charm', 'rare', { hp: 150, ap: 15, regen: 0.01 }, '+150 HP, +15 AP, regenerates 1% HP per second'),
    N('armor', 'starcloak', 'Starwoven Cloak', 'rare', { armor: 25, mr: 25, dodge: 0.08 }, '+25 armor and MR, +8% dodge'),
    N('offhand', 'tidepearl', 'Tide Pearl', 'epic', { ap: 45, manaStart: 20, mr: 20 }, '+45 AP, +20 starting mana, +20 MR'),
    N('boots', 'moonslippers', 'Moonstep Slippers', 'epic', { ms: 1, dodge: 0.15, manaRegen: 2 }, '+1 move speed, +15% dodge, +2 mana per second'),
    N('weapon', 'comethammer', 'Comet Hammer', 'legendary', { atk: 35, ap: 30, splash: 0.25 }, '+35 attack, +30 AP, attacks splash 25% to adjacent enemies'),
  );
  // set bonuses count the pieces worn by the SAME hero (Run.heroMods)
  B.SETS = {
    obsidian: { name: 'Nightglass Guard', bonus: { 2: { mods: { armor: 25, mr: 25 }, desc: '+25 armor and MR' }, 3: { mods: { shieldStartPct: 0.2, thorns: 0.25, atkPct: 0.15 }, desc: 'Starts fights with a 20% shield, reflects 25% melee damage, +15% attack' } } },
    storm: { name: 'Thunderborn', bonus: { 2: { mods: { asPct: 0.2 }, desc: '+20% attack speed' }, 3: { mods: { chainEvery: 3, chainTargets: 3, chainDmg: 0.5 }, desc: 'Every 3rd attack chains to 3 enemies' } } },
    arcanist: { name: 'Starweaver', bonus: { 2: { mods: { ap: 30 }, desc: '+30 AP' }, 3: { mods: { manaMaxPct: -0.25, abilityBurn: 0.02 }, desc: 'Abilities need 25% less mana and burn 2% max HP/s' } } },
    bloodmoon: { name: 'Scarlet Pact', bonus: { 2: { mods: { ls: 0.12 }, desc: '+12% lifesteal' }, 3: { mods: { rageDmg: 0.6, omni: 0.1 }, desc: 'Up to +60% damage as HP drops, abilities heal 10% of damage' } } },
    ranger: { name: 'Wildwarden', bonus: { 2: { mods: { range: 1 }, desc: '+1 range' }, 3: { mods: { multishot: 0.5 }, desc: 'Attacks also hit a 2nd enemy for 50%' } } },
  };
  for (const sid in B.SETS) { B.SETS[sid].id = sid; B.SETS[sid].pieces = B.ITEMS.filter(i => i.set === sid).map(i => i.id); }
  B.ITEM = {}; for (const it of B.ITEMS) B.ITEM[it.id] = it;

  // v51 (review #63, David: "Heroes in shop simplify description (like throws pies at enemies)"): what each hero does, in a
  // few plain words, for the shop and the start; the full ability and its numbers are one tap away (Details)
  const TAGS = {
    bastion: 'Shields up and pulls enemies to him',
    vex: 'Teleports to the weakest enemy',
    pyra: 'Throws fireballs at groups of enemies',
    glacia: 'Freezes groups of enemies solid',
    brakk: 'Charges in and knocks enemies out',
    lumen: 'Heals whoever is hurt the most',
    kestrel: 'Rains arrows on random enemies',
    morrow: 'Raises skeletons to fight for him',
    tempest: 'Bounces lightning through 4 enemies',
    grimhook: 'Hooks far enemies and drags them close',
    mirage: 'Makes copies of herself',
    rook: 'Builds turrets that shoot for him',
    thorne: 'Spins like a tornado and heals from it',
    seraph: 'Holy ground: hurts foes, heals friends',
    nyx: 'Grows stronger as enemies fall',
    bramble: 'Roots nearby enemies to the ground',
    echo: 'Plays music that pumps up the team',
    blaze: 'Fires six quick shots in a row',
    hippolyta: 'Throws poison spears at 3 enemies',
    deadshot: 'Snipes the weakest enemy from anywhere',
    vesper: 'Drains enemies to heal herself',
    kage: 'Blinds enemies and throws stars',
    rex: 'Howls to pump up the team, then bites',
    vey: 'Makes enemies fight each other',
    pip: 'Throws pies, knives and confetti',
    barley: 'Smashes barrels on enemies',
    azgul: 'Blows up everything around him',
    grok: 'Throws a giant boulder at far enemies',
    imhotep: 'Wraps enemies up and rises once',
    leonidas: 'Shields friends and spears 2 enemies',
    harlequin: 'Dances through enemies, slicing',
    sprocket: 'Throws random potions at enemies',
    zephyr: 'Kicks enemies flying into each other',
    buzzwell: 'Drops a beehive on enemies',
    coralie: 'Sends a wave that pushes enemies back',
    stellan: 'Drops a falling star on enemies',
  };
  TAGS.prism = 'Beams that heal friends and burn foes'; TAGS.citadel = 'A tower that sends soldiers to fight';   // v60
  for (const k in TAGS) if (B.HEROES[k]) B.HEROES[k].tag = TAGS[k];
  // v59 (review #71, PC boy: "pep up the names"): every hero got a new name; the old one stays as h.was (the Art Lab still
  // recognises picture files named after it)
  const WAS = {bastion: 'Bjornar', vex: 'Sica', glacia: 'Snezhana', brakk: 'Brutus', lumen: 'Brigid', kestrel: 'Strela', morrow: 'Koschei', tempest: 'Tordis', grimhook: 'Krok', mirage: 'Sarab', rook: 'Gizmund', thorne: 'Ulfrik', seraph: 'Licht', nyx: 'Umbra', bramble: 'Leshy', echo: 'Orfeo', blaze: 'Pólvora', hippolyta: 'Hyppolita', deadshot: 'Sokol', vesper: 'Carmina', kage: 'Kagero', rex: 'Garm', vey: 'Luna', pip: 'Pimples', barley: 'Pivo', azgul: 'Azgoth', grok: 'Kivi', imhotep: 'Khepri', leonidas: 'Leonteus', harlequin: 'Serra', sprocket: 'Mercurio', zephyr: 'Feng', buzzwell: 'Melissa', coralie: 'Nerina', stellan: 'Astrid'};
  for (const k in WAS) if (B.HEROES[k]) B.HEROES[k].was = WAS[k];

  // ---------------------------------------------------------------- relics (100) — team-wide
  const R = (id, name, desc, o) => Object.assign({ id, name, desc }, o);
  B.RELICS = [
    R('idol', 'Gilded Effigy', '+3 gold after each won fight.', { gold: 3 }),
    R('drum', 'Clan Drum', 'All heroes +12% attack speed.', { mods: { asPct: 0.12 } }),
    R('standard', 'Ironclad Standard', 'All heroes +15 armor.', { mods: { armor: 15 } }),
    R('lens', 'Wisp Lantern', 'All heroes +25% XP.', { mods: { xpPct: 0.25 } }),
    R('feather', 'Ashen Plume', 'The first hero to die each fight revives at 30% HP.', { fl: 'feather' }),
    R('seal', 'Guild Seal', 'Everything in shops costs 1 less.', { fl: 'seal' }),
    R('dice', 'Weighted Bones', 'First reroll in each shop is free.', { fl: 'dice' }),
    R('font', 'Moonwell Basin', 'Heroes start fights with +30 mana.', { mods: { manaStart: 30 } }),
    R('bloodstone', 'Heartblood Garnet', 'All heroes +8% lifesteal.', { mods: { ls: 0.08 } }),
    R('tooth', 'Ogre Molar', 'All heroes +150 HP.', { mods: { hp: 150 } }),
    R('wits', 'Whetted Mind', 'All heroes +20 AP.', { mods: { ap: 20 } }),
    R('clover', 'Lucky Sprig', 'All heroes +10% crit chance.', { mods: { crit: 0.1 } }),
    R('backpack', "Wayfarer's Satchel", 'Every hero gets +1 item slot.', { mods: { itemSlots: 1 } }),
    R('crest', 'Crest of Many', 'Team size limit +1 (4 heroes).', { fl: 'crest' }),
    R('vengeance', 'Wrathful Shade', 'When a hero dies, the others gain +20% attack.', { fl: 'vengeance' }),
    R('frostsigil', 'Rime Glyph', 'Enemies start every fight slowed by 40% for 4s.', { fl: 'frostsigil' }),
    R('thunder', 'Stormpost Totem', 'Every 4s lightning strikes a random enemy.', { fl: 'thunder' }),
    R('spring', 'Mending Spring', 'Heroes regenerate 1% max HP per second.', { mods: { regen: 0.01 } }),
    R('firststrike', 'Drawn Steel', 'Heroes start fights with a shield of 20% max HP.', { mods: { shieldStartPct: 0.2 } }),
    R('purse', 'Fat Purse', 'Gain 10 gold now, and +1 gold per 10 held after each fight.', { fl: 'purse' }),
    R('tome', 'Mossbound Tome', 'All current heroes gain 45 XP now.', { fl: 'tome' }),
    R('wind', 'Tail Gust', 'All heroes +1 move speed.', { mods: { ms: 1 } }),
    R('mark', 'Quarry Brand', '+25% damage to elites and bosses.', { mods: { eliteDmg: 0.25 } }),
    // ---- v5 (review #2)
    R('ember', 'Smoldering Coal', "Heroes' attacks burn for 10% AD per second.", { mods: { burnOnHit: 0.1 } }),
    R('warhorn', 'Charging Horn', 'Heroes start fights with +30% attack speed for 5s.', { fl: 'warhorn' }),
    R('ironwill', 'Unbending Oath', 'Each hero ignores the first crowd control of every fight.', { mods: { cleanseOnce: 1 } }),
    R('seed', 'Sprouting Acorn', 'Heroes gain +1% attack every second in combat (up to +30%).', { mods: { rampAtkPct: 0.01, rampAtkPctCap: 0.3 } }),
    R('bounty', 'Wanted Poster', '+1 gold per enemy killed in a won fight (up to +6).', { fl: 'bounty' }),
    R('bloodpact', 'Crimson Contract', 'Heroes +20% attack, -10% max HP.', { mods: { atkPct: 0.2, hpPct: -0.1 } }),
    R('lastbreath', 'Dying Gasp', 'A hero that dies explodes for 300% AD damage in 1 hex.', { fl: 'lastbreath' }),
    R('whetset', 'Grindwheel', 'All heroes +8 attack.', { mods: { atk: 8 } }),
    R('battery', 'Mana Coil', 'Abilities need 15% less mana.', { mods: { manaMaxPct: -0.15 } }),
    R('treasure', 'Faded Chart', 'Item shops stock 2 more items.', { fl: 'treasure' }),
    R('rally', 'Muster Flag', 'Each hero gives +10 armor to adjacent allies.', { mods: { aura: [{ r: 1, stat: 'armor', val: 10 }] } }),
    // v30 (review #28): ten relics unlocked by the account level
    R('beehive', 'Tiny Beehive', 'All heroes +10 AP, and their attacks poison for 0.5% max HP per second.', { mods: { ap: 10, poisonOnHit: 0.005 } }),
    R('seashell', 'Singing Seashell', 'All heroes +15 magic resist and +8% attack speed.', { mods: { mr: 15, asPct: 0.08 } }),
    R('kite', 'Paper Kite', 'All heroes +1 move speed and +5% dodge.', { mods: { ms: 1, dodge: 0.05 } }),
    R('compass', 'Star Compass', 'All heroes +8% crit chance and +15% crit damage.', { mods: { crit: 0.08, critDmg: 0.15 } }),
    R('teapot', 'Warm Teapot', 'All heroes regenerate 1% HP per second.', { mods: { regen: 0.01 } }),
    R('snowglobe', 'Snow Globe', 'All heroes +10 armor and +100 HP.', { mods: { armor: 10, hp: 100 } }),
    R('marbles', 'Marble Pouch', 'All heroes start fights with +25 mana.', { mods: { manaStart: 25 } }),
    R('fireflies', 'Firefly Jar', 'All heroes +10 attack and +10 AP.', { mods: { atk: 10, ap: 10 } }),
    R('pinwheel', 'Pinwheel', 'All heroes +8% attack speed and +1 mana per second.', { mods: { asPct: 0.08, manaRegen: 1 } }),
    R('horseshoe', 'Lucky Horseshoe', 'All heroes +8% dodge and +5% crit chance.', { mods: { dodge: 0.08, crit: 0.05 } }),
    // v33 (review #40, David: "relics that give bonuses depending on unit formation"): judged from where the heroes stand
    // when the fight starts (front row = the blue row nearest the enemy, back row = the last one); the deploy screen
    // shows who gets what while you move them
    R('shieldwall', 'Shieldwall Banner', 'Formation: each hero gets +10 armor and +10 magic resist for every ally standing next to it when the fight starts.', { fl: 'shieldwall', form: true }),
    R('lonewolf', 'Lone Wolf Pelt', 'Formation: heroes with no ally next to them when the fight starts get +25% attack speed and +10% crit chance.', { fl: 'lonewolf', form: true }),
    R('vanguard', 'Vanguard Horn', 'Formation: heroes starting in your front row get a shield of 25% of their max HP for 6s.', { fl: 'vanguard', form: true }),
    R('rearguard', 'Rearguard Quiver', 'Formation: heroes starting in your back row get +20% attack and +20% AP.', { fl: 'rearguard', form: true }),
    R('battleline', 'Battle Line Pennant', 'Formation: if all your heroes start in the same row, they all get +15% attack speed and +15% attack.', { fl: 'battleline', form: true }),
    R('cover', 'Mossy Totem', 'Formation: heroes starting next to a tree, boulder, ridge or pond get +15% dodge and +15 armor.', { fl: 'cover', form: true }),
    // v50 (review #62, David: "50 genuinely inventive relics ... memorable holy shit moments, change how I position or
    // build my team, interact with the hex board, alter targeting/AI, create new synergies ... Some relics should
    // fundamentally alter the run's economy, route, shops, rewards, hero selection, itemization, or risk/reward ... Every
    // relic needs a clear identity, interesting tradeoff"). Each one is a simple rule with a price; the rule lives in
    // sim.js (fights: flOf, so a Gauntlet ghost uses them too) or run.js (the run: shops, map, rewards, heroes).
    // -- the board and positioning
    R('gravestone', "Undertaker's Shovel", 'Every enemy that falls leaves a gravestone on its hex: it blocks the way like a boulder for the rest of the fight.', { fl: 'gravestone' }),
    R('quakedrum', 'Earthshaker Drum', 'Every 8s the ground shakes: every unit standing next to a tree, boulder, ridge, pond or gravestone is stunned for 1s. Yours too.', { fl: 'quakedrum' }),
    R('bramblecrown', 'Thorn Crown', 'Trees, boulders, ridges, ponds and gravestones grow thorns: enemies next to them lose 3% max HP per second, your heroes 1%.', { fl: 'bramblecrown' }),
    R('catapult', 'Siege Sling', 'When the fight starts, your front hero is flung next to the enemy farthest back, lands with a shield of 30% of its max HP and stuns every enemy beside it for 2s. It lands alone.', { fl: 'catapult' }),
    R('gravity', 'Gravity Stone', 'When the fight starts, every enemy is pulled together into the middle of its side. Great for blasts, but they arrive all at once.', { fl: 'gravity' }),
    R('anchor', 'Anchor Chain', 'Heroes take 25% less damage while they stand on the hex they started on, and nothing can push or pull them.', { fl: 'anchor' }),
    R('stonefoot', 'Stonefoot Idol', 'Heroes never walk, but get +2 range. The enemies come to you.', { fl: 'stonefoot', mods: { range: 2 } }),
    R('blinkstone', 'Blink Pebble', 'Melee heroes blink next to their target instead of walking (once every 4s). They dive in alone.', { fl: 'blinkstone' }),
    R('trickcoin', "Swapper's Coin", 'Every 8s your most hurt hero swaps places with your healthiest one.', { fl: 'trickcoin' }),
    R('highground', 'Watchtower Flag', 'Formation: heroes starting in your back row get +1 range and +20% damage; heroes starting in your front row deal 15% less.', { fl: 'highground', form: true }),
    R('center', 'Spotlight Lamp', 'Formation: the hero starting closest to the middle of your side is the Star: +40% HP, attack and AP. The others get 10% less HP.', { fl: 'center', form: true }),
    // -- targeting
    R('lodestone', 'Lodestone', 'Every enemy goes for your hero with the most max HP, wherever it stands. That hero takes 10% less damage.', { fl: 'lodestone' }),
    R('bodyguard', 'Bodyguard Oath', 'Enemies cannot target your ranged heroes while one of your melee heroes is alive. Blasts still hit them.', { fl: 'bodyguard' }),
    R('packhorn', 'Pack Horn', 'Your heroes all hunt the same enemy (the one closest to your team) and deal 25% more damage to it.', { fl: 'packhorn' }),
    R('jesterbell', "Jester's Bell", 'Every 8s a random unit on the board, friend or foe, is confused for 2.5s and attacks its own side. Bosses are deaf to it.', { fl: 'jesterbell' }),
    R('mirrorshield', 'Mirror Shard', 'The first ability that hits each hero in a fight bounces back to whoever cast it. Heroes take 10% more damage from attacks.', { fl: 'mirrorshield' }),
    // -- falling and rising
    R('phoenix', 'Phoenix Egg', 'If your whole team falls, everyone rises at 50% HP. Then the egg hatches and is gone for the rest of the game.', { fl: 'phoenix' }),
    R('souljar', 'Soul Jar', 'Every 4 enemies that fall fill the jar: a fallen hero rises at 50% HP (if nobody fell, every hero heals 30%).', { fl: 'souljar' }),
    R('gravecaller', 'Gravecaller Lantern', 'Each enemy that falls (not bosses) rises on your side for 6s at half strength. Heroes have 15% less max HP.', { fl: 'gravecaller', mods: { hpPct: -0.15 } }),
    R('lastone', 'Last Stand Banner', 'When only one of your heroes is left, it heals to full and gets +100% attack and +50% attack speed.', { fl: 'lastone' }),
    R('pyre', 'Chain Pyre', 'Enemies that fall explode for 15% of their max HP into everything next to them (your heroes take a tenth of it). Crowds chain-react.', { fl: 'pyre' }),
    R('contagion', 'Plague Flask', 'When a burning or poisoned enemy falls, its burn and poison jump to every enemy within 2 hexes.', { fl: 'contagion' }),
    R('king', "King's Crown", 'Your highest-level hero is crowned: +60% HP and attack. When the King falls, the others panic (stunned for 2s).', { fl: 'king' }),
    // -- mana and abilities
    R('echo', 'Echo Chime', "Each hero's first ability in a fight goes off twice. Heroes start fights with no mana.", { fl: 'echo' }),
    R('fullmana', 'Overflow Cup', 'Heroes start fights with full mana, but every ability needs 10% more mana.', { fl: 'fullmana', mods: { manaMaxPct: 0.1 } }),
    R('hush', 'Hush Bell', 'Enemies cannot use abilities for the first 10s of a fight; your heroes cannot for the first 2s.', { fl: 'hush' }),
    R('leyline', 'Ley Line Chalk', 'When a hero uses its ability, your other heroes in the same row gain 30 mana.', { fl: 'leyline' }),
    // -- stats turned upside down
    R('scales', 'Scales of Balance', "When the fight starts, all your heroes' max HP evens out to the team's average.", { fl: 'scales' }),
    R('glass', 'Glass Crown', 'Heroes deal double damage, but have a third less max HP.', { fl: 'glass', mods: { hpPct: -0.35 } }),
    R('giant', "Giant's Brew", 'Heroes grow huge: +60% max HP and attack, but 40% slower attacks, -1 move speed and no dodge.', { fl: 'giant', mods: { hpPct: 0.6, atkPct: 0.6, asPct: -0.4, ms: -1 } }),
    R('berserk', 'Berserker Chain', 'Heroes attack faster the more HP they lose (up to twice as fast), but heals can never lift them above half HP.', { fl: 'berserk' }),
    R('bond', 'Brotherhood Chain', 'Damage to any hero is shared equally by all your heroes still standing.', { fl: 'bond' }),
    R('loaded', 'Two-Faced Coin', 'Luck rolls twice for you: crits, dodges and gambles all take the better roll. Heroes have 10% less attack.', { fl: 'loaded', mods: { atkPct: -0.1 } }),
    R('timecrystal', 'Time Crystal', 'Every 12s time stops for the enemies (frozen for 1.5s). Sudden death starts 10s sooner.', { fl: 'timecrystal' }),
    R('harmony', 'Harmony Chord', 'If all your heroes fight up close, or all fight from afar, they get +25% attack and attack speed.', { fl: 'harmony' }),
    // -- the run: shops, the map, rewards, heroes and items
    R('ledger', "Merchant's Ledger", 'One offer in every shop is free, but everything else costs 2 more.', { fl: 'ledger' }),
    R('deck', 'Shuffled Deck', 'Shop rerolls are free, but every reroll takes two offers away.', { fl: 'deck' }),
    R('quill', "Pathfinder's Quill", 'Every step of the map offers 3 choices instead of 2. Fights pay 2 less gold.', { fl: 'quill' }),
    R('huntmap', "Bounty Hunter's Map", 'One path is always a Hard fight. Hard fights pay double gold; Easy fights pay nothing.', { fl: 'huntmap' }),
    R('anvil', 'Heirloom Anvil', 'After each won fight, a random worn item goes up one rarity. Item shops sell 2 fewer items.', { fl: 'anvil' }),
    R('cabinet', 'Curio Cabinet', 'All heroes get +3% HP and attack for every relic you own. Relics cost 3 more.', { fl: 'cabinet' }),
    R('solo', 'Lone Crown', 'While you have only one hero: +150% HP and attack, +2 item slots and double XP. The Hero Shop never shows up.', { fl: 'solo' }),
    R('changeling', 'Changeling Mask', 'After each won fight, your lowest-level hero turns into a random new hero of the same level. It keeps its items.', { fl: 'changeling' }),
    R('cursecoin', 'Cursed Doubloon', 'Gain 25 gold now. Every fight after this one, enemies have 5% more HP, and it keeps adding up.', { fl: 'cursecoin' }),
    R('xmap', 'Treasure Map', 'Events show up twice as often and each one also gives a random item. Shops cost 1 more.', { fl: 'xmap' }),
    R('medal', "Veteran's Medal", 'Heroes earn XP only from kills, but each kill is worth 25 XP.', { fl: 'medal' }),
    R('double', 'Double or Nothing', 'Win a fight with nobody falling: double gold. If anyone falls: no gold at all.', { fl: 'double' }),
    R('snowball', 'Snowball', 'Each fight won with nobody falling gives every hero +4% HP and attack for the rest of the game. One fallen hero melts it all.', { fl: 'snowball' }),
    R('packrat', "Pack Rat's Sack", 'Every item in your bag (not worn) gives all heroes +3% HP and attack, up to 10 items.', { fl: 'packrat' }),
    R('vow', "Minimalist's Vow", 'Heroes wearing one item or none get +50% HP and attack.', { fl: 'vow' }),
  ];
  // what each formation relic gives one hero (n = allies next to it, for the Shieldwall), shown while deploying
  B.FORMATION = {
    shieldwall: n => `+${10 * n} armor & MR`, lonewolf: () => '+25% attack speed, +10% crit', vanguard: () => 'shield 25% HP',
    rearguard: () => '+20% attack & AP', battleline: () => '+15% attack speed & attack', cover: () => '+15% dodge, +15 armor',
    highground: n => n > 0 ? '+1 range, +20% damage' : '15% less damage', center: n => n > 0 ? 'the Star: +40% HP, attack & AP' : '10% less HP',   // v50
  };
  // v58 (review #70, David: "Simplify the relic descriptions"): a short line for every relic (what it does, in a few words)
  // for shops, the start and the map; the full rule is one tap away (r.desc)
  const SHORT = {
    beehive: 'Heroes +10 AP; attacks poison.',
    shieldwall: 'Heroes side by side get tougher.',
    lonewolf: 'Heroes standing alone attack faster.',
    vanguard: 'Front-row heroes start with a shield.',
    rearguard: 'Back-row heroes hit 20% harder.',
    battleline: 'All in one row: everyone attacks faster.',
    cover: 'Heroes next to terrain dodge and block more.',
    gravestone: 'Fallen enemies leave walls behind.',
    quakedrum: 'Every 8s, all next to terrain are stunned.',
    bramblecrown: 'Terrain hurts the enemies next to it.',
    catapult: 'Fling your front hero into their back line.',
    gravity: 'Enemies start bunched together.',
    anchor: 'Heroes that stay put take 25% less damage.',
    stonefoot: 'Heroes never walk, but shoot farther.',
    blinkstone: 'Melee heroes teleport to their target.',
    trickcoin: 'Your hurt hero swaps with a healthy one.',
    highground: 'Back row hits harder, front row less.',
    center: 'Your middle hero becomes a Star.',
    lodestone: 'Enemies all chase your biggest hero.',
    bodyguard: 'Ranged heroes are safe behind melee ones.',
    packhorn: 'Your team hunts one enemy at a time.',
    jesterbell: 'Someone random gets confused every 8s.',
    mirrorshield: 'The first ability on each hero bounces back.',
    phoenix: 'Your wiped team rises once.',
    souljar: 'Every 4 kills bring a fallen hero back.',
    gravecaller: 'Fallen enemies fight for you a while.',
    lastone: 'Your last hero heals and goes berserk.',
    pyre: 'Fallen enemies explode on their friends.',
    contagion: 'Burns and poisons spread when enemies fall.',
    king: 'Your best hero is King, much stronger.',
    echo: 'Each hero\'s first ability fires twice.',
    fullmana: 'Heroes start fights with full mana.',
    hush: 'Enemies can\'t use abilities for 10s.',
    leyline: 'Casting fills mana for the same row.',
    scales: 'All your heroes get the same max HP.',
    giant: 'Heroes are huge: tougher, but slower.',
    berserk: 'Heroes attack faster as they get hurt.',
    bond: 'Your heroes share the damage they take.',
    loaded: 'Crits and dodges roll twice for you.',
    timecrystal: 'Every 12s the enemies freeze.',
    harmony: 'An all-melee or all-ranged team hits harder.',
    ledger: 'One free offer in every shop.',
    deck: 'Free rerolls that shrink the shop.',
    quill: '3 paths to choose from every step.',
    huntmap: 'Hard fights pay double gold.',
    anvil: 'Your gear upgrades after every win.',
    cabinet: 'Stronger for every relic you own.',
    solo: 'One hero only, but a huge one.',
    changeling: 'Your weakest hero changes after each win.',
    cursecoin: '+25 gold now; enemies grow every fight.',
    xmap: 'More events, each with a free item.',
    medal: 'Heroes level up from kills only.',
    double: 'No one falls: double gold. Else: none.',
    snowball: 'Clean wins stack up power for good.',
    packrat: 'Items in your bag make everyone stronger.',
  };
  for (const r of B.RELICS) r.short = SHORT[r.id] || r.desc;
  B.RELIC = {}; for (const r of B.RELICS) B.RELIC[r.id] = r;
  // review #14 (David): content Elo only rates what acts in a fight, so these never get a rating
  B.NONCOMBAT = { item: ['coin', 'charm'], relic: ['idol', 'lens', 'seal', 'dice', 'purse', 'tome', 'treasure', 'bounty', 'ledger', 'deck', 'quill', 'huntmap', 'anvil', 'changeling', 'xmap', 'medal', 'double'] };

  // ---------------------------------------------------------------- mobs (stats at fight scale 1)
  const M = (o) => o;
  B.MOBS = {
    grunt: M({ name: 'Grunt', glyph: '👺', hp: 420, atk: 34, armor: 15, mr: 10, as: 0.8, range: 1, ms: 2, cost: 1 }),
    wolf: M({ name: 'Wolf', glyph: '🐺', hp: 300, atk: 26, armor: 5, mr: 5, as: 1.2, range: 1, ms: 3.5, cost: 1 }),
    archer: M({ name: 'Archer', glyph: '🎯', hp: 300, atk: 36, armor: 5, mr: 10, as: 0.8, range: 3, ms: 2, cost: 1.2 }),
    brute: M({ name: 'Brute', glyph: '🦍', hp: 900, atk: 50, armor: 30, mr: 10, as: 0.6, range: 1, ms: 1.6, mana: 60, abil: 'smash', cost: 2 }),
    skulker: M({ name: 'Skulker', glyph: '🥷', hp: 380, atk: 48, armor: 10, mr: 10, as: 1, range: 1, ms: 3, fl: ['dive'], cost: 1.6 }),
    shaman: M({ name: 'Shaman', glyph: '🧙', hp: 360, atk: 22, armor: 10, mr: 25, as: 0.7, range: 3, ms: 2, mana: 60, abil: 'mend', cost: 1.8 }),
    bomber: M({ name: 'Bomber', glyph: '💣', hp: 320, atk: 55, armor: 5, mr: 5, as: 0.8, range: 1, ms: 3, abil: 'explode', mana: 0, cost: 1.5 }),
    shieldbearer: M({ name: 'Shieldbearer', glyph: '🪖', hp: 650, atk: 30, armor: 40, mr: 20, as: 0.7, range: 1, ms: 2, mana: 70, m0: 40, abil: 'wall', cost: 1.8 }),
    hexer: M({ name: 'Hexer', glyph: '🔮', hp: 340, atk: 30, armor: 10, mr: 30, as: 0.75, range: 3, ms: 2, mana: 55, abil: 'curse', cost: 1.8 }),
    golem: M({ name: 'Golem', glyph: '🗿', hp: 1500, atk: 55, armor: 45, mr: 30, as: 0.5, range: 1, ms: 1.4, mana: 90, abil: 'slam', cost: 3 }),
    summoner: M({ name: 'Summoner', glyph: '🕯', hp: 380, atk: 25, armor: 10, mr: 20, as: 0.6, range: 3, ms: 2, mana: 70, m0: 30, abil: 'imps', cost: 2 }),
    spitter: M({ name: 'Spitter', glyph: '🐍', hp: 330, atk: 28, armor: 10, mr: 10, as: 0.8, range: 3, ms: 2, poison: 0.015, cost: 1.4 }),
    knight: M({ name: 'Blackguard', glyph: '♞', hp: 800, atk: 45, armor: 35, mr: 35, as: 0.8, range: 1, ms: 2.2, shield: 250, cost: 2.4 }),
    imp: M({ name: 'Imp', glyph: '😈', hp: 180, atk: 18, armor: 0, mr: 0, as: 1.2, range: 1, ms: 3.5, cost: 0.5 }),
  };
  for (const k in B.MOBS) B.MOBS[k].key = k;
  B.BOSSES = {
    gorewarden: { key: 'gorewarden', name: 'Gorewarden', glyph: '👹', boss: 1, hp: 1800, atk: 45, armor: 40, mr: 30, as: 0.65, range: 1, ms: 1.8, mana: 55, abil: 'cleave',
      desc: 'Cleaves everything around it. Calls the horde at half health and enrages at 25%.', escort: ['grunt', 'grunt', 'archer'] },
    hollowking: { key: 'hollowking', name: 'The Ashen Sovereign', glyph: '👑', boss: 2, hp: 2250, atk: 48, armor: 45, mr: 45, as: 0.7, range: 2, ms: 2, mana: 60, abil: 'nova',
      desc: 'Void Nova stuns everything near it. Rends the weakest hero from afar. Splits its court at 66% and 33%.', escort: ['hexer', 'archer'] },
    // v52 (review #64, David: "Add an additional possibility for each of the bosses (not chosen, is chosen at random at
    // start of each run) and balance it"): slot 1 is the Gorewarden or the Mirewitch, slot 2 the Ashen Sovereign or the
    // Iron Colossus (run.bosses, drawn in Run.newRun). Their strength is tuned with tools/boss-odds.js
    mirewitch: { key: 'mirewitch', name: 'Mirewitch Morra', glyph: '🧪', boss: 1, slot: 1, hp: 1350, atk: 42, armor: 25, mr: 50, as: 0.7, range: 3, ms: 1.8, mana: 50, abil: 'bog',
      desc: 'Hurls poison bog that stays on the ground. Turns your strongest hero into a frog every 9s. Sinks into the swamp at half health and calls serpents.', escort: ['grunt', 'spitter', 'archer'] },
    colossus: { key: 'colossus', name: 'The Iron Colossus', glyph: '🗿', boss: 2, slot: 2, hp: 3500, atk: 64, armor: 60, mr: 35, as: 0.55, range: 1, ms: 1.5, mana: 70, abil: 'quake',
      desc: 'Stomps the ground and shoves heroes away (into stones, they are stunned). Vents steam every 8s and takes more damage while it does. Calls shield bearers at 60%, melts down at 30%.', escort: ['knight', 'bomber'] },
  };
  B.BOSS_SLOTS = [['gorewarden', 'mirewitch'], ['hollowking', 'colossus']];
  B.ELITES = [
    { id: 'vampiric', name: 'Vampiric', mods: { ls: 0.3 } },
    { id: 'armored', name: 'Armored', mods: { armor: 50, mr: 50 } },
    { id: 'swift', name: 'Swift', mods: { asPct: 0.5, ms: 1 } },
    { id: 'enraged', name: 'Enraged', mods: { atkPct: 0.4 } },
    { id: 'giant', name: 'Giant', mods: { hpPct: 0.8 } },
  ];
  // pools by fight number for random formations
  B.POOLS = {
    1: ['grunt', 'wolf', 'archer', 'grunt'],
    2: ['grunt', 'wolf', 'archer', 'brute', 'spitter', 'skulker'],
    5: ['grunt', 'archer', 'brute', 'skulker', 'shaman', 'bomber', 'hexer', 'spitter', 'shieldbearer'],
    6: ['archer', 'brute', 'skulker', 'shaman', 'bomber', 'hexer', 'golem', 'summoner', 'shieldbearer', 'knight'],
  };
  B.DIFF = {
    easy: { name: 'Easy', budget: 3.2, elites: 0 },
    medium: { name: 'Medium', budget: 4.6, elites: 0 },
    hard: { name: 'Hard', budget: 5.8, elites: 1 },
    horde: { name: 'Horde', budget: 8.4, elites: 0, pool: 2 },   // v44 (review #54): the Bounty Board's horde challenge
  };

  // ---------------------------------------------------------------- events
  // v44 (review #54, David: "Redesign the events. They are just not very interesting and rarely worth it. Add more
  // diversity, add rewards, extra challenges. Read up online what similar games do"). What the genre does, and what the
  // events do now:
  //   - Slay the Spire, Darkest Dungeon: every choice is a real trade (a price, a risk or a curse for a big reward);
  //   - Hades (the Erebus gates), Monster Train (trials): optional CHALLENGE fights that start right away; lose one and
  //     only that reward is gone (the run goes on), win it for a big reward;
  //   - TFT augments, Slay the Spire's relic rooms: you see the actual relics and items on offer and pick one;
  //   - FTL's "blue options": extra choices only a team with the right hero can take (a melee hero, a ranged hero, a
  //     caster, a healer, a hero at Lv 3); everyone sees them, so players learn they exist;
  //   - rarity: common, uncommon and rare events (rare ones pay a lot); an event is not offered twice in a run;
  //   - rewards grow with the run: {gN} = N gold, {xN} = N XP, times 1 + 5% for each fight after the first.
  // v45 (review #55, David: "The new events are way too op. The fight bounties, gold gain, xp gain, etc is just way
  // too much. I like the hero specific unlocked choices though"): every reward is smaller (about the size of the old
  // v43 events, some below), growth is +5% per fight (was +15%), challenges pay one prize and no gold on top, and bets
  // are close to fair. Measured with tools/sim-run.js: a bot that prefers events now does about as well as one that
  // prefers shops. The hero-specific choices stay, a little better than the plain ones.
  // A choice can have:
  //   act     what it does (run.js eventAct): xpAll:n, xpHero:n, hpAll:p, hpHero:p, buffHero / buffAll (+mods), gold:n,
  //           item:any|common|rare|epic, typeItem:rarity, mystery, sellFull, upgradeItem, gambleItem, gamble:bet:odds:win,
  //           relic, relicPick:id, relicBlood:p[:id], relicItem, respec, hire:key, join:key, take:itemId, setPiece,
  //           tradeSet, invest:back, loan:now:later, levelAll, levelHero, transmute, potion, mimic, fight, none
  //   cost    gold paid up front              target  'hero' | 'item' | 'type': the player picks what it applies to
  //   next    a modifier for the NEXT fight: enemyHp / enemyAtk (+-%), manaStart, regen, atkPct (your heroes),
  //           goldPct, reward ('legendary' item if you win it), rewardGold
  //   req     'melee' | 'ranged' | 'caster' | 'healer' | 'lvl3': only a team with such a hero can take it (a hero target
  //           is then one of those heroes)
  //   risk    a short warning shown in red         minRarity (item targets)
  //   fight   a challenge that starts now: { kind: 'solo'|'bandits'|'pack'|'horde'|'mimic'|'hoard', name,
  //           win: { gold, item: rarity, relic: 1, xp, boost: { hpPct, atkPct } (the solo hero) } }
  // Events marked dyn build their choices from an offer rolled when the event opens (run.js eventChoices).
  B.EVENTS = [
    { id: 'training', rar: 'common', icon: '🎯', name: 'Training Grounds', text: 'Old veterans offer to drill your team.', choices: [
      { label: 'Drill everyone: +{x15} XP to all heroes', act: 'xpAll:{x15}' },
      { label: 'Private lessons: +{x40} XP to one hero', act: 'xpHero:{x40}', target: 'hero' },
      { label: 'Hire the masters: +{x30} XP to all heroes', act: 'xpAll:{x30}', cost: 6 },
      { label: 'Your veteran runs the drill: +{x30} XP to all heroes', act: 'xpAll:{x30}', req: 'lvl3' }] },
    { id: 'merchant', rar: 'common', icon: '🧳', name: 'Wandering Merchant', text: 'A cloaked merchant opens a heavy chest. Today, everything is cheap.', dyn: true },
    { id: 'gambler', rar: 'common', icon: '🎲', name: "Gambler's Den", text: 'Double or nothing, stranger?', choices: [
      { label: 'Small bet: 50% to win {g11} gold', act: 'gamble:5:0.5:{g11}', cost: 5, risk: 'You may lose the 5 gold' },
      { label: 'High stakes: 40% to win {g30} gold', act: 'gamble:12:0.4:{g30}', cost: 12, risk: 'You may lose the 12 gold' },
      { label: 'Bet an item: 50% it goes up one rarity, 50% it is lost', act: 'gambleItem', target: 'item', risk: 'The item may be lost' }] },
    { id: 'altar', rar: 'uncommon', icon: '🗿', name: 'Cursed Altar', text: 'Three relics rest on a humming altar. Each one asks a different price.', dyn: true },
    { id: 'fountain', rar: 'common', icon: '⛲', name: 'Fountain of Vigor', text: 'Clear water that glows faintly.', choices: [
      { label: 'Everyone drinks: +8% max HP to all heroes', act: 'hpAll:0.08' },
      { label: 'One hero bathes: +20% max HP to that hero', act: 'hpHero:0.2', target: 'hero' },
      { label: 'Fish out the coins: +{g5} gold', act: 'gold:{g5}' },
      { label: 'Your healer blesses the water: +8% max HP and +10 AP to all heroes', act: 'buffAll', mods: { hpPct: 0.08, ap: 10 }, req: 'healer' }] },
    { id: 'mercs', rar: 'uncommon', icon: '🪖', name: 'Mercenary Camp', text: 'Two sellswords look for work.', dyn: true },
    { id: 'smith', rar: 'common', icon: '⚒️', name: 'Blacksmith', text: 'The forge is still hot.', choices: [
      { label: 'Sharpen: +10 attack to one hero', act: 'buffHero', mods: { atk: 10 }, target: 'hero' },
      { label: 'Reinforce: +15 armor and +15 magic resist to one hero', act: 'buffHero', mods: { armor: 15, mr: 15 }, target: 'hero' },
      { label: 'Reforge: an item becomes a random item of the same type, one rarity higher', act: 'upgradeItem', cost: 5, target: 'item' },
      { label: 'Your fighter works the bellows: reforge an item for free', act: 'upgradeItem', target: 'item', req: 'melee' }] },
    { id: 'library', rar: 'common', icon: '📜', name: 'Ancient Library', text: 'Dusty tomes about forgotten wars.', choices: [
      { label: 'Battle tactics: your heroes start the next fight with +40 mana', act: 'none', next: { manaStart: 40 } },
      { label: 'Forbidden tome: one hero swaps its latest specialization for the other one', act: 'respec', target: 'hero' },
      { label: 'Loot the shelves: a random item', act: 'item:any' },
      { label: 'Your caster studies a spellbook: +20 AP to that hero for good', act: 'buffHero', mods: { ap: 20 }, target: 'hero', req: 'caster' }] },
    { id: 'caravan', rar: 'common', icon: '🐪', name: 'Lost Caravan', text: 'An abandoned caravan, still loaded. Its tracks lead to a bandit camp.', choices: [
      { label: 'Take the gold: +{g6} gold', act: 'gold:{g6}' },
      { label: 'Take the crate: a random item', act: 'item:any' },
      { label: 'Raid the bandit camp now. Win: a rare item', act: 'fight', fight: { kind: 'bandits', name: 'Bandit Camp', win: { item: 'rare' } }, risk: 'A fight: lose it and you get nothing' }] },
    { id: 'shrine', rar: 'uncommon', icon: '🕯️', name: 'Shrine of Sacrifice', text: 'The shrine accepts offerings in exchange for power.', choices: [
      { label: 'Offer gold: a random relic', act: 'relic', cost: 7 },
      { label: 'Offer an item (rare or better): a random relic', act: 'relicItem', target: 'item', minRarity: 'rare' },
      { label: 'Pray: +{x10} XP to all heroes', act: 'xpAll:{x10}' }] },
    { id: 'hut', rar: 'common', icon: '🌿', name: 'Herbalist', text: 'A quiet herbalist sorts roots and powders.', choices: [
      { label: 'Healing tonic: in the next fight your heroes regenerate 2% max HP per second', act: 'none', next: { regen: 0.02 } },
      { label: 'Calming draught: one hero ignores the first crowd control of every fight', act: 'buffHero', mods: { cleanseOnce: 1 }, cost: 4, target: 'hero' },
      { label: 'Sell her your spare herbs: +{g4} gold', act: 'gold:{g4}' },
      { label: 'Your caster brews a mana draught: every hero starts every fight with +10 mana', act: 'buffAll', mods: { manaStart: 10 }, req: 'caster' }] },
    { id: 'recruit', rar: 'common', icon: '🛡️', name: 'Village Militia', text: 'Villagers want to learn from your heroes.', choices: [
      { label: 'Teach them: +{g6} gold', act: 'gold:{g6}' },
      { label: 'Learn from them: +{x10} XP to all heroes', act: 'xpAll:{x10}' },
      { label: 'Rally them: your heroes get +10% attack in the next fight', act: 'none', next: { atkPct: 0.1 } }] },
    { id: 'scout', rar: 'common', icon: '🔭', name: "Scout's Report", text: 'A scout has seen the camp ahead.', choices: [
      { label: "Ambush: the next fight's enemies start with 20% less HP", act: 'none', next: { enemyHp: -0.2 } },
      { label: "Sabotage: the next fight's enemies have 15% less attack", act: 'none', next: { enemyAtk: -0.15 } },
      { label: 'Sell the map: +{g5} gold', act: 'gold:{g5}' },
      { label: "Your archer picks off their captain: the next fight's enemies have 25% less HP", act: 'none', next: { enemyHp: -0.25 }, req: 'ranged' }] },
    { id: 'arena', rar: 'uncommon', icon: '🏟️', name: 'Arena', text: 'The crowd roars. A champion waits in the pit.', choices: [
      { label: 'Fight for glory. The next fight: enemies +35% HP, win it for a legendary item', act: 'none', next: { enemyHp: 0.35, reward: 'legendary' } },
      { label: 'Duel of champions: one hero fights the champion alone now. Win: that hero gets +8% HP and attack for good', act: 'fight', target: 'hero', fight: { kind: 'solo', name: 'Duel of Champions', win: { boost: { hpPct: 0.08, atkPct: 0.08 } } }, risk: 'Only that hero fights' },
      { label: 'Watch and learn: +{x10} XP to all heroes', act: 'xpAll:{x10}' }] },
    { id: 'chest', rar: 'uncommon', icon: '🧰', name: 'Strange Chest', text: 'An iron chest sits alone in the grass. Did it just breathe?', choices: [
      { label: 'Open it: 60% a rare item, 40% it is a Mimic (beat it for an epic item)', act: 'mimic', risk: 'It may be a fight' },
      { label: 'Pick the lock slowly: a rare item', act: 'item:rare', cost: 5 },
      { label: 'Kick it and walk away: +{g3} gold', act: 'gold:{g3}' },
      { label: 'Your archer shoots it from afar first: a rare item, safely', act: 'item:rare', req: 'ranged' }] },
    { id: 'lender', rar: 'uncommon', icon: '💰', name: 'Moneylender', text: 'A smiling banker counts coins. "Money makes money, friend."', choices: [
      { label: 'Invest 8 gold: get {g10} back after your next won fight', act: 'invest:{g10}', cost: 8 },
      { label: 'Invest 15 gold: get {g19} back after your next won fight', act: 'invest:{g19}', cost: 15 },
      { label: 'Take a loan: +{g10} gold now, pay back {g15} after your next won fight', act: 'loan:{g10}:{g15}', risk: 'You pay back more' }] },
    { id: 'bounty', rar: 'uncommon', icon: '📌', name: 'Bounty Board', text: 'Wanted posters flap in the wind. Big rewards, big dangers.', choices: [
      { label: 'Hunt the elite pack now. Win: a relic', act: 'fight', fight: { kind: 'pack', name: 'Elite Pack', win: { relic: 1 } }, risk: 'A hard fight with elites' },
      { label: 'Break the horde now. Win: +{g10} gold', act: 'fight', fight: { kind: 'horde', name: 'The Horde', win: { gold: '{g10}' } }, risk: 'Twice as many enemies' },
      { label: 'Take an easy bounty: +{g5} gold', act: 'gold:{g5}' }] },
    { id: 'alchemist', rar: 'uncommon', icon: '⚗️', name: 'Alchemist', text: 'Bubbling flasks everywhere. "Everything can become something better."', choices: [
      { label: 'Transmute: your two weakest items become one item a rarity above the better of the two', act: 'transmute', risk: 'Two items become one' },
      { label: 'Potion of might: one hero gets +12% attack for good, but 10% less max HP', act: 'buffHero', mods: { atkPct: 0.12, hpPct: -0.1 }, target: 'hero' },
      { label: 'Mystery potion: a random hero gets a random lasting boost', act: 'potion', cost: 4 }] },
    { id: 'fairy', rar: 'rare', icon: '🧚', name: 'Fairy Ring', text: 'Tiny lights dance in a ring of mushrooms. A rare sight!', dyn: true },
    { id: 'hoard', rar: 'rare', after: 2, icon: '🐉', name: "Dragon's Hoard", text: 'Gold glitters in a cave. Something huge sleeps on it.', choices: [
      { label: 'Wake the guardian and fight it now. Win: a legendary item', act: 'fight', fight: { kind: 'hoard', name: "The Hoard's Guardian", win: { item: 'legendary' } }, risk: 'A boss-sized fight' },
      { label: 'Steal a pouch quietly: +{g8} gold', act: 'gold:{g8}' },
      { label: 'Grab one piece of the treasure: a random rare item', act: 'item:rare' }] },
    { id: 'legend', rar: 'rare', icon: '🌟', name: 'Wandering Legend', text: 'A famous hero rests by the road and sizes up your team.', dyn: true },
    { id: 'armory', rar: 'uncommon', icon: '🗡️', name: 'Armory', text: 'Racks of gear. The quartermaster lets you take one piece.', dyn: true },
    { id: 'collector', rar: 'uncommon', icon: '💎', name: 'Collector', text: 'A collector trades in matched gear.', dyn: true },
  ];
  B.EVENT = {}; for (const e of B.EVENTS) B.EVENT[e.id] = e;
  B.EVENT_RARITY = { common: 1, uncommon: 0.7, rare: 0.3 };
  // v44: who can take a "req" choice (FTL's blue options)
  const CASTER_ROLES = ['Mage', 'Controller', 'Healer', 'Summoner', 'Bard', 'Hypnotist', 'Alchemist', 'Beekeeper', 'Tidecaller', 'Stargazer', 'Trickster'];
  const HEALER_ROLES = ['Healer', 'Paladin', 'Bard', 'Beekeeper', 'Tidecaller'];
  B.EVENT_REQ = {
    melee: { name: 'a melee hero', ok: h => B.HEROES[h.key].range <= 1 },
    ranged: { name: 'a ranged hero', ok: h => B.HEROES[h.key].range >= 2 },
    caster: { name: 'a caster', ok: h => CASTER_ROLES.includes(B.HEROES[h.key].role) },
    healer: { name: 'a healer', ok: h => HEALER_ROLES.includes(B.HEROES[h.key].role) },
    lvl3: { name: 'a hero at Lv 3', ok: h => h.lvl >= 3 },
  };

  // ---------------------------------------------------------------- leagues (review #21, David)
  // Everyone starts in Bronze. 10 league points move you up one league; Celestial has no ceiling. +1 for each gauntlet
  // duel won, -2 when a run ends before the gauntlet (a PvE loss). You never drop a league (points stop at 0).
  B.LEAGUES = [
    { id: 'bronze', name: 'Bronze', color: '#b8733d', hi: '#f3bd88' },
    { id: 'silver', name: 'Silver', color: '#8e9aab', hi: '#eef3fa' },
    { id: 'gold', name: 'Gold', color: '#d19b22', hi: '#ffe38f' },
    { id: 'platinum', name: 'Platinum', color: '#2fa89a', hi: '#b5f7ec' },
    { id: 'diamond', name: 'Diamond', color: '#3f7dff', hi: '#c5dcff' },
    { id: 'celestial', name: 'Celestial', color: '#9a4dff', hi: '#f3dcff' },
  ];
  B.LEAGUE_RULES = { step: 10, duelWin: 1, pveLoss: -2 };

  // v27 (owner, 2026-09-29): Crowns, the account currency. Earned the first time you reach each league in a season
  // (leagues reset to Bronze when a season starts) and from friends you referred. Spent in the Crown Shop on perks and
  // the King Tier. Seasons are 28 days long, counted from the launch (Season 1 starts 2026-09-28).
  B.SEASON = { epoch: Date.UTC(2026, 8, 28), days: 28 };
  B.seasonOf = t => 1 + Math.max(0, Math.floor((t - B.SEASON.epoch) / (B.SEASON.days * 864e5)));
  B.seasonEnds = n => B.SEASON.epoch + n * B.SEASON.days * 864e5;
  B.CROWNS = {
    league: [0, 10, 20, 30, 50, 80],   // crowns for reaching Bronze..Celestial the first time in a season (Bronze is the start)
    referPct: 0.01, referMin: 1,       // a referrer gets 1% (at least 1) of every crown their friend earns by playing
  };
  B.SHOP = [
    { id: 'speed4', icon: '⏩', name: '4× battle speed', price: 25, desc: 'Unlocks the 4× speed button in battle. 1× and 2× stay free.' },
    { id: 'elo', icon: '📊', name: 'Content Elo', price: 20, desc: 'Unlocks the Heroes, Items and Relics tabs of the Ladder: the Elo, fights and win rate of every hero, boss, item and relic.' },
    { id: 'rename', icon: '✎', name: 'Name change', price: 10, desc: 'Pick a new name. Your ghosts take it too. Pay each time you change it.', use: true },
    { id: 'king', icon: '👑', name: 'King Tier', price: 300, king: true, desc: "The Royal board skin, only for Kings. Deeper profiles, yours and everyone else's: most played heroes, best win rate heroes, and the record of their ghosts. A crown next to your name. Includes 4× speed and Content Elo." },
  ];
  // v30 (review #28): two more perks
  B.SHOP.splice(2, 0,
    { id: 'xp2', icon: '✨', name: 'Double XP', price: 50, desc: 'Every account XP you earn counts twice, so you level up and unlock new heroes, items and relics faster.' },
    { id: 'skip', icon: '⏭', name: 'Skip fights', price: 100, desc: 'Unlocks the ⏭ button in battle: a fight ends at once with the same result it would have had.' });
  B.SHOP_ITEM = Object.fromEntries(B.SHOP.map(x => [x.id, x]));
  // v30 (review #28, PC boy): account level. 10 XP per level; XP comes from firsts (each hero's first PvE clear, each
  // Gauntlet floor reached for the first time, each boss beaten for the first time) and from crowns spent in the shop.
  // Every level from 2 to 19 unlocks one new hero, item or relic (locked ones never show up in a run before that).
  // v46 (review #57, David: "Bring the player xp progression to the forefront of the game. Scale the xp per level and
  // add some exp after each run depending how it went, and visually show progress after each run with looming rewards"):
  // each level costs more (level L -> L+1 = base + step x (L-1): 80, 100, 120...), every game pays XP by how far it went
  // (B.GAME_XP, at most perHour games an hour count), and the firsts stay as bonuses, x10 to match the new numbers.
  // Players from before keep their level (api/_player.js xpInit converts their XP once).
  B.ACCOUNT = { base: 80, step: 20, heroClear: 10, floor: 50, boss: 30, crownXp: 2 };
  B.GAME_XP = { played: 10, fight: 8, boss: 25, reached: 30, duel: 20, champion: 50, perHour: 12, maxFights: 14 };
  B.UNLOCKS = [
    [2, 'relic', 'beehive'], [3, 'item', 'honeycomb'], [4, 'relic', 'seashell'], [5, 'hero', 'buzzwell'], [6, 'relic', 'kite'],
    [7, 'item', 'starcloak'], [8, 'relic', 'compass'], [9, 'relic', 'teapot'], [10, 'hero', 'coralie'], [11, 'item', 'tidepearl'],
    [12, 'relic', 'snowglobe'], [13, 'relic', 'marbles'], [14, 'item', 'moonslippers'], [15, 'hero', 'stellan'], [16, 'relic', 'fireflies'],
    [17, 'item', 'comethammer'], [18, 'relic', 'pinwheel'], [19, 'relic', 'horseshoe'],
  ].map(([lvl, kind, id]) => ({ lvl, kind, id }));
  B.xpToNext = lvl => B.ACCOUNT.base + B.ACCOUNT.step * (Math.max(1, lvl) - 1);
  B.xpForLevel = lvl => { let s = 0; for (let l = 1; l < lvl; l++) s += B.xpToNext(l); return s; };   // total XP to reach it
  B.levelOf = xp => { let l = 1, left = Math.max(0, xp || 0); while (left >= B.xpToNext(l)) { left -= B.xpToNext(l); l++; } return l; };
  // where an XP total sits: its level, the XP into that level and what the level costs
  B.levelProgress = xp => { const lvl = B.levelOf(xp), into = Math.max(0, xp || 0) - B.xpForLevel(lvl); return { lvl, into, need: B.xpToNext(lvl) }; };
  B.lockedFor = lvl => B.UNLOCKS.filter(u => u.lvl > lvl).map(u => u.id);
  B.hasPerk = (perks, id) => (perks || []).includes(id) || ((id === 'speed4' || id === 'elo') && (perks || []).includes('king'));

  // ---------------------------------------------------------------- terrain (review #39, David)
  // "Add some interesting features to the hex map so the fights aren't all the same ... an impassable ridge, a tree ...
  // a preset rotation that never puts an obstruction on the starting hero/enemy deployment; make those hexes
  // undeployable". Every terrain hex blocks movement and deployment (ranged attacks and spells still fly over it); a
  // push that drives a unit into one slams it (stun + damage). Each map is point-symmetric (c, r) <-> (7-c, 7-r), the
  // same mirror the Gauntlet uses for ghosts, so both sides get the same board.
  B.TERRAIN = {
    tree: { name: 'Tree', icon: '🌳', desc: 'A big leafy tree. Nobody can walk through it or stand on it.' },
    rock: { name: 'Boulder', icon: '🪨', desc: 'A heavy boulder. It blocks the way; units pushed into it are slammed and stunned.' },
    ridge: { name: 'Ridge', icon: '⛰️', desc: 'A rocky ridge. It blocks the way; units pushed into it are slammed and stunned.' },
    pond: { name: 'Pond', icon: '💧', desc: 'Deep water. Nobody can wade through it, but arrows and spells fly over.' },
  };
  const MAP = (id, name, desc, half) => {
    const cells = [];
    for (const [c, r, k] of half) { cells.push({ c, r, k }); if (!(7 - c === c && 7 - r === r)) cells.push({ c: 7 - c, r: 7 - r, k }); }
    return { id, name, desc, cells };
  };
  B.MAPS = [
    MAP('meadow', 'Open Meadow', 'Nothing in the way: a straight fight.', []),
    MAP('oaks', 'Twin Oaks', 'Two old oaks and two boulders split the middle.', [[2, 3, 'tree'], [6, 2, 'rock']]),
    MAP('ridge', 'The Ridge', 'Two ridges leave three lanes: the flanks and a narrow middle.', [[1, 3, 'ridge'], [2, 3, 'ridge']]),
    MAP('boulders', 'Boulder Field', 'Boulders scattered across the field.', [[3, 2, 'rock'], [6, 3, 'rock'], [0, 3, 'rock']]),
    MAP('pond', 'Lily Pond', 'A pond in the centre: the fight goes around it.', [[3, 3, 'pond'], [4, 3, 'pond'], [0, 2, 'tree']]),
    MAP('forest', 'Forest Edge', 'Trees close the sides and push everyone to the middle.', [[0, 3, 'tree'], [0, 4, 'tree'], [1, 2, 'tree']]),
    MAP('choke', 'The Pass', 'A broken ridge with one pass in the middle.', [[0, 3, 'ridge'], [1, 3, 'ridge'], [2, 3, 'ridge']]),
    MAP('cross', 'Crossroads', 'Four boulders make three lanes.', [[2, 3, 'rock'], [5, 3, 'rock']]),
    MAP('stones', 'Standing Stones', 'An old stone circle: open in the middle, stones on the sides.', [[1, 2, 'rock'], [6, 2, 'rock']]),
  ];
  B.MAP = Object.fromEntries(B.MAPS.map(m => [m.id, m]));
  // fight 1 is the Open Meadow; bosses fight at the Standing Stones; the other fights and the Gauntlet floors take the
  // next map of this rotation (where it starts depends on the run)
  B.MAP_ROTATION = ['oaks', 'ridge', 'boulders', 'pond', 'forest', 'choke', 'cross'];

  if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
