import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

const CONFIG = {
  PLAYER_START: leaflet.latLng(36.997936938057016, -122.05703507501151),
  TILE_SIZE: 0.0001,
  INTERACTION_RADIUS: 3,
  TARGET_TOKEN: 16,
  NEIGHBORHOOD_SIZE: 48,
  TOKEN_SPAWN_PROB: 0.15,
};

const mapDiv = document.createElement("div");
mapDiv.id = "map";
mapDiv.style.width = "100%";
mapDiv.style.height = "500px";
document.body.append(mapDiv);

const statusDiv = document.createElement("div");
statusDiv.id = "status";
document.body.append(statusDiv);

let heldToken: number | null = null;
function updateStatus() {
  statusDiv.innerText = "Holding: " + (heldToken ?? "none");
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

const playerMarker = leaflet.marker(CONFIG.PLAYER_START).addTo(map);
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
      CONFIG.PLAYER_START.lat,
      CONFIG.PLAYER_START.lng,
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
}

const spawnedCells: Record<string, Cell> = {};

function spawnCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (spawnedCells[key]) return;

  const tokenValue: CellToken =
    luck([i, j].toString()) < CONFIG.TOKEN_SPAWN_PROB ? 1 : null;
  spawnedCells[key] = new Cell(i, j, tokenValue);
}

function spawnNeighborhood() {
  const playerCell = latLngToCell(
    CONFIG.PLAYER_START.lat,
    CONFIG.PLAYER_START.lng,
  );
  forNeighborhood(
    playerCell.i,
    playerCell.j,
    CONFIG.NEIGHBORHOOD_SIZE,
    (i, j) => {
      if (luck([i, j].toString()) < CONFIG.TOKEN_SPAWN_PROB) spawnCell(i, j);
    },
  );
}

spawnNeighborhood();
map.on("moveend", spawnNeighborhood);
