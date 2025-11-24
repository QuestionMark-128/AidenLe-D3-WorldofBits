// ============================================================================
// IMPORTS
// ============================================================================
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

// ============================================================================
// CONFIGS
// ============================================================================
const CONFIG = {
  PLAYER_START: leaflet.latLng(36.997936938057016, -122.05703507501151),
  TILE_SIZE: 0.0001,
  INTERACTION_RADIUS: 3,
  TARGET_TOKEN: 32,
  NEIGHBORHOOD_SIZE: 48,
  TOKEN_SPAWN_PROB: 0.15,
  VISIBILITY_PADDING: 1,
};

// ============================================================================
// PERSISTENCE
// ============================================================================
const SAVE_KEY = "geoGameSave";

function saveGame() {
  const data = {
    playerLat: playerLatLng.lat,
    playerLng: playerLatLng.lng,
    savedCells,
    heldToken,
    useGeo,
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;

  try {
    const data = JSON.parse(raw);
    playerLatLng = leaflet.latLng(data.playerLat, data.playerLng);
    Object.assign(savedCells, data.savedCells);
    heldToken = data.heldToken;
    if (typeof data.useGeo === "boolean") {
      useGeo = data.useGeo;
    }
    return true;
  } catch (e) {
    console.error("Failed to load save:", e);
    return false;
  }
}

// ============================================================================
// MOVEMENT FACADE
// ============================================================================
type MoveCallback = (lat: number, lng: number, absolute: boolean) => void;

interface MovementController {
  start(): void;
  stop(): void;
  onMove(cb: MoveCallback): void;
}

// **Location Movement**
class GeoMovement implements MovementController {
  private cb: MoveCallback | null = null;
  private watchId: number | null = null;

  start() {
    if (!navigator.geolocation) {
      alert("Geolocation not supported.");
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (this.cb) this.cb(latitude, longitude, true);
      },
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true },
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  onMove(cb: MoveCallback) {
    this.cb = cb;
  }
}

// **WASD Movement**
class ButtonMovement implements MovementController {
  private cb: MoveCallback | null = null;
  private keys: Record<string, boolean> = {};
  private intervalId: number | null = null;
  private speed = CONFIG.TILE_SIZE;

  start() {
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);

    this.intervalId = self.setInterval(() => {
      if (!this.cb) return;

      let deltaLat = 0;
      let deltaLng = 0;
      if (this.keys["w"]) deltaLat += this.speed;
      if (this.keys["s"]) deltaLat -= this.speed;
      if (this.keys["a"]) deltaLng -= this.speed;
      if (this.keys["d"]) deltaLng += this.speed;

      if (deltaLat !== 0 || deltaLng !== 0) {
        this.cb(
          playerLatLng.lat + deltaLat,
          playerLatLng.lng + deltaLng,
          false,
        );
      }
    }, 100);
  }

  stop() {
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
    if (this.intervalId !== null) clearInterval(this.intervalId);
  }

  onMove(cb: MoveCallback) {
    this.cb = cb;
  }

  private onKeyDown = (ev: KeyboardEvent) => {
    this.keys[ev.key.toLowerCase()] = true;
  };

  private onKeyUp = (ev: KeyboardEvent) => {
    this.keys[ev.key.toLowerCase()] = false;
  };
}

// ============================================================================
// CONTAINERS
// ============================================================================
function createDiv(id: string, styles: Partial<CSSStyleDeclaration> = {}) {
  const div = document.createElement("div");
  div.id = id;
  Object.assign(div.style, styles);
  document.body.append(div);
  return div;
}

const mapDiv = createDiv("map", { width: "100%", height: "500px" });
const statusDiv = createDiv("status");
const controlsDiv = createDiv("controls", { margin: "6px" });

