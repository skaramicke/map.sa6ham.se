export interface CountryGeometry {
  type: "Polygon" | "MultiPolygon";
  arcs: number[][][];
  id: string;
  properties: {
    name: string;
  };
}

export interface CountriesData {
  type: "Topology";
  objects: {
    countries: {
      type: "GeometryCollection";
      geometries: CountryGeometry[];
    };
  };
  arcs: number[][][];
}
