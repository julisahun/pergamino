/* The model, written down once, as types.

   There is no runtime code in this file on purpose. Every module that
   touches a session imports its typedefs from here, so "what a session IS"
   has exactly one definition and `tsc --checkJs` enforces it. The previous
   app had no such file, and paid for it: the television's rendering was
   derived from two independent booleans (`live`, `grid`) that nothing named,
   so the admin could truthfully say one thing while the television showed
   another.

   The one rule this file exists to hold: THE TELEVISION HAS ONE MODE, it is
   stored, and nothing derives it.

   Note the language split. Field *values* the DM reads about at the table are
   Spanish ('nada' | 'escena' | 'tablero'), because they are the vocabulary
   spoken out loud in the room; every identifier around them is English. */

/* ------------------------------------------------------------------ refs */

/** A player or an npc instance, addressed the same way everywhere.
    @typedef {`pc:${string}` | `npc:${string}`} Ref */

/** @typedef {'pc' | 'npc'} Kind */

/** @typedef {{ x: number, y: number }} XY */

/* --------------------------------------------------------------- the field
   What the television is showing, and the only place that fact lives. */

/** The television's one mode.
     'nada'    — nothing; the players' screen is dark chrome, no picture.
     'escena'  — a picture, full-bleed. No grid, no tokens.
     'tablero' — the grid, with tokens on it (over the picture if there is one).
    @typedef {'nada' | 'escena' | 'tablero'} FieldMode */

/** How much a given npc's hit points are allowed to travel.
    @typedef {'none' | 'coarse' | 'exact'} HpDisclosure */

/** A picture: a campaign-relative path. The projection resolves it to
    something the television can load; nothing else ever does.
    @typedef {{ src: string }} Art */

/** One sound layer. `volume` is this scene's own mix, 0…1; a deliberate 0 is
    a layer turned all the way down, not a missing one.
    @typedef {{ src: string, volume: number, loop: boolean }} AudioLayer */

/** @typedef {{ music: AudioLayer|null, ambience: AudioLayer|null }} AudioMix */

/** What the players are allowed to learn about one npc. Hidden by default.
    @typedef {{ on: boolean, hp: HpDisclosure }} Reveal */

/**
 * @typedef {Object} Field
 * @property {FieldMode} mode   what the television is showing. Stored, never
 *   derived, written only by the mode control.
 * @property {boolean} hud      whether the party and turn-order strips ride
 *   along with the picture. A second stated fact, not a consequence of combat.
 * @property {boolean} paused   the television keeps the last projection it
 *   was given; nothing new reaches it until this clears. Never a synonym for
 *   any of the modes above, and never called "en vivo".
 * @property {number} cols
 * @property {number} rows
 * @property {string|null} sceneId  which prepared scene the picture came from.
 * @property {Art|null} map
 * @property {AudioMix|null} audio
 * @property {Record<string, XY>} tokens   keyed by Ref
 * @property {Record<string, Reveal>} reveal   keyed by npc id
 * @property {string[]} benched   player Refs taken off the board on purpose
 */

/* --------------------------------------------------------------- play state */

/** @typedef {{ ok: number, fail: number }} DeathSaves */

/**
 * One creature's play state — everything that happens TO them at the table,
 * as opposed to what they are.
 * @typedef {Object} Play
 * @property {number|null} hp  null means "untouched, therefore full". Never
 *   collapse it to 0: `Number(null) === 0` is how a character ends up on the
 *   floor for having done nothing.
 * @property {number} temp
 * @property {string[]} conditions   condition keys, see shared/conditions.js
 * @property {number} exh            exhaustion, 0…6
 * @property {DeathSaves} death
 * @property {string} note
 * @property {number} gold
 * @property {string} inventory      free text
 * @property {string[]} objects      ids into the objects catalog
 * @property {Record<string, number>} spent  expendables spent: spell slots by
 *   level ('1'…'9', 'pact') and per-day features by key.
 */

/**
 * @typedef {Object} Encounter
 * @property {boolean} on
 * @property {number} round
 * @property {Ref|null} activeRef
 * @property {string[]} members   Refs in this fight
 * @property {Record<string, number>} init   Ref -> total. An ABSENT ref has
 *   not rolled yet, which is not the same as being out of the fight.
 */

