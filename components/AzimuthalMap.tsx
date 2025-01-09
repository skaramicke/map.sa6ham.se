import React, { useEffect, useRef } from "react";
import * as d3 from "d3";
import {
  geoPath,
  geoAzimuthalEquidistant,
  GeoProjection,
  GeoPath,
} from "d3-geo";
import * as topojson from "topojson-client";
import { GeometryObject, GeometryCollection } from "topojson-specification";
import Hammer from "hammerjs";

type Geometry = GeoJSON.Geometry;
type Feature = GeoJSON.Feature<Geometry, { name: string }>;
type FeatureCollection = GeoJSON.FeatureCollection<Geometry, { name: string }>;

interface Topology {
  type: "Topology";
  objects: {
    countries: GeometryObject | GeometryCollection;
  };
  arcs: number[][][];
}

const AzimuthalMap: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const rotationRef = useRef<[number, number, number]>([0, 0, 0]);
  const zoomRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 800;
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height].join(" "));

    // Clear any existing content
    svg.selectAll("*").remove();

    // Create a clipping path
    const clipPath = svg
      .append("defs")
      .append("clipPath")
      .attr("id", "circle-clip");

    clipPath
      .append("circle")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", (height - 20) / 2);

    // Create a group for the map content and apply the clip path
    const mapGroup = svg.append("g").attr("clip-path", "url(#circle-clip)");

    // Create a background within the clipped area
    mapGroup
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#a6d5ff");

    const projection: GeoProjection = geoAzimuthalEquidistant()
      .scale((height - 20) / 2)
      .translate([width / 2, height / 2]);

    const path: GeoPath = geoPath().projection(projection);

    const g = mapGroup.append("g");

    function updateMap() {
      projection.rotate(rotationRef.current);
      g.selectAll<SVGPathElement, Feature>("path").attr(
        "d",
        (d) => path(d) || ""
      );
    }

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5632, 8])
      .on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        const { transform } = event;
        zoomRef.current = transform;

        g.attr(
          "transform",
          `translate(${width / 2}, ${height / 2}) scale(${
            transform.k
          }) translate(${-width / 2}, ${-height / 2})`
        );

        projection.scale(((height - 20) / 2) * transform.k);
        updateMap();
      });

    // Apply zoom behavior to SVG
    svg.call(zoom);

    // Load and render world map data
    d3.json<Topology>(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
    )
      .then((topology) => {
        if (!svgRef.current) return;
        if (!topology) throw new Error("Failed to load topology");

        const countries = topojson.feature(
          topology,
          topology.objects.countries
        ) as FeatureCollection;

        g.selectAll<SVGPathElement, Feature>("path")
          .data(countries.features)
          .enter()
          .append("path")
          .attr("d", (d) => path(d) || "")
          .attr("fill", "#d4e6c2")
          .attr("stroke", "#000")
          .attr("stroke-width", 0.5);

        // Set up Hammer.js
        const hammer = new Hammer(svgRef.current);
        hammer.get("pinch").set({ enable: true });
        hammer.get("pan").set({ direction: Hammer.DIRECTION_ALL });

        let lastDeltaX = 0;
        let lastDeltaY = 0;

        hammer.on("panstart", () => {
          lastDeltaX = 0;
          lastDeltaY = 0;
        });

        hammer.on("panmove", (ev) => {
          const [x, y] = rotationRef.current;
          const baseK = 0.3;
          const k = baseK / Math.sqrt(projection.scale() / ((height - 20) / 2));

          const deltaX = ev.deltaX - lastDeltaX;
          const deltaY = ev.deltaY - lastDeltaY;

          rotationRef.current = [x + deltaX * k, y - deltaY * k, 0];
          updateMap();

          lastDeltaX = ev.deltaX;
          lastDeltaY = ev.deltaY;
        });

        let initialScale = 1;

        hammer.on("pinchstart", () => {
          initialScale = zoomRef.current.k;
        });

        hammer.on("pinch", (ev) => {
          const scale = Math.max(0.5632, Math.min(8, initialScale * ev.scale));
          zoom.scaleTo(svg, scale);
        });

        // Add a circle to represent the edge of the projection
        svg
          .append("circle")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("r", (height - 20) / 2)
          .attr("fill", "none")
          .attr("stroke", "#000")
          .attr("stroke-width", 1)
          .attr("pointer-events", "none");
      })
      .catch((error) =>
        console.error("Error loading or processing world map data:", error)
      );

    // Add aria-label for accessibility
    svg.attr("aria-label", "Interactive Azimuthal Equidistant World Map");
  }, []);

  return (
    <div className="w-full max-w-[800px] aspect-square">
      <svg ref={svgRef} className="w-full h-full cursor-move"></svg>
      <p className="mt-2 text-center text-sm text-gray-600">
        Click and drag to rotate the map. Use mouse wheel or pinch to zoom in
        and out to see the entire projection.
      </p>
      <p className="mt-2 text-center text-sm text-gray-600">
        Interested in how this map was made? Check out the source code on{" "}
        <a
          href="https://github.com/skaramicke/map.sa6ham.se"
          className="text-blue-500 underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        !
      </p>
    </div>
  );
};

export default AzimuthalMap;

