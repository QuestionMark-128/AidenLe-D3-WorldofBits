# D3: {game}

# Game Design Vision

{a few-sentence description of the game mechanics}

# Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

# Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] create a PLAN.md
- [x] copy main.ts to reference.ts for future reference
- [x] delete everything in main.ts
- [x] put a basic leaflet map on the screen
- [x] draw the player's location on the map
- [x] draw a grid of rectangle on the map
- [x] tokens are spawned in rectangles
- [x] player can interact with the cells and pick up tokens
- [x] player can place tokens in a cell to combine the tokens of equal value
- [x] refractoring code
      together

## D3.b: Globe-spanning Gameplay

Key Technical challenge: Can you make it so tokens can delete and spawn as the player moves?
Key gameplay challenge: Can players move around the world?

### Steps

- [x] player can move using WASD and scroll around the map
- [x] cells are memoryless and dissappear when off screen and spawn back in once on screen
- [x] there is a threshold for victory
- [x] refactoring Code

## D3.c: Object Persistence

Key Technical challenge: Do non-modified cells forget their memory but modifed cells do when scolled offscreen?
Key gameplay challenge: Do cells have memory when they are not visible if they've been modifed?

### Steps

- [x] Cells apply Flyweight pattern so cells that haven't been modifed do not require memory saving
- [x] Cells use memento pattern to preserve the state of modifed cells when scolled off-screen and are restored when in view
- [x] refactoring Code
