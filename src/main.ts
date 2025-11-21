// IMPORTS
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

// CONFIGS
const CONFIG = {
  PLAYER_START: leaflet.latLng(36.997936938057016, -122.05703507501151),
  TILE_SIZE: 0.0001,
  INTERACTION_RADIUS: 3,
  TARGET_TOKEN: 32,
  NEIGHBORHOOD_SIZE: 48,
  TOKEN_SPAWN_PROB: 0.15,
  VISIBILITY_PADDING: 1,
};

// CONTAINERS
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

// MAP SETUP
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

// PLAYER HUD
let heldToken: number | null = null;
function updateStatus() {
  const cords = `${playerLatLng.lat.toFixed(6)}, ${
    playerLatLng.lng.toFixed(6)
  }`;
  statusDiv.innerText = `Holding: ${heldToken ?? "none"} - Player: ${cords}`;
}
updateStatus();

// UTILS
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

// Cell Storage
type SavedCell = {
  tokenValue: number | null;
};

const savedCells: Record<string, SavedCell> = {};

// CELL CLASS
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
  }

  destroy() {
    try {
      this.rect.remove();
    } catch (e) {
      console.error("Failed to remove rectangle:", e);
    }
  }
}

// CELL SPAWNS
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

// PLAYER MOVEMENT
let followPlayer = false;

function movePlayer(di: number, dj: number) {
  playerLatLng = leaflet.latLng(
    playerLatLng.lat + di * CONFIG.TILE_SIZE,
    playerLatLng.lng + dj * CONFIG.TILE_SIZE,
  );
  playerMarker.setLatLng(playerLatLng);
  updateStatus();
  spawnNeighborhood();
  if (followPlayer) {
    map.setView(playerLatLng, map.getZoom());
  }
}

// CONTROLS
const followBtn = document.createElement("button");
followBtn.innerText = "Follow Player: OFF";
followBtn.addEventListener("click", () => {
  followPlayer = !followPlayer;
  followBtn.innerText = `Follow Player: ${followPlayer ? "ON" : "OFF"}`;
  if (followPlayer) {
    map.setView(playerLatLng, map.getZoom());
  }
});
controlsDiv.append(followBtn);

// EVENT LISTENERS
map.on("moveend", () => {
  spawnVisibleCells();
});

document.addEventListener("keydown", (ev) => {
  if ((document.activeElement?.tagName || "") === "INPUT") {
    return;
  }
  switch (ev.key.toLowerCase()) {
    case "w":
      movePlayer(1, 0);
      break;
    case "s":
      movePlayer(-1, 0);
      break;
    case "a":
      movePlayer(0, -1);
      break;
    case "d":
      movePlayer(0, 1);
      break;
    case " ":
      map.setView(playerLatLng, map.getZoom());
      spawnVisibleCells();
      break;
    default:
      return;
  }
  ev.preventDefault();
});

// SPAWN INITIAL
spawnVisibleCells();
spawnNeighborhood();
