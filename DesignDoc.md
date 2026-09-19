# JevTactics Design Document

Status: initial design discussion; simulation implementation has not been approved.

## Collaboration

The user is the Designer. Codex is the programmer. Discuss gameplay and architecture before implementing this foundation. Record agreed decisions here; distinguish proposals from confirmed requirements. Update this document as the design evolves.

## Confirmed direction

JevTactics uses a needs-based AI system. The game begins in the Stone Age. Entities craft, build societies, and unlock crafting recipes as their societies advance. Societies may choose to invade others. These are confirmed long-term directions, not authorization to implement crafting, progression, or warfare during the foundation discussion.

Three foundational classes provide the information Jev uses:

| Class | Responsibility |
| --- | --- |
| World | Environmental context. Initially, only current weather. Future possibilities include time of day and day of the week. |
| Grid | Spatial information: what exists around an entity and the contents of cells. |
| Entity | An entity's memories, attributes, needs, resources, and grid position. |

Initial entity data:

- Attribute: Vision Range, determining how far around itself an entity knows about cells and their contents.
- Attribute: Strength, determining traversable height differences.
- Needs: Thirst, Hunger, Sleep.
- Resources: Health, Stamina.

Confirmed influence paths: **Weather → Stamina → Needs**, **Weather → Needs**, and **Unmet Needs → Health loss**. Weather does not directly damage Health. Exact effects and rates remain undecided.

Approved weather behavior:

- Comfortable weather allows normal Stamina recovery.
- Uncomfortable weather slows Stamina recovery or drains Stamina.
- Extreme weather affects more of the existing needs, more severely; it does not directly damage Health.
- Combined conditions modify severity, such as cold rain becoming harsher with strong wind.

Weather directly modifies individual need accumulation rates as well as influencing them through Stamina. Agreed qualitative examples: extreme heat strongly accelerates Thirst; freezing conditions accelerate Hunger and Sleep. Exact strengths and the complete condition-to-need mapping remain undecided. Stamina depletion alone does not cause Health damage.

Needs accumulate over time independently of resource levels. Resource depletion and recovery modify needs in real time. Needs are not derived entirely from current Health and Stamina. Resource recovery slows need accumulation; it does not reduce existing need urgency. Exact modifiers and actions that satisfy needs remain undecided.

Each need ranges from **0 to 100**: 0 means satisfied, and 100 means critical. A need begins damaging Health when it reaches 100 and continues while it remains at 100. Its Health damage stops when that need drops below 100; other critical needs can still cause damage. No earlier damage threshold or grace period is required. Damage rates and how damage from multiple critical needs combines remain undecided.

Weather has exactly one core type and multiple subtypes. Starting core types are **Clear, Cloudy, Raining, Storming**; **Hot** is a subtype rather than a competing core type. Designer examples: `Cloudy/Hot/Windy` and `Raining/Cool/Stiff_Breeze`. The Designer has approved the following starting subtype groups and values, with one value per applicable group:

| Group | Approved values |
| --- | --- |
| Temperature | Freezing, Cold, Cool, Mild, Warm, Hot, Extreme Heat |
| Wind | Calm, Light Breeze, Stiff Breeze, Windy, Gale |
| Humidity | Dry, Moderate, Humid |
| Precipitation intensity | Light, Moderate, Heavy — when precipitation is present |

Subtypes from different groups combine; contradictory values within a group do not. For example: `Raining/Cool/Stiff_Breeze/Humid/Heavy`. Exact resource effects and interaction strengths remain undecided.

## Current implementation

The project is C++20 with a Node backend. `main.cpp` sends a sample combat state to Jev and prints a decision. There is no implemented World, Grid, Entity, simulation loop, or graphical game in the inspected source.

`jev_client.h/.cpp` sends a JSON state and questions to the local backend. The backend does not retain entity memory between requests. The future simulation must explicitly supply the information Jev should know.

## Foundation details — confirmed requirements and labeled proposals

### World

Expose current weather shared by the simulation, using the confirmed core types and subtype groups above. Proposed initial control: manually selected weather; automatic changes and a calendar can follow later. Internal representation and resource effects need design decisions.

Keep weather data separate from the rules that apply its effects so the Designer can tune effects without changing what World means.

Proposed initialization: default temperature/wind/humidity values describe neutral conditions rather than missing data. Specific defaults remain undecided.

