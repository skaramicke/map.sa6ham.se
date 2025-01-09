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
    const padding = 40; // Add padding to accommodate labels
    const totalWidth = width + 2 * padding;
    const totalHeight = height + 2 * padding;

    const svg = d3
      .select(svgRef.current)
      .attr("width", totalWidth)
      .attr("height", totalHeight)
      .attr("viewBox", [0, 0, totalWidth, totalHeight].join(" "));

    // Clear any existing content
    svg.selectAll("*").remove();

    // Create a group for the entire map and center it within the padded SVG
    const mapGroup = svg
      .append("g")
      .attr("transform", `translate(${padding}, ${padding})`);

    // Create a clipping path
    const clipPath = mapGroup
      .append("defs")
      .append("clipPath")
      .attr("id", "circle-clip");

    clipPath
      .append("circle")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", (height - 20) / 2);

    // Create a group for the map content and apply the clip path
    const clippedGroup = mapGroup
      .append("g")
      .attr("clip-path", "url(#circle-clip)");

    // Create a background within the clipped area
    clippedGroup
      .append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "#a6d5ff");

    const projection: GeoProjection = geoAzimuthalEquidistant()
      .scale((height - 20) / 2)
      .translate([width / 2, height / 2]);

    const path: GeoPath = geoPath().projection(projection);

    const g = clippedGroup.append("g");

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
          const zoomFactor = Math.sqrt(zoomRef.current.k);
          const k = baseK / zoomFactor;

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
        mapGroup
          .append("circle")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("r", (height - 20) / 2)
          .attr("fill", "none")
          .attr("stroke", "#000")
          .attr("stroke-width", 1)
          .attr("pointer-events", "none");

        // Add degree markings
        const degreesGroup = mapGroup.append("g");
        for (let i = 0; i < 360; i += 5) {
          const angle = i * (Math.PI / 180);
          const outerRadius = (height - 20) / 2;
          let innerRadius;

          if (i % 60 === 0) {
            innerRadius = 0; // Goes to the center
          } else if (i % 30 === 0) {
            innerRadius = outerRadius * 0.34; // Goes to 66% of the radius
          } else if (i % 10 === 0) {
            innerRadius = outerRadius * 0.67; // Goes to 33% of the radius
          } else {
            innerRadius = outerRadius - 5; // 5° subdivisions remain unchanged
          }

          // Line
          degreesGroup
            .append("line")
            .attr("x1", width / 2 + innerRadius * Math.sin(angle))
            .attr("y1", height / 2 - innerRadius * Math.cos(angle))
            .attr("x2", width / 2 + outerRadius * Math.sin(angle))
            .attr("y2", height / 2 - outerRadius * Math.cos(angle))
            .attr("stroke", "#000")
            .attr("stroke-width", 1);

          // Text (only for multiples of 10 degrees)
          if (i % 10 === 0) {
            const textRadius = outerRadius + 20;
            degreesGroup
              .append("text")
              .attr("x", width / 2 + textRadius * Math.sin(angle))
              .attr("y", height / 2 - textRadius * Math.cos(angle))
              .attr("text-anchor", "middle")
              .attr("dominant-baseline", "middle")
              .attr("font-size", "12px")
              .text(i.toString() + "º");
          }
        }
      })
      .catch((error) =>
        console.error("Error loading or processing world map data:", error)
      );

    // Add aria-label for accessibility
    svg.attr("aria-label", "Interactive Azimuthal Equidistant World Map");
  }, []);

  return (
    <div className="w-full max-w-[880px] aspect-square">
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