/**
 * The whole table. On disk this is `session.json` inside the open run, minus
 * `party`, `bestiary` and `objects`, which live in their own files and are
 * injected at load — the session never stores a second copy of them.
 * @typedef {Object} Session
 * @property {number} version
 * @property {Character[]} party
 * @property {Record<string, Play>} play        keyed by character id
 * @property {Record<string, string>} playerFiles  character id -> its file
 * @property {Beast[]} bestiary
 * @property {ItemDef[]} objects
 * @property {Npc[]} npcs
 * @property {Encounter} encounter
 * @property {Field} field
 */

/* ------------------------------------------------------------------ entities
   Only what this app reads. A monster here is a card at a table, not a
   statblock; a character is the creator's own build recipe, and every number
   printed from it is computed by the rules engine, never stored. */

/** @typedef {{ id: string, name: string, desc: string }} Ability */

/** A portrait: a path into the campaign, or inline downscaled bytes (what the
    in-app portrait editor produces).
    @typedef {{ src: string|null, stamp: string|null }} Portrait */

/**
 * @typedef {Object} Beast
 * @property {string} id
 * @property {string} name
 * @property {string} tag
 * @property {number} ac
 * @property {number} hpMax
 * @property {number} initMod
 * @property {number|null} speed   metres; null = does not move / unknown
 * @property {string} note
 * @property {Portrait|null} portrait
 * @property {Ability[]} abilities
 * @property {string[]} objects
 * @property {string} [file]       the file it was read from
 */

/** A seated copy of a Beast, with its own play state mixed in.
    @typedef {Beast & Play} Npc */

/**
 * An item. `mods` are the only five numbers the app computes; everything else
 * an item does is `effects` — shown to the DM, applied by the DM.
 * @typedef {Object} ItemDef
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {{ ac?: number, hpMax?: number, initMod?: number, speed?: number, pp?: number }} mods
 * @property {string[]} effects
 * @property {string} [file]
 */

/** One roster entry of a prepared scene: who is standing where.
    @typedef {{ beastId: string, x: number, y: number, objects: string[] }} RosterEntry */

/**
 * @typedef {Object} Scene
 * @property {string} id
 * @property {string} name
 * @property {Art|null} art
 * @property {AudioMix|null} audio
 * @property {RosterEntry[]} roster
 * @property {number|null} cols   the grid this scene wants; rows derive from
 *   the art's own proportions, so a scene never stores them.
 * @property {string} note
 * @property {string} [file]
 */

/** A story note. `body` is the markdown as written; the renderer owns the
    subset it understands.
    @typedef {{ path: string, group: string, title: string, body: string, layer: Layer }} Note */

/* ------------------------------------------------------------- characters
   The creator's export shape, kept as an input format, plus the progression
   this app owns above level 1. Only the fields this app reads are typed;
   the rest travel untouched, because a character file belongs to its player.
   @see rules/character.js */

/** A pool of uses the DM tracks on a card: Second Wind, Rage, Channel
    Divinity, Bardic Inspiration. Named here rather than derived, because what
    a class feature IS at each level is free text in this app — see
    rules/levels.js for why.
    @typedef {{key: string, name: string, uses: number, per: 'corto'|'largo'}} Resource */

/** One level gained after the first. Free-text features on purpose: the SRD
    is not transcribed here, the DM writes what the level gave.
    @typedef {Object} LevelUp
    @property {number} level
    @property {number} hp        hit points gained at this level
    @property {Record<string, number>} asi   ability increases taken here
    @property {string} subclass  free text, set at the level the class picks one
    @property {Ability[]} features
 */

