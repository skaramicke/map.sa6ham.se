import React, { useEffect, useRef, useState } from "react";
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
  const rotationRef = useRef<[number, number, number]>([-13.27, -58.33, 0]);
  const zoomRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [coordinates, setCoordinates] = useState<[number, number]>([
    -13.27, -58.33,
  ]);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 800;
    const padding = 40;
    const totalWidth = width + 2 * padding;
    const totalHeight = height + 2 * padding;

    const svg = d3
      .select(svgRef.current)
      .attr("width", totalWidth)
      .attr("height", totalHeight)
      .attr("viewBox", [0, 0, totalWidth, totalHeight].join(" "));

    svg.selectAll("*").remove();

    const mapGroup = svg
      .append("g")
      .attr("transform", `translate(${padding}, ${padding})`);

    const clipPath = mapGroup
      .append("defs")
      .append("clipPath")
      .attr("id", "circle-clip");

    clipPath
      .append("circle")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", (height - 20) / 2);

    const clippedGroup = mapGroup
      .append("g")
      .attr("clip-path", "url(#circle-clip)");

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

      g.selectAll<SVGTextElement, Feature>("text").attr("transform", (d) => {
        const centroid = path.centroid(d);
        return `translate(${centroid[0]},${centroid[1]})`;
      });
    }

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

    svg.call(zoom);

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

        g.selectAll<SVGTextElement, Feature>("text")
          .data(countries.features)
          .enter()
          .append("text")
          .attr("transform", (d) => {
            const centroid = path.centroid(d);
            return `translate(${centroid[0]},${centroid[1]})`;
          })
          .attr("text-anchor", "middle")
          .attr("dominant-baseline", "middle")
          .attr("font-size", "8px")
          .attr("fill", "#000")
          .text((d) => d.properties.name);

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

          const newX = x + deltaX * k;
          const newY = Math.max(-90, Math.min(90, y - deltaY * k));
          rotationRef.current = [newX, newY, 0];
          setCoordinates([newX, newY]);
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

        mapGroup
          .append("circle")
          .attr("cx", width / 2)
          .attr("cy", height / 2)
          .attr("r", (height - 20) / 2)
          .attr("fill", "none")
          .attr("stroke", "#0009")
          .attr("stroke-width", 1)
          .attr("pointer-events", "none");

        const degreesGroup = mapGroup.append("g");
        for (let i = 0; i < 360; i += 5) {
          const angle = i * (Math.PI / 180);
          const outerRadius = (height - 20) / 2;
          let innerRadius;

          if (i % 60 === 0) {
            innerRadius = outerRadius * 0.05;
          } else if (i % 30 === 0) {
            innerRadius = outerRadius * 0.34;
          } else if (i % 10 === 0) {
            innerRadius = outerRadius * 0.64;
          } else {
            innerRadius = outerRadius * 0.8;
          }

          degreesGroup
            .append("line")
            .attr("x1", width / 2 + innerRadius * Math.sin(angle))
            .attr("y1", height / 2 - innerRadius * Math.cos(angle))
            .attr("x2", width / 2 + outerRadius * Math.sin(angle))
            .attr("y2", height / 2 - outerRadius * Math.cos(angle))
            .attr("stroke", `#000${i % 30 === 0 ? "9" : "6"}`)
            .attr("stroke-width", 1);

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

    svg.attr("aria-label", "Interactive Azimuthal Equidistant World Map");
    updateMap();
  }, []);

  return (
    <div className="w-full max-w-[880px] aspect-square">
      <h1 className="text-2xl font-bold mb-2 text-center">Azimuthal Map</h1>
      <h2 className="text-xl font-bold mb-2 text-center">
        {`${coordinates[0].toFixed(2)}°, ${coordinates[1].toFixed(2)}°`}
      </h2>
      <h3 className="text-sm text-gray-600 ml-2 text-center">
        {coordinates[0] === -13.27 && coordinates[1] === -58.33
          ? "(SA6HAM QTH)"
          : " "}
      </h3>
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