For later depth, numeric temperature, wind speed, and humidity could drive the rules while readable subtype labels summarize them for Jev. Exact units, thresholds, and whether to use numeric values initially are undecided.

Condition interactions are approved in principle; their exact effects remain undecided. Coherent transitions and entity exposure/shelter remain proposed future additions. Avoid counting a core effect and its subtype effect twice. Direct weather-to-need modifiers and indirect effects through Stamina are intentional separate influences; their combined strength needs tuning.

### Grid

Confirmed: the grid is flat with two-dimensional integer coordinates and a separate height per cell. Each `1.0f` of height represents one foot; the `0.5f` height increment therefore represents six inches. Horizontal cell dimensions remain undecided.

| Cell field | Confirmed representation |
| --- | --- |
| Position | `iVec2` integer position |
| height | Float in increments of `0.5f`; negative values are allowed |
| CellTerrain | String |
| CellContents | Array of structures representing world objects |
| isWalkable | Boolean |
| BlocksLOS | Boolean |
| OccupiedBy | One Entity reference/pointer, or `nullptr` when unoccupied; separate from CellContents |

Designer example: a cell at height `-1.5f`, terrain `Puddle`, containing an object named `DampGrass` with `object_types` including `alchemy`, `carpentry`, and `sustenance`, and worth `0 cp`. Object fields beyond name, multiple object types, and worth remain to be defined, including interaction properties and currency representation. A type tag alone does not yet define an object's mechanical effects.

Confirmed vision: a BFS wrapper checks line of sight within a circle around an entity and returns visible cells and their data, limited by Vision Range. Height affects LOS. Blocking cells are themselves visible when otherwise in line of sight, but obscure the view beyond them. This replaces the earlier square/no-obstruction proposal. Implementation must check LOS from the observer; BFS reachability alone must not reveal cells around opaque corners. Exact circle boundary, corner visibility, observer eye height, and elevation/obstruction geometry remain undecided.

Confirmed movement: entities can move diagonally, at a higher Stamina cost than cardinal movement. Exact costs and diagonal corner-cutting rules remain undecided. Each cell has at most one entity occupant through OccupiedBy. Resolution of competing moves and swaps remains undecided.

Traversable height differences depend on Strength. The Designer clarified that the original 2.0f starting limit and 20.0f cap describe traversable height differences, not Strength values. The Designer is reconsidering those limits, suggesting a possible 10.0f starting limit scaling toward 100.0f, and welcomes alternatives. Final limits and the Strength-to-height formula are not settled.

Confirmed design intent: climbing a 20-foot cliff should consume physical resources, with a fitter/stronger entity traversing it more efficiently than a less capable entity. Agility was mentioned as a possible factor, but is not yet an approved additional attribute. Uphill versus downhill rules remain undecided.

Proposed traversal model, pending agreement:

- Separate ordinary movement over small elevation changes from a climbing action over larger changes.
- Start ordinary step-up traversal at a maximum two-foot rise; do not scale that limit into a 20–100-foot ordinary step.
- Treat larger rises as climbs whose availability depends on surface climbability, capability, and eventually equipment. Strength influences climbing Stamina cost and possibly speed/capability; height alone is insufficient to determine climbability.
- A 10-foot initial climbing limit and 100-foot later limit could be tunable progression values, but are not yet selected. Prefer resource costs and climbing conditions over a universal height cap derived only from Strength.
- Climbing duration, intermediate progress, interruption/exhaustion behavior, surface data, and equipment are unresolved. No fall-damage mechanic is implied by this proposal.

Proposed: finite grid bounds, stable entity IDs, and one authoritative placement operation that keeps entity position and OccupiedBy consistent. OccupiedBy must not own or duplicate an entity's state; lifetime/removal handling must prevent dangling references.

### Entity

Confirmed entity data includes grid position, Vision Range, Strength, the three needs, the two resources, and memories. A stable ID remains a proposed implementation detail.

Scales:

- Proposed: resources range from 0 to 100; higher means more available.
- Confirmed: needs range from 0 to 100; higher means more urgent, with Health damage at 100 as specified above. Sleep means the need to sleep, not time already slept.
- Proposed: Vision Range is a nonnegative number of cells.

Initial values, damage rates, how multiple critical needs combine their damage, and zero-resource consequences are undecided.

