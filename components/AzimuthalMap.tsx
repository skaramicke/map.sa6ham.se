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

    // Load and render world map data
    d3.json<Topology>(
      "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
    )
      .then((topology) => {
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

        // Add drag behavior
        const drag = d3.drag<SVGSVGElement, unknown>().on("drag", (event) => {
          const [x, y] = rotationRef.current;
          const k = 100 / (projection.scale() * zoomRef.current.k);

          rotationRef.current = [x + event.dx * k, y - event.dy * k, 0];
          updateMap();
        });

        svg.call(drag);

        // Add zoom behavior with extended zoom range and fixed center
        const zoom = d3
          .zoom<SVGSVGElement, unknown>()
          .scaleExtent([0.5632, 8])
          .on("zoom", (event) => {
            const { transform } = event;
            zoomRef.current = transform;

            // Apply zoom transform to the group, keeping the center fixed
            g.attr(
              "transform",
              `translate(${width / 2}, ${height / 2}) scale(${
                transform.k
              }) translate(${-width / 2}, ${-height / 2})`
            );

            // Update the projection scale
            projection.scale(((height - 20) / 2) * transform.k);
            updateMap();
          });

        svg.call(zoom);

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
        Click and drag to rotate the map. Use mouse wheel to zoom in and out to
        see the entire projection.
      </p>
    </div>
  );
};

export default AzimuthalMap;
