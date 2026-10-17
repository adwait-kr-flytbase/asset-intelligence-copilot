# Location and thermal data: what the UI can honestly show

Checked against `docs/problem-statement/dataset-guide.md`, the example questions, and actual `sample-data/` metadata, inspection, manual and SOP records. This is a prototype contract extension, not a shared schema migration.

## Location

Each asset has latitude/longitude and area membership. Inspection spills have a discovery time, estimated barrels and percentage of well-pad area. They do **not** supply surveyed spill boundaries, a pad polygon or a contaminated-soil raster.

Use selectable well markers; filter to producing/below-threshold wells or recorded spills. Opening a marker links its reading, status/reason and exact evidence to a follow-up. Missing coordinates remain in records rather than becoming a fabricated pin. A proportional-circle spill layer encodes **barrels**, not geographic spill radius. Its symbol size must not be interpreted as a containment area or an exclusion zone.

A geographic area × month matrix answers Q8. It is a count heatmap, distinct from the map's point overlay. Area membership alone does not justify drawing invented boundary polygons or a choropleth. Real boundaries would require GeoJSON geometry, CRS, dataset revision and attribution.

## Thermal

Inspection records contain `wellhead_temp_c` and `ambient_temp_c`; the type manual provides the production threshold. The correct status is based on **wellhead minus ambient**, against that well's applicable manual (including a future accepted override), not absolute temperature. A well can be hot and still below its threshold.

The chart shows original wellhead and air readings, null gaps, dates and non-production markers. Hover/touch/date controls inspect actual points, and table view exposes numeric records. Any displayed difference is an explicit display transform of those two series; production classifications come from the backend with their manual/rule evidence.

On a map, a temperature layer uses **discrete observation circles at well locations** with °C difference and applicable threshold in the selected record. It is not a continuous ground-temperature field. Time and source inspection matter: latest readings may have different timestamps. Never interpolate across unobserved land to imply a thermal survey.

Inspection `evidence_images` contains references to RGB/thermal images, but image files are **not supplied**. We do not render guessed thermal photos or make image references into broken previews. A real thermal image overlay needs an authorized URL/asset ID, georeferenced bounds or footprint, CRS, capture time, calibration/temperature units, value range/nodata mask, attribution and source revision. A rotated orthomosaic may require raster tiles or a transform rather than a simple rectangular image overlay. Pixel colors alone do not provide radiometric temperature.

## Map implementation and further layers

Leaflet supports layer groups, vector symbols and image overlays. Its circle markers use pixel radii; geographic circles use metre radii. These distinctions determine whether a symbol expresses a metric or a surveyed distance. Primary reference: [Leaflet API](https://leafletjs.com/reference), [layer controls](https://leafletjs.com/examples/layers-control/), [image overlays](https://leafletjs.com/examples/overlays/).

Supported now: pan/zoom, fit visible assets, hover/focus labels, keyboard selection, status/spill filters, source-linked selection, spill-volume symbols, temperature observations when supplied, record/table fallback and mobile focus. Basemap is optional context: tile loading/failure never removes the source records. Tiles are external OpenStreetMap requests; real enterprise deployment must choose an approved map provider or offline service.

Useful later layers require tool data: area boundaries, inspected spill footprints, approved work zones and asset connections. Every layer should carry units, time window, completeness, geometry meaning and source IDs. The backend must decide scope/calculations; the frontend decides how to expose that validated layer cleanly.