// ============================================================================
// MAP SETUP
// ============================================================================
const map = leaflet.map(mapDiv, {
  center: CONFIG.PLAYER_START,
  zoom: 19,
  minZoom: 18,
  maxZoom: 19,
  zoomControl: false,
  preferCanvas: true,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

let playerLatLng = CONFIG.PLAYER_START.clone();
const playerMarker = leaflet.marker(playerLatLng).addTo(map);
playerMarker.bindTooltip("You are here!");

// ============================================================================
// PLAYER HUD
// ============================================================================
let heldToken: number | null = null;
function updateStatus() {
  const cords = `${playerLatLng.lat.toFixed(6)}, ${
    playerLatLng.lng.toFixed(6)
  }`;
  statusDiv.innerText = `Holding: ${heldToken ?? "none"} - Player: ${cords}`;
}
updateStatus();

// ============================================================================
// UTILS
// ============================================================================
function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

function cellBounds(i: number, j: number) {
  return [
    [
      CONFIG.PLAYER_START.lat + i * CONFIG.TILE_SIZE,
      CONFIG.PLAYER_START.lng + j * CONFIG.TILE_SIZE,
    ],
    [
      CONFIG.PLAYER_START.lat + (i + 1) * CONFIG.TILE_SIZE,
      CONFIG.PLAYER_START.lng + (j + 1) * CONFIG.TILE_SIZE,
    ],
  ] as [[number, number], [number, number]];
}

function latLngToCell(lat: number, lng: number) {
  const i = Math.floor((lat - CONFIG.PLAYER_START.lat) / CONFIG.TILE_SIZE);
  const j = Math.floor((lng - CONFIG.PLAYER_START.lng) / CONFIG.TILE_SIZE);
  return { i, j };
}

function distanceCells(ci: number, cj: number, pi: number, pj: number) {
  return Math.max(Math.abs(ci - pi), Math.abs(cj - pj));
}

function forNeighborhood(
  centerI: number,
  centerJ: number,
  radius: number,
  fn: (i: number, j: number) => void,
) {
  for (let i = centerI - radius; i <= centerI + radius; i++) {
    for (let j = centerJ - radius; j <= centerJ + radius; j++) {
      fn(i, j);
    }
  }
}

// ============================================================================
// Cell Storage
// ============================================================================
type SavedCell = {
  tokenValue: number | null;
};

const savedCells: Record<string, SavedCell> = {};

// ============================================================================
// CELL CLASS
// ============================================================================
type CellToken = number | null;

class Cell {
  i: number;
  j: number;
  tokenValue: CellToken;
  rect: leaflet.Rectangle;

  constructor(i: number, j: number, tokenValue: CellToken) {
    this.i = i;
    this.j = j;
    this.tokenValue = tokenValue;

    this.rect = leaflet.rectangle(cellBounds(i, j), {
      color: "#000",
      weight: 1,
      fillOpacity: tokenValue ? 0.3 : 0.05,
    }).addTo(map);

    this.bindPopup();
    if (tokenValue) this.rect.bindTooltip(`Token: ${tokenValue}`);
  }

  bindPopup() {
    this.rect.bindPopup(() => {
      const popupDiv = document.createElement("div");
      popupDiv.innerHTML = `
        <div>Cell [${this.i},${this.j}] 
        ${
        this.tokenValue
          ? `has token value <span id="value">${this.tokenValue}</span>`
          : "is empty"
      }.</div>
        <button id="interact">Interact</button>
      `;

      popupDiv.querySelector<HTMLButtonElement>("#interact")!.addEventListener(
        "click",
        () => this.interact(),
      );

      return popupDiv;
    });
  }

  interact() {
    const playerCell = latLngToCell(
      playerLatLng.lat,
      playerLatLng.lng,
    );
    if (
      distanceCells(this.i, this.j, playerCell.i, playerCell.j) >
        CONFIG.INTERACTION_RADIUS
    ) {
      alert("Too far to interact!");
      return;
    }

    if (heldToken == null && this.tokenValue != null) {
      heldToken = this.tokenValue;
      this.tokenValue = null;
    } else if (heldToken != null && this.tokenValue == null) {
      this.tokenValue = heldToken;
      heldToken = null;
    } else if (heldToken != null && this.tokenValue == heldToken) {
      this.tokenValue = heldToken * 2;
      heldToken = null;
      if (this.tokenValue >= CONFIG.TARGET_TOKEN) {
        alert("Congratulations! You created a high-value token!");
      }
    } else {
      alert("Nothing to do here!");
    }

    savedCells[cellKey(this.i, this.j)] = {
      tokenValue: this.tokenValue,
    };

    updateStatus();
    this.rect.setStyle({ fillOpacity: this.tokenValue ? 0.3 : 0.05 });
    this.rect.unbindTooltip();
    if (this.tokenValue) {
      this.rect.bindTooltip(`Token: ${this.tokenValue}`).openTooltip();
    }

    saveGame();
  }

  destroy() {
    try {
      this.rect.remove();
    } catch (e) {
      console.error("Failed to remove rectangle:", e);
    }
  }
}

// ============================================================================
// CELL SPAWNS
// ============================================================================
const spawnedCells: Record<string, Cell> = {};

function spawnCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (spawnedCells[key]) return;
  let tokenValue: CellToken;
  if (savedCells[key]) {
    tokenValue = savedCells[key].tokenValue;
  } else {
    tokenValue = luck([i, j].toString()) < CONFIG.TOKEN_SPAWN_PROB ? 1 : null;
  }
  spawnedCells[key] = new Cell(i, j, tokenValue);
}

function pruneInvisibleCells() {
  const bounds = map.getBounds();
  Object.keys(spawnedCells).forEach((key) => {
    const c = spawnedCells[key];
    if (!bounds.intersects(c.rect.getBounds())) {
      c.destroy();
      delete spawnedCells[key];
    }
  });
}

function spawnVisibleCells() {
  const bounds = map.getBounds();
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const topLeft = latLngToCell(ne.lat, sw.lng);
  const bottomRight = latLngToCell(sw.lat, ne.lng);

  const minI = bottomRight.i - CONFIG.VISIBILITY_PADDING;
  const maxI = topLeft.i + CONFIG.VISIBILITY_PADDING;
  const minJ = topLeft.j + CONFIG.VISIBILITY_PADDING;
  const maxJ = bottomRight.j + CONFIG.VISIBILITY_PADDING;

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      spawnCell(i, j);
    }
  }
  pruneInvisibleCells();
}