Confirmed memory scope: encountered entities, important details about them, what occurred between entities previously, and locations of interest. Memories can become stale; remembered information is not guaranteed to describe the present world.

Designer examples:

- A cave remembered as uninhabited may contain a Bear entity on a later visit.
- An entity may search for someone it previously encountered without knowing that person has since died; it must discover the change.

Out-of-sight world changes must not automatically refresh an entity's memories. Entities share information through social interactions; another entity's private knowledge is not automatically shared. Future traits will help Jev determine whether an entity shares or hoards information. Those traits are not part of the initial attribute set.

Proposed memory fields: subject/entity ID or location, remembered details/events, observation time or simulation step, and information source. Keep current observations separate from remembered facts and reports from others. Explicit forgetting, memory limits, communication range/actions, and how conflicting or stale reports are handled remain undecided. Staleness does not by itself imply forgetting.

### Entity decision loop

Confirmed: an entity examines its Needs and Resources to determine an action or goal such as `find_food`, `find_water`, `find_shelter`, or `find_bed`. It considers cells visible within Vision Range, chooses a neighboring cell, and decides to move there.

Jev receives the visible cells and their properties for every entity being evaluated, determines the need to address, and decides each entity's next movement, interaction target, and action based on its needs. Jev therefore makes both goal/action and immediate movement decisions; it is not limited to selecting a high-level goal for a separate pathfinder.

Proposed decision representation: entity ID, chosen goal, next neighboring cell (or no movement), interaction target, and action. Exact action vocabulary, whether movement and interaction can occur together, and decision cadence remain undecided.

### Simulation and Jev boundary

Proposed responsibility split: C++ owns state, applies numerical rules, and validates actions. Jev receives weather and each evaluated entity's own attributes/resources/needs, visible cells, and explicitly identified memories, then returns per-entity decisions as described above.

Confirmed knowledge boundary: entities use their own observations, memories, and information explicitly shared with them. Proposed implementation: label visibility and memory by observer even when multiple entities are evaluated together, so one entity does not act on another's private observations. Logical all-entity evaluation does not yet require a single HTTP request; batching must respect the existing backend request limits. Validate movement and interaction against current game state, including conflicts between entity decisions, before applying them.

Proposed implementation: use elapsed simulation time to accumulate needs and apply resource modifiers on each simulation update, independently of Jev requests. Fixed simulation steps can support real-time updates and reproducible tests. Real-time resource-to-need effects are confirmed; the prototype's presentation and time controls remain undecided. This does not require a time-of-day/calendar system.

Proposed update order: apply weather effects to Stamina, accumulate needs with the agreed modifiers, apply Health damage from unmet needs, refresh perception and memory, then request a decision when appropriate. Any resulting Health-to-need modifier would affect the next simulation update to avoid circular recalculation within one step. Actions and their costs/restoration rules are a later design decision.

Example for discussion only: harsh weather reduces Stamina; lower Stamina increases Sleep urgency; leaving that need unmet eventually damages Health. How Health and Stamina affect each need still needs to be defined. Direct weather damage to Health is excluded.

## Decisions to discuss

1. How does each resource affect each need's accumulation rate, and which actions satisfy needs?
2. Which needs does each weather condition affect, and how strongly? What are the initial weather defaults?
3. Are the proposed 0–100 resource scales appropriate? Should ordinary steps and climbing be separate actions? What climbing limits, surface requirements, Strength modifiers, and exhaustion rules should apply? What are cardinal/diagonal movement costs and corner-cutting rules?
4. How should memories be updated, retained, or forgotten? What communication actions/range allow information sharing, and how are conflicting reports handled?
5. Should the first prototype run continuously in the console, with optional pause/step controls? What grid size and cell contents should the first example use?
6. How much Health damage does each critical need cause over time, and how do multiple critical needs combine their damage?
7. What eye height and obstruction geometry govern height-aware LOS? How do diagonal corners affect LOS?
8. What interaction properties do CellContents objects expose? Can movement and interaction happen in the same decision? How are competing moves into one cell and swaps resolved?

## Scope boundary

Only this design document and `AGENTS.md` are being maintained during the initial discussion. No class implementation or gameplay behavior changes yet. Time of day, weekdays, attributes beyond Vision Range and Strength, additional needs, and additional resources are outside the initial confirmed scope.
