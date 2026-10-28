# Locally served map dependencies

- Leaflet 1.9.4: `https://www.npmjs.com/package/leaflet/v/1.9.4`, BSD-2-Clause (`LICENSE`).
- Leaflet.markercluster 1.5.3: `https://www.npmjs.com/package/leaflet.markercluster/v/1.5.3`, MIT (`MarkerCluster-LICENSE`).

Unmodified distribution JS/CSS are served from this directory; no runtime CDN dependency. Marker icons use local CSS/HTML, not Leaflet's optional image assets. Base map tiles are separate online resources, not vendored or prefetched.