/**
 * A character, in the creator's own vocabulary: a build recipe, not a
 * statblock. Every number on the card — hit points, armour class, saves,
 * skills, spell save DC, attacks — is computed from this by rules/engine.js
 * and stored nowhere.
 *
 * `levels` is the one field this app owns that the creator does not write. A
 * sheet exported at level 1 has none; levelling up here appends to it, and a
 * re-import of the same sheet refreshes the recipe without touching it.
 *
 * @typedef {Object} Character
 * @property {string} id
 * @property {number} updatedAt
 * @property {string} name
 * @property {string} player
 * @property {string} appearance
 * @property {Portrait|null} portrait
 * @property {string|null} species
 * @property {string|null} lineage
 * @property {string|null} size
 * @property {string[]} speciesSkills
 * @property {string|null} extraFeat     the Human's second origin feat
 * @property {string|null} class
 * @property {string[]} classSkills
 * @property {string[]} masteries        weapon masteries chosen at level 1
 * @property {string[]} expertise
 * @property {string|null} fightingStyle
 * @property {string|null} divineOrder
 * @property {string|null} primalOrder
 * @property {string|null} background
 * @property {Record<string, number>} boosts   the background's ability boosts
 * @property {string[]} featSkills
 * @property {string[]} featTools
 * @property {{list: string|null, cantrips: string[], level1: string|null}|null} magicInitiate
 * @property {Record<string, number>} buy      the point-buy purchase, 8…15 each
 * @property {string} equipmentClass           a package letter, not a shopping list
 * @property {string} equipmentBackground
 * @property {{ cantrips: string[], level1: string[] }} spells
 * @property {{personality: string, ideals: string, bonds: string, flaws: string,
 *             backstory: string, ties: string}} story
 * @property {{answers: Record<string, unknown>, applied: boolean}} [quiz]
 * @property {number} [wizardStep]
 * @property {boolean} [wizardDone]
 * @property {LevelUp[]} [levels]   one entry per level above 1, in order
 * @property {Resource[]} [resources]  per-rest pools the DM tracks with pips
 */

/* ------------------------------------------------------------------- runs
   Two layers. The campaign folder holds the preparation every table shares;
   `runs/<mesa>/` holds what one table did with it. A campaign with no runs/
   is flat: the root is its one implicit run. */

/** Where a file lives, and therefore who it belongs to.
    @typedef {'campaign' | 'run'} Layer */

/**
 * @typedef {Object} Run
 * @property {string} slug    'guils', '' for a flat campaign's implicit run,
 *   '#prep' for preparation-only mode.
 * @property {string|null} path  the run's folder, campaign-relative; '' is the
 *   campaign root, null is preparation-only mode (there is no table).
 * @property {string|null} label
 * @property {boolean} prep
 */

/* ------------------------------------------------------- the projection
   What leaves for the television. Never the session: only what the players
   are allowed to see, already filtered, with every path already resolved.
   A hidden npc is ABSENT from this object, not merely unrendered.

   The admin renders this same object back at the DM (with audience 'dm', so
   hidden npcs survive, marked) — the mirror is not a second renderer that
   resembles the television, it is the television's own payload. */

/** @typedef {'tv' | 'dm'} Audience */

/** Exact hit points, or one of five words, or nothing at all.
    @typedef {{ mode: 'exact', cur: number, max: number, pct: number }
             | { mode: 'coarse', word: string, pct: number }} TokenHP */

/** @typedef {{ round: number, active: string|null }} Banner */

/**
 * @typedef {Object} OrderEntry
 * @property {string} name       '···' for an npc the players may not know of
 * @property {string|null} portrait
 * @property {Kind} kind
 * @property {boolean} active
 * @property {boolean} down
 * @property {boolean} [hidden]  audience 'dm' only
 */

/**
 * @typedef {Object} PartyEntry
 * @property {string} name
 * @property {string|null} portrait
 * @property {string} colour
 * @property {number} hp
 * @property {number} hpMax
 * @property {number} temp
 * @property {string} state
 */

/**
 * @typedef {Object} NpcEntry
 * @property {string} name
 * @property {string|null} portrait
 * @property {TokenHP|null} hp
 * @property {boolean} [hidden]  audience 'dm' only
 */

/**
 * @typedef {Object} TokenEntry
 * @property {string} id     the Ref it moves
 * @property {string} name
 * @property {Kind} kind
 * @property {string|null} colour
 * @property {string|null} portrait
 * @property {number} x
 * @property {number} y
 * @property {boolean} active
 * @property {TokenHP|null} hp
 * @property {string[]} conditions
 * @property {number|null} reach
 * @property {boolean} [hidden]  audience 'dm' only
 */

/**
 * @typedef {Object} Projection
 * @property {number} seq
 * @property {Audience} audience
 * @property {FieldMode} mode
 * @property {boolean} hud
 * @property {number} cols
 * @property {number} rows
 * @property {{ src: string }|null} map   src is loadable as-is by whoever gets it
 * @property {{ music: AudioLayer|null, ambience: AudioLayer|null, master: number }|null} audio
 * @property {Banner|null} banner
 * @property {OrderEntry[]} order
 * @property {PartyEntry[]} party
 * @property {NpcEntry[]} npcs
 * @property {TokenEntry[]} tokens
 */

export {};
