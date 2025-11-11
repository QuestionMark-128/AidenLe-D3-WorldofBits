import leaflet from "leaflet";

import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
//import luck from "./_luck.ts";

document.addEventListener("DOMContentLoaded", () => {
  const PLAYER_START = leaflet.latLng(
    36.997936938057016,
    -122.05703507501151,
  );

  // const TILE_SIZE = 0.0001;
  // const INTERACTION_RADIUS = 3;
  // const TOKEN_SPAWN_PROB = 0.15;

  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  mapDiv.style.width = "100%";
  mapDiv.style.height = "500px";
  document.body.append(mapDiv);

  const statusDiv = document.createElement("div");
  statusDiv.id = "status";
  statusDiv.innerHTML = "Holding: none";
  document.body.append(statusDiv);

  const map = leaflet.map(mapDiv, {
    center: PLAYER_START,
    zoom: 19,
    minZoom: 18,
    maxZoom: 19,
    zoomControl: false,
    scrollWheelZoom: true,
    preferCanvas: true,
  });

  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const playerMarker = leaflet.marker(PLAYER_START).addTo(map);
  playerMarker.bindTooltip("You are here!");
});