function spawnNeighborhood() {
  const playerCell = latLngToCell(playerLatLng.lat, playerLatLng.lng);
  forNeighborhood(
    playerCell.i,
    playerCell.j,
    CONFIG.NEIGHBORHOOD_SIZE,
    spawnCell,
  );
  pruneInvisibleCells();
}

// ============================================================================
// PLAYER MOVEMENT
// ============================================================================
let followPlayer = false;
let useGeo = true;
let movement: MovementController;

function switchMovementMode() {
  if (movement) movement.stop();

  if (useGeo) {
    movement = new GeoMovement();
  } else {
    movement = new ButtonMovement();
  }

  movement.onMove((lat, lng, absolute) => {
    if (absolute) {
      playerLatLng = leaflet.latLng(lat, lng);
      saveGame();
    } else {
      playerLatLng = leaflet.latLng(lat, lng);
    }

    playerMarker.setLatLng(playerLatLng);
    updateStatus();
    spawnNeighborhood();
    if (followPlayer) map.setView(playerLatLng, map.getZoom());
  });

  movement.start();
}

// ============================================================================
// CONTROLS
// ============================================================================
const followBtn = document.createElement("button");
followBtn.innerText = "Follow Player: OFF";
followBtn.addEventListener("click", () => {
  followPlayer = !followPlayer;
  followBtn.innerText = `Follow Player: ${followPlayer ? "ON" : "OFF"}`;
  if (followPlayer) map.setView(playerLatLng, map.getZoom());
});
controlsDiv.append(followBtn);

const modeBtn = document.createElement("button");
modeBtn.innerText = `Movement: ${useGeo ? "Geolocation" : "Keyboard"}`;
modeBtn.addEventListener("click", () => {
  useGeo = !useGeo;
  modeBtn.innerText = `Movement: ${useGeo ? "Geolocation" : "Keyboard"}`;
  switchMovementMode();
});
controlsDiv.append(modeBtn);

const resetBtn = document.createElement("button");
resetBtn.innerText = "Reset Game";
resetBtn.addEventListener("click", () => {
  if (!confirm("Are you sure you want to reset the game?")) return;

  localStorage.removeItem(SAVE_KEY);
  Object.keys(savedCells).forEach((key) => delete savedCells[key]);
  Object.keys(spawnedCells).forEach((key) => spawnedCells[key].destroy());
  Object.keys(spawnedCells).forEach((key) => delete spawnedCells[key]);

  playerLatLng = CONFIG.PLAYER_START.clone();
  heldToken = null;
  playerMarker.setLatLng(playerLatLng);
  updateStatus();

  spawnVisibleCells();
  spawnNeighborhood();
});
controlsDiv.append(resetBtn);

// ============================================================================
// EVENT LISTENERS
// ============================================================================
map.on("moveend", () => {
  spawnVisibleCells();
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === " ") {
    map.setView(playerLatLng, map.getZoom());
    spawnVisibleCells();
    ev.preventDefault();
  }
});

// ============================================================================
// SPAWN INITIAL
// ============================================================================
loadGame();
playerMarker.setLatLng(playerLatLng);
updateStatus();
spawnVisibleCells();
spawnNeighborhood();
switchMovementMode();
