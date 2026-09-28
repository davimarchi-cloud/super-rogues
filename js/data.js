// All game content: heroes (+ specs), items, relics, mobs, bosses, events, economy.
// "mods" is the shared vocabulary read by run.js (stats) and sim.js (combat hooks). See CLAUDE.md for the full list.
(function (G) {
  const B = G.B = G.B || {};

  // ---------------------------------------------------------------- economy / pacing
  B.CFG = {
    startGold: 10, hearts: 3, maxTeam: 5, heroCost: 7, reroll: 2,
    itemCost: { common: 3, rare: 5, epic: 8 }, relicCost: 8,
    gold: { easy: 6, medium: 9, hard: 13, boss: 16 },
    xpLevels: [0, 0, 25, 70, 150, 280], // cumulative XP to reach level N (index = level); 1 XP per second alive
    maxLevel: 5, baseSlots: 1,          // item slots: 1 at Lv1-2, +1 at Lv3, Lv4, Lv5
    fightScale: [1, 0.9, 1.1, 1.3, 1.5, 1.75, 2], // by fight number (1..6)
    suddenDeath: 45, fightCap: 150,     // seconds
    waveEvery: 10,                      // onslaught: seconds between waves
    // node sequence: F = fight (2 of easy/medium/hard), X = shop or event (2 options), B = boss (no option),
    // S = final shop choice (2 shops), O = onslaught
    seq: ['F', 'X', 'F', 'X', 'B', 'X', 'F', 'X', 'F', 'X', 'B', 'S', 'O'],
  };

  // ---------------------------------------------------------------- heroes
  // base stats at level 1. as = attacks/sec, ms = hexes/sec, mana = max mana, m0 = starting mana
  const H = (o) => o;
  B.HEROES = {
    bastion: H({ name: 'Bastion', glyph: '🛡', role: 'Tank', color: '#4f7cff',
      hp: 950, atk: 45, armor: 45, mr: 30, as: 0.65, range: 1, ms: 2, mana: 90, m0: 30,
      abil: 'bulwark', abName: 'Bulwark', abDesc: 'Gains a shield of 30% max HP and taunts enemies within 2 hexes for 2.5s.',
      ab: { shield: 0.3, radius: 2, taunt: 2.5, allyShield: 0, burst: 0, stun: 0 },
      specs: [
        [{ id: 'bas2a', name: 'Iron Hide', desc: '+25 armor, +15 magic resist.', mods: { armor: 25, mr: 15 } },
         { id: 'bas2b', name: 'Spiked Plates', desc: 'Reflects 30% of damage taken back to melee attackers.', mods: { thorns: 0.3 } }],
        [{ id: 'bas3a', name: 'Rallying Cry', desc: 'Bulwark also shields allies within 2 hexes for half the amount.', ab: { allyShield: 0.5 } },
         { id: 'bas3b', name: 'Wide Taunt', desc: 'Taunt radius +1 and lasts 1s longer.', ab: { radius: 1, taunt: 1 } }],
        [{ id: 'bas4a', name: 'Last Stand', desc: 'Once per fight, dropping below 30% HP makes Bastion invulnerable for 2s and casts Bulwark.', fl: ['laststand'] },
         { id: 'bas4b', name: 'Shield Burst', desc: 'Casting Bulwark deals magic damage equal to 60% of the shield to adjacent enemies.', ab: { burst: 0.6 } }],
        [{ id: 'bas5a', name: 'Fortress', desc: 'Shield is 60% max HP. +20% max HP.', ab: { shield: 0.3 }, mods: { hpPct: 0.2 } },
         { id: 'bas5b', name: 'Earthshaker', desc: 'Taunted enemies are also stunned for 1.2s.', ab: { stun: 1.2 } }],
      ] }),
    vex: H({ name: 'Vex', glyph: '🗡', role: 'Assassin', color: '#a05cff',
      hp: 560, atk: 72, armor: 20, mr: 20, as: 0.95, range: 1, ms: 3, mana: 60, m0: 40, crit: 0.2,
      abil: 'shadowstep', abName: 'Shadowstep', abDesc: 'Blinks next to the weakest enemy and strikes for 300% attack.',
      ab: { dmg: 3, twin: 0, execute: 0, untarg: 0, mark: 0 },
      specs: [
        [{ id: 'vex2a', name: 'Ambush', desc: 'Shadowstep always critically strikes.', fl: ['ambush'] },
         { id: 'vex2b', name: 'Venom Edge', desc: 'Attacks poison for 2% max HP per second (3s).', mods: { poisonOnHit: 0.02 } }],
        [{ id: 'vex3a', name: 'Twin Step', desc: 'Shadowstep also strikes a second nearby enemy for 60%.', ab: { twin: 0.6 } },
         { id: 'vex3b', name: 'Smoke Veil', desc: 'Untargetable for 1.5s after Shadowstep.', ab: { untarg: 1.5 } }],
        [{ id: 'vex4a', name: 'Executioner', desc: 'Shadowstep kills enemies left below 20% HP.', ab: { execute: 0.2 } },
         { id: 'vex4b', name: 'Bloodrush', desc: 'On kill: refill 60% mana and +30% attack speed for 3s.', fl: ['bloodrush'] }],
        [{ id: 'vex5a', name: 'Death Mark', desc: 'Shadowstep target takes +25% damage from all sources for 5s.', ab: { mark: 0.25 } },
         { id: 'vex5b', name: 'Phantom', desc: '+25% dodge and +1 move speed.', mods: { dodge: 0.25, ms: 1 } }],
      ] }),
    pyra: H({ name: 'Pyra', glyph: '🔥', role: 'Mage', color: '#ff7a3d',
      hp: 520, atk: 40, armor: 15, mr: 30, as: 0.75, range: 3, ms: 2, mana: 70, m0: 20,
      abil: 'fireball', abName: 'Fireball', abDesc: 'Hurls a fireball at the densest enemy group: 240% magic damage in 1 hex and burns.',
      ab: { dmg: 2.4, radius: 1, burn: 0.35, twin: 0, stun: 0, patch: 0 },
      specs: [
        [{ id: 'pyr2a', name: 'Kindling', desc: 'Burn damage doubled.', ab: { burn: 0.35 } },
         { id: 'pyr2b', name: 'Quick Cast', desc: '-20 max mana.', mods: { manaMax: -20 } }],
        [{ id: 'pyr3a', name: 'Big Bang', desc: 'Fireball radius +1.', ab: { radius: 1 } },
         { id: 'pyr3b', name: 'Twin Flame', desc: 'A second fireball hits another group for 50%.', ab: { twin: 0.5 } }],
        [{ id: 'pyr4a', name: 'Scorched Earth', desc: 'Leaves burning ground for 3s.', ab: { patch: 3 } },
         { id: 'pyr4b', name: 'Combustion', desc: 'Burning enemies explode on death (60% attack as magic, 1 hex).', fl: ['combustion'] }],
        [{ id: 'pyr5a', name: 'Meteor', desc: '+80% fireball damage and stuns for 1s.', ab: { dmg: 1.9, stun: 1 } },
         { id: 'pyr5b', name: 'Phoenix', desc: 'Once per fight, revives at 40% HP after dying.', mods: { revive: 0.4 } }],
      ] }),
    glacia: H({ name: 'Glacia', glyph: '❄', role: 'Controller', color: '#5fd4ff',
      hp: 540, atk: 36, armor: 20, mr: 35, as: 0.7, range: 3, ms: 2, mana: 80, m0: 30,
      abil: 'blizzard', abName: 'Blizzard', abDesc: 'Freezes the densest enemy group for 1.5s (180% magic damage), then slows them.',
      ab: { dmg: 1.8, radius: 1, freeze: 1.5, slow: 0.4, shatter: 0, iceArmor: 0 },
      specs: [
        [{ id: 'gla2a', name: 'Deep Freeze', desc: 'Freeze lasts 0.7s longer.', ab: { freeze: 0.7 } },
         { id: 'gla2b', name: 'Chill Touch', desc: 'Attacks slow by 25% for 1.5s.', mods: { slowOnHit: 0.25 } }],
        [{ id: 'gla3a', name: 'Whiteout', desc: 'Blizzard radius +1.', ab: { radius: 1 } },
         { id: 'gla3b', name: 'Shatter', desc: 'Frozen enemies take +30% damage.', ab: { shatter: 0.3 } }],
        [{ id: 'gla4a', name: 'Ice Armor', desc: 'Casting shields Glacia and the weakest ally for 25% max HP.', ab: { iceArmor: 0.25 } },
         { id: 'gla4b', name: 'Frostbite', desc: 'Blizzard deals double damage.', ab: { dmg: 1.8 } }],
        [{ id: 'gla5a', name: 'Absolute Zero', desc: 'Freeze +1s and radius +1.', ab: { freeze: 1, radius: 1 } },
         { id: 'gla5b', name: 'Glacial Prison', desc: 'At fight start, freezes the toughest enemy for 3s.', fl: ['prison'] }],
      ] }),
    brakk: H({ name: 'Brakk', glyph: '🐗', role: 'Bruiser', color: '#c4513a',
      hp: 820, atk: 60, armor: 30, mr: 20, as: 0.8, range: 1, ms: 2.5, mana: 70, m0: 50, ls: 0.1,
      abil: 'charge', abName: 'Charge', abDesc: 'Charges the farthest enemy within 4 hexes, stunning adjacent enemies for 1s and gaining lifesteal.',
      ab: { dmg: 1.5, stun: 1, lsBuff: 0.3, frenzy: 0, sunder: 0, reach: 4 },
      specs: [
        [{ id: 'bra2a', name: 'Bloodthirst', desc: '+15% lifesteal.', mods: { ls: 0.15 } },
         { id: 'bra2b', name: 'Thick Hide', desc: '+250 max HP.', mods: { hp: 250 } }],
        [{ id: 'bra3a', name: 'Stampede', desc: 'Charge stun +0.7s and reach +2.', ab: { stun: 0.7, reach: 2 } },
         { id: 'bra3b', name: 'Frenzy', desc: '+40% attack speed for 4s after charging.', ab: { frenzy: 0.4 } }],
        [{ id: 'bra4a', name: 'Rampage', desc: 'Kills refund 50% mana.', fl: ['rampage'] },
         { id: 'bra4b', name: 'Gore', desc: 'Charge deals double damage and shreds 25 armor for 5s.', ab: { dmg: 1.5, sunder: 25 } }],
        [{ id: 'bra5a', name: 'Juggernaut', desc: 'Immune to crowd control while above 50% HP.', fl: ['juggernaut'] },
         { id: 'bra5b', name: 'Warlord', desc: 'Adjacent allies gain +20% attack.', mods: { aura: [{ r: 1, stat: 'atkPct', val: 0.2 }] } }],
      ] }),
    lumen: H({ name: 'Lumen', glyph: '✚', role: 'Healer', color: '#ffe066',
      hp: 560, atk: 30, armor: 20, mr: 30, as: 0.7, range: 3, ms: 2, mana: 75, m0: 25,
      abil: 'radiance', abName: 'Radiance', abDesc: 'Heals the weakest ally for 35% of their max HP and nearby allies for 15%.',
      ab: { heal: 0.35, splash: 0.15, radius: 1, shield: 0, regen: 0, smite: 0, cleanse: 0 },
      specs: [
        [{ id: 'lum2a', name: 'Purify', desc: 'Radiance also removes stun, slow, root and silence.', ab: { cleanse: 1 } },
         { id: 'lum2b', name: 'Swift Prayer', desc: '-20 max mana.', mods: { manaMax: -20 } }],
        [{ id: 'lum3a', name: 'Sanctuary', desc: 'Splash radius +1 and splash heal +10%.', ab: { radius: 1, splash: 0.1 } },
         { id: 'lum3b', name: 'Aegis Light', desc: 'Radiance also shields the target for 15% max HP.', ab: { shield: 0.15 } }],
        [{ id: 'lum4a', name: 'Smite', desc: 'Attacks deal +50% magic damage; Radiance also smites the nearest enemy for 200%.', mods: { onHitMagic: 0.5 }, ab: { smite: 2 } },
         { id: 'lum4b', name: 'Renewal', desc: 'Radiance leaves 3% max HP regen per second for 5s.', ab: { regen: 0.03 } }],
        [{ id: 'lum5a', name: 'Resurrection', desc: 'Once per fight, revives the first fallen ally at 50% HP.', fl: ['resurrect'] },
         { id: 'lum5b', name: 'Divine Aura', desc: 'All allies gain +15 armor and magic resist.', mods: { aura: [{ r: 9, stat: 'armor', val: 15 }, { r: 9, stat: 'mr', val: 15 }] } }],
      ] }),
    kestrel: H({ name: 'Kestrel', glyph: '🏹', role: 'Ranger', color: '#7bd66b',
      hp: 520, atk: 58, armor: 15, mr: 15, as: 0.9, range: 4, ms: 2, mana: 60, m0: 0,
      abil: 'volley', abName: 'Volley', abDesc: 'Fires 5 arrows at random enemies (100% attack each). Each attack gives +3% attack speed (stacks 15x).',
      ab: { count: 5, dmg: 1, all: 0, pierce: 0, focus: 0.03, focusCap: 15 },
      specs: [
        [{ id: 'kes2a', name: 'Hawkeye', desc: '+1 range and +10% crit chance.', mods: { range: 1, crit: 0.1 } },
         { id: 'kes2b', name: 'Barbed Arrows', desc: 'Attacks poison for 1.5% max HP per second.', mods: { poisonOnHit: 0.015 } }],
        [{ id: 'kes3a', name: 'Multishot', desc: 'Attacks hit a second target for 50%.', mods: { multishot: 0.5 } },
         { id: 'kes3b', name: 'Full Quiver', desc: 'Volley fires 3 more arrows.', ab: { count: 3 } }],
        [{ id: 'kes4a', name: 'Sniper', desc: '+8% damage per hex of distance to the target.', fl: ['sniper'] },
         { id: 'kes4b', name: 'Rapid Fire', desc: 'Focus gives twice as much and stacks 30x.', ab: { focus: 0.03, focusCap: 15 } }],
        [{ id: 'kes5a', name: 'Rain of Arrows', desc: 'Volley hits every enemy.', ab: { all: 1 } },
         { id: 'kes5b', name: 'Piercing Shots', desc: 'Ignore 50% armor, +50% crit damage.', mods: { armorPen: 0.5, critDmg: 0.5 } }],
      ] }),
    morrow: H({ name: 'Morrow', glyph: '💀', role: 'Summoner', color: '#9aa3b5',
      hp: 580, atk: 36, armor: 20, mr: 30, as: 0.7, range: 3, ms: 2, mana: 70, m0: 40,
      abil: 'raise', abName: 'Raise Dead', abDesc: 'Raises 2 skeleton warriors next to Morrow.',
      ab: { count: 2, hpMul: 1, archers: 0, explode: 0, colossus: 0 },
      specs: [
        [{ id: 'mor2a', name: 'Bone Armor', desc: 'Skeletons have +50% HP.', ab: { hpMul: 0.5 } },
         { id: 'mor2b', name: 'Grave Pact', desc: 'Gains 15 mana whenever an enemy dies within 3 hexes.', fl: ['gravepact'] }],
        [{ id: 'mor3a', name: 'Legion', desc: 'Raises one more skeleton.', ab: { count: 1 } },
         { id: 'mor3b', name: 'Bone Archers', desc: 'Skeletons are archers (range 3).', ab: { archers: 1 } }],
        [{ id: 'mor4a', name: 'Corpse Explosion', desc: 'Skeletons explode on death (100% attack, 1 hex).', ab: { explode: 1 } },
         { id: 'mor4b', name: 'Soul Harvest', desc: 'Heals 5% max HP whenever any unit dies.', fl: ['soulharvest'] }],
        [{ id: 'mor5a', name: 'Bone Colossus', desc: 'Raises one giant skeleton instead (4x HP, 2x attack, taunts).', ab: { colossus: 1 } },
         { id: 'mor5b', name: 'Lich Form', desc: '+50 ability power and attacks splash 30%.', mods: { ap: 50, splash: 0.3 } }],
      ] }),
    tempest: H({ name: 'Tempest', glyph: '⚡', role: 'Mage', color: '#b9a8ff',
      hp: 510, atk: 40, armor: 15, mr: 30, as: 0.8, range: 3, ms: 2, mana: 70, m0: 30,
      abil: 'chain', abName: 'Chain Lightning', abDesc: 'Lightning bounces between 4 enemies (200% magic damage) and stuns each for 0.4s.',
      ab: { bounces: 4, dmg: 2.0, stun: 0.4, falloff: 0.1, twice: 0 },
      specs: [
        [{ id: 'tem2a', name: 'Overcharge', desc: 'Chain bounces 2 more times.', ab: { bounces: 2 } },
         { id: 'tem2b', name: 'Static', desc: 'Every 4th attack arcs to 2 more enemies for 60%.', mods: { chainEvery: 4, chainTargets: 2, chainDmg: 0.6 } }],
        [{ id: 'tem3a', name: 'Conductor', desc: 'Chain stun lasts 1s.', ab: { stun: 0.6 } },
         { id: 'tem3b', name: 'Capacitor', desc: 'Starts every fight with full mana.', mods: { manaStart: 999 } }],
        [{ id: 'tem4a', name: 'Storm Surge', desc: 'Casting gives allies within 2 hexes +30% attack speed for 4s.', fl: ['surge'] },
         { id: 'tem4b', name: 'Arc Flash', desc: 'No damage falloff and +40% chain damage.', ab: { falloff: -0.1, dmg: 0.8 } }],
        [{ id: 'tem5a', name: 'Thunderstorm', desc: 'Every 3s a bolt strikes a random enemy for 100% attack.', fl: ['thunderstorm'] },
         { id: 'tem5b', name: 'Eye of the Storm', desc: 'Chain Lightning is cast twice.', ab: { twice: 1 } }],
      ] }),
    grimhook: H({ name: 'Grimhook', glyph: '⚓', role: 'Controller', color: '#2fb3a0',
      hp: 840, atk: 56, armor: 35, mr: 30, as: 0.75, range: 1, ms: 2, mana: 70, m0: 30,
      abil: 'hook', abName: 'Hook', abDesc: 'Pulls the farthest enemy within 5 hexes next to Grimhook, dealing 120% and stunning for 1.5s.',
      ab: { reach: 5, dmg: 1.2, stun: 1.5, count: 1, vuln: 0, whirl: 0, pullAll: 0 },
      specs: [
        [{ id: 'gri2a', name: 'Barbed Chain', desc: 'Hook deals double damage and poisons.', ab: { dmg: 1.2 }, mods: { poisonOnHit: 0.01 } },
         { id: 'gri2b', name: 'Long Chain', desc: 'Hook reach +3.', ab: { reach: 3 } }],
        [{ id: 'gri3a', name: 'Double Hook', desc: 'Pulls two enemies.', ab: { count: 1 } },
         { id: 'gri3b', name: 'Anchor', desc: '+300 max HP and +15 armor.', mods: { hp: 300, armor: 15 } }],
        [{ id: 'gri4a', name: 'Drag Under', desc: 'Hooked enemies take +30% damage for 4s.', ab: { vuln: 0.3 } },
         { id: 'gri4b', name: 'Chain Whirl', desc: 'After hooking, spins to hit all adjacent enemies for 100% and slow them.', ab: { whirl: 1 } }],
        [{ id: 'gri5a', name: 'Dread Anchor', desc: 'Hook stun +1.5s.', ab: { stun: 1.5 } },
         { id: 'gri5b', name: 'Pull of the Deep', desc: 'Also drags every enemy within 3 hexes one step closer and stuns them 1s.', ab: { pullAll: 1 } }],
      ] }),
    mirage: H({ name: 'Mirage', glyph: '🎭', role: 'Trickster', color: '#ff6fb5',
      hp: 540, atk: 55, armor: 18, mr: 25, as: 0.9, range: 2, ms: 3, mana: 60, m0: 20, dodge: 0.15,
      abil: 'mirror', abName: 'Mirror Image', abDesc: 'Creates 2 decoy clones (40% stats) and blinks to the safest hex.',
      ab: { count: 2, stat: 0.4, explode: 0, backstab: 0, silence: 0 },
      specs: [
        [{ id: 'mir2a', name: 'Sharper Images', desc: 'Clones have 60% stats.', ab: { stat: 0.2 } },
         { id: 'mir2b', name: 'Evasion', desc: '+15% dodge.', mods: { dodge: 0.15 } }],
        [{ id: 'mir3a', name: 'Hall of Mirrors', desc: 'One more clone.', ab: { count: 1 } },
         { id: 'mir3b', name: 'Shatterglass', desc: 'Clones explode on death (120% attack, 1 hex) and slow.', ab: { explode: 1.2 } }],
        [{ id: 'mir4a', name: 'Backstab', desc: 'The attack after casting deals triple damage.', ab: { backstab: 3 } },
         { id: 'mir4b', name: 'Confusion', desc: 'Enemies next to a new clone are silenced for 2s.', ab: { silence: 2 } }],
        [{ id: 'mir5a', name: 'Mass Illusion', desc: 'Clones have 80% stats.', ab: { stat: 0.4 } },
         { id: 'mir5b', name: 'Phase Shift', desc: 'Once per fight, lethal damage instead leaves Mirage untargetable for 2s and heals 30%.', fl: ['phaseshift'] }],
      ] }),
    rook: H({ name: 'Rook', glyph: '⚙', role: 'Engineer', color: '#d9a441',
      hp: 620, atk: 42, armor: 25, mr: 20, as: 0.8, range: 2, ms: 2, mana: 70, m0: 50,
      abil: 'turret', abName: 'Deploy Turret', abDesc: 'Builds a turret (range 3) next to Rook. Max 2; at max, repairs them instead.',
      ab: { max: 2, hpMul: 1, asMul: 1, burn: 0, stun: 0, mortar: 0 },
      specs: [
        [{ id: 'roo2a', name: 'Reinforced', desc: 'Turrets have double HP.', ab: { hpMul: 1 } },
         { id: 'roo2b', name: 'Rapid Fire', desc: 'Turrets attack 40% faster.', ab: { asMul: 0.4 } }],
        [{ id: 'roo3a', name: 'Flamethrower', desc: 'Turret shots burn (40% attack per second).', ab: { burn: 0.4 } },
         { id: 'roo3b', name: 'Overclock', desc: 'Max turrets +1.', ab: { max: 1 } }],
        [{ id: 'roo4a', name: 'Tesla Coil', desc: 'Every 3rd turret shot stuns for 0.6s.', ab: { stun: 0.6 } },
         { id: 'roo4b', name: 'Mortar', desc: 'Turrets get range 6 and splash, but shoot slower.', ab: { mortar: 1 } }],
        [{ id: 'roo5a', name: 'Mech Suit', desc: '+50% max HP, +30% attack, attacks cleave 40%.', mods: { hpPct: 0.5, atkPct: 0.3, splash: 0.4 } },
         { id: 'roo5b', name: 'Factory', desc: 'Starts each fight with a turret already built.', fl: ['factory'] }],
      ] }),
  };
  for (const k in B.HEROES) B.HEROES[k].key = k;

  // ---------------------------------------------------------------- items (56)
  const I = (id, name, tier, mods, desc) => ({ id, name, tier, mods, desc });
  B.ITEMS = [
    // common
    I('longsword', 'Long Sword', 'common', { atk: 15 }, '+15 attack'),
    I('chainmail', 'Chainmail', 'common', { armor: 20 }, '+20 armor'),
    I('belt', "Giant's Belt", 'common', { hp: 200 }, '+200 HP'),
    I('recurve', 'Recurve Bow', 'common', { asPct: 0.2 }, '+20% attack speed'),
    I('rod', 'Rod of Power', 'common', { ap: 20 }, '+20 ability power'),
    I('cloak', 'Null Cloak', 'common', { mr: 20 }, '+20 magic resist'),
    I('tear', 'Tear Pendant', 'common', { manaStart: 20 }, '+20 starting mana'),
    I('boots', 'Swift Boots', 'common', { ms: 1 }, '+1 move speed'),
    I('gloves', 'Sparring Gloves', 'common', { crit: 0.1, dodge: 0.05 }, '+10% crit, +5% dodge'),
    I('fang', 'Vampire Fang', 'common', { ls: 0.1 }, '+10% lifesteal'),
    I('buckler', 'Buckler', 'common', { shieldStart: 150 }, 'Starts fights with a 150 shield'),
    I('cap', 'Leather Cap', 'common', { hp: 100, armor: 10 }, '+100 HP, +10 armor'),
    I('whetstone', 'Whetstone', 'common', { atk: 8, asPct: 0.08 }, '+8 attack, +8% attack speed'),
    I('coin', 'Lucky Coin', 'common', { gold: 1 }, '+1 gold after each won fight'),
    I('charm', "Scholar's Charm", 'common', { xpPct: 0.3 }, '+30% XP'),
    I('amber', 'Amber Ring', 'common', { hp: 60, armor: 6, mr: 6 }, '+60 HP, +6 armor and magic resist'),
    I('dagger', 'Dagger', 'common', { atk: 10, crit: 0.05 }, '+10 attack, +5% crit'),
    I('moss', 'Healing Moss', 'common', { regen: 0.01 }, 'Regenerate 1% max HP per second'),
    I('sling', 'Sling', 'common', { range: 1, atk: -5 }, '+1 range, -5 attack'),
    I('focus', 'Focus Crystal', 'common', { manaRegen: 2 }, '+2 mana per second'),
    // rare
    I('bloodthirster', 'Bloodthirster', 'rare', { atk: 20, ls: 0.2 }, '+20 attack, +20% lifesteal'),
    I('thornmail', 'Thornmail', 'rare', { armor: 30, thorns: 0.2 }, '+30 armor, reflects 20% melee damage'),
    I('warmog', "Warmog's Heart", 'rare', { hp: 400, regen: 0.015 }, '+400 HP, 1.5% regen per second'),
    I('crossbow', 'Rapid Crossbow', 'rare', { asPct: 0.35 }, '+35% attack speed'),
    I('deathcap', 'Deathcap', 'rare', { ap: 40 }, '+40 ability power'),
    I('visage', 'Spirit Visage', 'rare', { mr: 30, healPower: 0.25 }, '+30 magic resist, +25% healing received'),
    I('bluecrystal', 'Blue Crystal', 'rare', { manaRegen: 4 }, '+4 mana per second'),
    I('infinity', 'Infinity Edge', 'rare', { crit: 0.25, critDmg: 0.5 }, '+25% crit, +50% crit damage'),
    I('guardplate', 'Guardian Plate', 'rare', { shieldStart: 400 }, 'Starts fights with a 400 shield'),
    I('frozenhammer', 'Frozen Hammer', 'rare', { atk: 15, slowOnHit: 0.3 }, '+15 attack, attacks slow 30%'),
    I('emberblade', 'Ember Blade', 'rare', { atk: 10, burnOnHit: 0.25 }, '+10 attack, attacks burn'),
    I('venomvial', 'Venom Vial', 'rare', { poisonOnHit: 0.02 }, 'Attacks poison 2% max HP/s'),
    I('quicksilver', 'Quicksilver Sash', 'rare', { cleanseOnce: 1, mr: 15 }, 'Ignores the first crowd control, +15 MR'),
    I('phantomdancer', 'Phantom Dancer', 'rare', { dodge: 0.2, asPct: 0.15 }, '+20% dodge, +15% attack speed'),
    I('giantslayer', 'Giant Slayer', 'rare', { giantSlayer: 0.3 }, '+30% damage vs enemies with more max HP'),
    I('executioner', "Executioner's Axe", 'rare', { execute: 0.5, atk: 5 }, '+50% damage vs enemies below 30% HP'),
    I('shojin', 'Spear of Shojin', 'rare', { manaOnHit: 6, atk: 8 }, '+6 mana per attack, +8 attack'),
    I('gunblade', 'Hextech Gunblade', 'rare', { omni: 0.2, ap: 20 }, 'Abilities heal 20% of damage dealt, +20 AP'),
    I('sunfire', 'Sunfire Cape', 'rare', { hp: 200, sunfire: 0.012 }, '+200 HP, burns adjacent enemies'),
    I('scope', "Hunter's Scope", 'rare', { range: 1, crit: 0.05 }, '+1 range, +5% crit'),
    I('banner', 'War Banner', 'rare', { aura: [{ r: 1, stat: 'atkPct', val: 0.15 }] }, 'Adjacent allies +15% attack'),
    I('totem', 'Iron Totem', 'rare', { aura: [{ r: 2, stat: 'armor', val: 12 }, { r: 2, stat: 'mr', val: 12 }] }, 'Allies within 2 hexes +12 armor and MR'),
    I('needle', 'Deadly Needle', 'rare', { atk: 15, antiHeal: 1 }, '+15 attack, attacks halve enemy healing'),
    I('tabi', 'Steel Tabi', 'rare', { ms: 1, armor: 20 }, '+1 move speed, +20 armor'),
    // epic
    I('guardian', 'Guardian Angel', 'epic', { revive: 0.4, armor: 10 }, 'Revives once at 40% HP'),
    I('titan', "Titan's Resolve", 'epic', { titan: 1, hp: 100 }, 'Gains +3 attack and +3 armor per hit (max 20 stacks)'),
    I('rabadon', "Rabadon's Cap", 'epic', { ap: 80 }, '+80 ability power'),
    I('crown', "Warlord's Crown", 'epic', { allPct: 0.2 }, '+20% HP, attack, AP, armor and MR'),
    I('stormbringer', 'Stormbringer', 'epic', { chainEvery: 3, chainTargets: 3, chainDmg: 0.6, asPct: 0.1 }, 'Every 3rd attack chains to 3 enemies'),
    I('morello', 'Morellonomicon', 'epic', { ap: 25, abilityBurn: 0.03 }, 'Abilities burn 3% max HP/s, +25 AP'),
    I('redemption', 'Redemption', 'epic', { hp: 200, onDeathHeal: 0.35 }, 'On death, heals allies within 2 hexes for 35%'),
    I('zeke', "Zeke's Herald", 'epic', { aura: [{ r: 1, stat: 'asPct', val: 0.3 }] }, 'Adjacent allies +30% attack speed'),
    I('botrk', 'Blade of the Ruined King', 'epic', { curHpOnHit: 0.05, ls: 0.1 }, 'Attacks deal 5% current HP, +10% lifesteal'),
    I('stoneplate', 'Gargoyle Stoneplate', 'epic', { armor: 50, mr: 50, asPct: -0.1 }, '+50 armor and MR, -10% attack speed'),
    I('striders', 'Sky Striders', 'epic', { ms: 2, firstMoveAtk: 0.6 }, '+2 move speed, attack after moving deals +60%'),
    I('archangel', "Archangel's Staff", 'epic', { ap: 25, apPerSec: 3 }, '+25 AP, +3 AP every second in combat'),
    I('lastwhisper', 'Last Whisper', 'epic', { armorPen: 0.4, atk: 10 }, 'Ignore 40% armor, +10 attack'),
    I('dragonclaw', 'Dragon Claw', 'epic', { mr: 60, regen: 0.015 }, '+60 MR, 1.5% regen per second'),
  ];
  B.ITEM = {}; for (const it of B.ITEMS) B.ITEM[it.id] = it;

  // ---------------------------------------------------------------- relics (24) — team-wide
  const R = (id, name, desc, o) => Object.assign({ id, name, desc }, o);
  B.RELICS = [
    R('idol', 'Golden Idol', '+3 gold after each won fight.', { gold: 3 }),
    R('drum', 'War Drum', 'All heroes +12% attack speed.', { mods: { asPct: 0.12 } }),
    R('standard', 'Iron Standard', 'All heroes +15 armor.', { mods: { armor: 15 } }),
    R('lens', 'Soul Lantern', 'All heroes +25% XP.', { mods: { xpPct: 0.25 } }),
    R('feather', 'Phoenix Feather', 'The first hero to die each fight revives at 30% HP.', { fl: 'feather' }),
    R('seal', "Merchant's Seal", 'Everything in shops costs 1 less.', { fl: 'seal' }),
    R('dice', 'Loaded Dice', 'First reroll in each shop is free.', { fl: 'dice' }),
    R('font', 'Mana Font', 'Heroes start fights with +30 mana.', { mods: { manaStart: 30 } }),
    R('bloodstone', 'Bloodstone', 'All heroes +8% lifesteal.', { mods: { ls: 0.08 } }),
    R('tooth', "Giant's Tooth", 'All heroes +150 HP.', { mods: { hp: 150 } }),
    R('wits', 'Sharpened Wits', 'All heroes +20 ability power.', { mods: { ap: 20 } }),
    R('clover', 'Four-Leaf Clover', 'All heroes +10% crit chance.', { mods: { crit: 0.1 } }),
    R('backpack', 'Adventurer’s Pack', 'Every hero gets +1 item slot.', { mods: { itemSlots: 1 } }),
    R('crest', "Hero's Crest", 'Team size limit +1.', { fl: 'crest' }),
    R('vengeance', 'Vengeful Spirit', 'When a hero dies, the others gain +20% attack.', { fl: 'vengeance' }),
    R('frostsigil', 'Frost Sigil', 'Enemies start every fight slowed by 40% for 4s.', { fl: 'frostsigil' }),
    R('thunder', 'Thunder Totem', 'Every 4s lightning strikes a random enemy.', { fl: 'thunder' }),
    R('spring', 'Healing Spring', 'Heroes regenerate 1% max HP per second.', { mods: { regen: 0.01 } }),
    R('firststrike', 'Opening Gambit', 'Heroes start fights with a shield of 20% max HP.', { mods: { shieldStartPct: 0.2 } }),
    R('purse', 'Coin Purse', 'Gain 10 gold now, and +1 gold per 10 held after each fight.', { fl: 'purse' }),
    R('tome', 'Elder Tome', 'All current heroes gain 45 XP now.', { fl: 'tome' }),
    R('onslaught', 'Onslaught Banner', 'Heroes deal +30% damage in the Onslaught.', { fl: 'onslaught' }),
    R('wind', 'Swift Wind', 'All heroes +1 move speed.', { mods: { ms: 1 } }),
    R('mark', "Hunter's Mark", '+25% damage to elites and bosses.', { mods: { eliteDmg: 0.25 } }),
  ];
  B.RELIC = {}; for (const r of B.RELICS) B.RELIC[r.id] = r;

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
    knight: M({ name: 'Dark Knight', glyph: '♞', hp: 800, atk: 45, armor: 35, mr: 35, as: 0.8, range: 1, ms: 2.2, shield: 250, cost: 2.4 }),
    imp: M({ name: 'Imp', glyph: '😈', hp: 180, atk: 18, armor: 0, mr: 0, as: 1.2, range: 1, ms: 3.5, cost: 0.5 }),
  };
  for (const k in B.MOBS) B.MOBS[k].key = k;
  B.BOSSES = {
    gorewarden: { key: 'gorewarden', name: 'Gorewarden', glyph: '👹', boss: 1, hp: 2400, atk: 50, armor: 40, mr: 30, as: 0.65, range: 1, ms: 1.8, mana: 55, abil: 'cleave',
      desc: 'Cleaves everything around it. Calls the horde at half health and enrages at 25%.', escort: ['grunt', 'grunt', 'archer'] },
    hollowking: { key: 'hollowking', name: 'The Hollow King', glyph: '👑', boss: 2, hp: 2700, atk: 52, armor: 45, mr: 45, as: 0.7, range: 2, ms: 2, mana: 60, abil: 'nova',
      desc: 'Void Nova stuns everything near it. Rends the weakest hero from afar. Splits its court at 66% and 33%.', escort: ['hexer', 'archer'] },
  };
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
    4: ['grunt', 'archer', 'brute', 'skulker', 'shaman', 'bomber', 'hexer', 'spitter', 'shieldbearer'],
    5: ['archer', 'brute', 'skulker', 'shaman', 'bomber', 'hexer', 'golem', 'summoner', 'shieldbearer', 'knight'],
  };
  B.DIFF = {
    easy: { name: 'Easy', budget: 3.2, elites: 0 },
    medium: { name: 'Medium', budget: 4.6, elites: 0 },
    hard: { name: 'Hard', budget: 5.8, elites: 1 },
  };

  // ---------------------------------------------------------------- events
  // each choice: { label, act: string handled in run.js, req?: {gold} }
  B.EVENTS = [
    { id: 'training', name: 'Training Grounds', text: 'Old veterans offer to drill your team.', choices: [
      { label: 'Drill everyone (+20 XP to all heroes)', act: 'xpAll:20' },
      { label: 'Private lessons (+50 XP to a random hero)', act: 'xpOne:50' }] },
    { id: 'merchant', name: 'Wandering Merchant', text: 'A cloaked merchant opens a heavy chest.', choices: [
      { label: 'Buy a mystery rare item (6 gold)', act: 'buyRare:6', req: { gold: 6 } },
      { label: 'Take the free trinket (common item)', act: 'item:common' }] },
    { id: 'gambler', name: "Gambler's Den", text: 'Double or nothing, stranger?', choices: [
      { label: 'Bet 5 gold (50%: win 12)', act: 'gamble:5:12', req: { gold: 5 } },
      { label: 'Walk away', act: 'none' }] },
    { id: 'altar', name: 'Cursed Altar', text: 'A relic rests on a humming altar. Something watches.', choices: [
      { label: 'Take the relic (next fight: enemies +30% HP)', act: 'curseRelic' },
      { label: 'Leave it', act: 'none' }] },
    { id: 'fountain', name: 'Fountain of Vigor', text: 'Clear water that glows faintly.', choices: [
      { label: 'Drink (+8% max HP to all heroes, permanent)', act: 'hpAll:0.08' },
      { label: 'Fill your purse with the coins inside (+6 gold)', act: 'gold:6' }] },
    { id: 'mercs', name: 'Mercenary Camp', text: 'A sellsword looks for work.', choices: [
      { label: 'Hire a random hero (4 gold)', act: 'hire:4', req: { gold: 4 } },
      { label: 'Move on', act: 'none' }] },
    { id: 'smith', name: 'Blacksmith', text: 'The forge is still hot.', choices: [
      { label: 'Sharpen: a random hero gets +12 attack', act: 'statOne:atk:12' },
      { label: 'Reinforce: a random hero gets +20 armor', act: 'statOne:armor:20' }] },
    { id: 'library', name: 'Ancient Library', text: 'Dusty tomes about forgotten wars.', choices: [
      { label: 'Study (+35 XP to the lowest level hero)', act: 'xpLow:35' },
      { label: 'Loot the shelves (random item)', act: 'item:any' }] },
    { id: 'caravan', name: 'Lost Caravan', text: 'An abandoned caravan, still loaded.', choices: [
      { label: 'Take the gold (+10)', act: 'gold:10' },
      { label: 'Take the crate (random item)', act: 'item:any' }] },
    { id: 'shrine', name: 'Shrine of Sacrifice', text: 'Give up some of your resolve for power.', choices: [
      { label: 'Sacrifice 1 heart for a relic', act: 'heartRelic', req: { hearts: 2 } },
      { label: 'Refuse', act: 'none' }] },
    { id: 'hut', name: "Healer's Hut", text: 'A quiet healer offers rest.', choices: [
      { label: 'Rest (+1 heart, max 3)', act: 'heart' },
      { label: 'Buy herbs instead (+4 gold)', act: 'gold:4' }] },
    { id: 'recruit', name: 'Village Militia', text: 'Villagers want to learn from your heroes.', choices: [
      { label: 'Teach them (+8 gold)', act: 'gold:8' },
      { label: 'Learn from them (+12 XP to all)', act: 'xpAll:12' }] },
  ];
  B.EVENT = {}; for (const e of B.EVENTS) B.EVENT[e.id] = e;

  if (typeof module !== 'undefined') module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
