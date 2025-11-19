import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

const CONFIG = {
  PLAYER_START: leaflet.latLng(36.997936938057016, -122.05703507501151),
  TILE_SIZE: 0.0001,
  INTERACTION_RADIUS: 3,
  TARGET_TOKEN: 32,
  NEIGHBORHOOD_SIZE: 48,
  TOKEN_SPAWN_PROB: 0.15,
  VISIBILITY_PADDING: 1,
};

const mapDiv = document.createElement("div");
mapDiv.id = "map";
mapDiv.style.width = "100%";
mapDiv.style.height = "500px";
document.body.append(mapDiv);

const hudDiv = document.createElement("div");
hudDiv.id = "hud";
hudDiv.style.margin = "8px";
document.body.append(hudDiv);

const statusDiv = document.createElement("div");
statusDiv.id = "status";
document.body.append(statusDiv);

const controlsDiv = document.createElement("div");
controlsDiv.id = "controls";
controlsDiv.style.margin = "6px";
document.body.append(controlsDiv);

let playerLatLng = CONFIG.PLAYER_START.clone();

let followPlayer = false;
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

let heldToken: number | null = null;
function updateStatus() {
  const cords = `${playerLatLng.lat.toFixed(6)}, ${
    playerLatLng.lng.toFixed(6)
  }`;
  statusDiv.innerText = `Holding: ${heldToken ?? "none"} - Player: ${cords}`;
}
updateStatus();

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

const playerMarker = leaflet.marker(playerLatLng).addTo(map);
playerMarker.bindTooltip("You are here!");

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
    if (tokenValue) this.rect.bindTooltip(`Token: ${tokenValue}`).openTooltip();
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

const spawnedCells: Record<string, Cell> = {};

function spawnCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (spawnedCells[key]) return;

  const tokenValue: CellToken =
    luck([i, j].toString()) < CONFIG.TOKEN_SPAWN_PROB ? 1 : null;
  spawnedCells[key] = new Cell(i, j, tokenValue);
}

function pruneInvisibleCells() {
  const bounds = map.getBounds();
  for (const key of Object.keys(spawnedCells)) {
    const c = spawnedCells[key];
    const rectBounds = c.rect.getBounds();
    if (!bounds.intersects(rectBounds)) {
      c.destroy();
      delete spawnedCells[key];
    }
  }
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
    (i, j) => {
      spawnCell(i, j);
    },
  );
  pruneInvisibleCells();
}

spawnVisibleCells();
spawnNeighborhood();
map.on("moveend", () => {
  spawnVisibleCells();
});

function moveplayer(di: number, dj: number) {
  const deltaLat = di * CONFIG.TILE_SIZE;
  const deltaLng = dj * CONFIG.TILE_SIZE;
  playerLatLng = leaflet.latLng(
    playerLatLng.lat + deltaLat,
    playerLatLng.lng + deltaLng,
  );
  playerMarker.setLatLng(playerLatLng);
  updateStatus();
  spawnNeighborhood();
  if (followPlayer) {
    map.setView(playerLatLng, map.getZoom());
    spawnVisibleCells();
  }
}

document.addEventListener("keydown", (ev) => {
  const activateTag =
    (document.activeElement && document.activeElement.tagName) || "";
  if (activateTag === "INPUT" || activateTag === "TEXTAREA") {
    return;
  }
  switch (ev.key) {
    case "w":
    case "W":
      moveplayer(1, 0);
      break;
    case "s":
    case "S":
      moveplayer(-1, 0);
      break;
    case "a":
    case "A":
      moveplayer(0, -1);
      break;
    case "d":
    case "D":
      moveplayer(0, 1);
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
