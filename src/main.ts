import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

const PLAYER_START = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

const TILE_SIZE = 0.0001;
const INTERACTION_RADIUS = 3;
const TARGET_TOKEN = 16;
const NEIGHBORHOOD_SIZE = 48;
const TOKEN_SPAWN_PROB = 0.15;

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

const spawnedCells: Record<string, leaflet.Rectangle> = {};

const map = leaflet.map(mapDiv, {
  center: PLAYER_START,
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

const playerMarker = leaflet.marker(PLAYER_START).addTo(map);
playerMarker.bindTooltip("You are here!");

function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

function cellBounds(i: number, j: number) {
  return [
    [PLAYER_START.lat + i * TILE_SIZE, PLAYER_START.lng + j * TILE_SIZE],
    [
      PLAYER_START.lat + (i + 1) * TILE_SIZE,
      PLAYER_START.lng + (j + 1) * TILE_SIZE,
    ],
  ] as [[number, number], [number, number]];
}

function latLngToCell(lat: number, lng: number) {
  const i = Math.floor((lat - PLAYER_START.lat) / TILE_SIZE);
  const j = Math.floor((lng - PLAYER_START.lng) / TILE_SIZE);
  return { i, j };
}

function distanceCells(ci: number, cj: number, pi: number, pj: number) {
  return Math.max(Math.abs(ci - pi), Math.abs(cj - pj));
}

function spawnCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (spawnedCells[key]) return;

  const bounds = cellBounds(i, j);
  const rect = leaflet.rectangle(bounds, {
    color: "#000",
    weight: 1,
    fillOpacity: 0.05,
  }).addTo(map);

  let tokenValue: number | null = luck([i, j].toString()) < 0.15 ? 1 : null;

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cell [${i},${j}] 
      ${
      tokenValue
        ? `has token value <span id="value">${tokenValue}</span>`
        : "is empty"
    }.</div>
      <button id="interact">Interact</button>`;

    popupDiv.querySelector<HTMLButtonElement>("#interact")!.addEventListener(
      "click",
      () => {
        const playerCell = latLngToCell(PLAYER_START.lat, PLAYER_START.lng);
        if (
          distanceCells(i, j, playerCell.i, playerCell.j) > INTERACTION_RADIUS
        ) {
          alert("Too far to interact!");
          return;
        }

        if (heldToken == null && tokenValue != null) {
          heldToken = tokenValue;
          tokenValue = null;
          rect.setStyle({ fillOpacity: 0.05 });
          updateStatus();
        } else if (heldToken != null && tokenValue == null) {
          tokenValue = heldToken;
          heldToken = null;
          rect.setStyle({ fillOpacity: 0.3 });
          updateStatus();
        } else if (heldToken != null && tokenValue == heldToken) {
          tokenValue = heldToken * 2;
          heldToken = null;
          rect.setStyle({ fillOpacity: 0.3 });
          updateStatus();

          if (tokenValue >= TARGET_TOKEN) {
            alert("Congratulations! You created a high-value token!");
          }
        } else {
          alert("Nothing to do here!");
        }

        rect.unbindTooltip();
        if (tokenValue) rect.bindTooltip(`Token: ${tokenValue}`).openTooltip();
      },
    );

    return popupDiv;
  });

  if (tokenValue) rect.bindTooltip(`Token: ${tokenValue}`).openTooltip();
  spawnedCells[key] = rect;
}

function spawnNeighborhood() {
  const playerCell = latLngToCell(PLAYER_START.lat, PLAYER_START.lng);
  for (
    let i = playerCell.i - NEIGHBORHOOD_SIZE;
    i <= playerCell.i + NEIGHBORHOOD_SIZE;
    i++
  ) {
    for (
      let j = playerCell.j - NEIGHBORHOOD_SIZE;
      j <= playerCell.j + NEIGHBORHOOD_SIZE;
      j++
    ) {
      if (luck([i, j].toString()) < TOKEN_SPAWN_PROB) {
        spawnCell(i, j);
      }
    }
  }
}

spawnNeighborhood();
map.on("moveend", spawnNeighborhood);
