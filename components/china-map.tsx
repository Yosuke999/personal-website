"use client";

import { useEffect, useMemo, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import type { ProvinceStatus } from "@/data/demo";

type Feature = GeoJSON.Feature<GeoJSON.Geometry, { name?: string }>;
type Collection = GeoJSON.FeatureCollection<GeoJSON.Geometry, { name?: string }>;

function rewindFeature(feature: Feature): Feature {
  const geometry = feature.geometry;
  if (geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: { ...geometry, coordinates: geometry.coordinates.map((ring) => [...ring].reverse()) },
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...feature,
      geometry: {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => [...ring].reverse()),
        ),
      },
    };
  }
  return feature;
}

const statusLabel: Record<ProvinceStatus, string> = {
  visited: "已抵达",
  planned: "在计划",
  unplanned: "未计划",
};

export default function ChinaMap({
  statuses,
  onSelect,
}: {
  statuses: Record<string, ProvinceStatus>;
  onSelect: (name: string, status: ProvinceStatus) => void;
}) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [hovered, setHovered] = useState<{ name: string; x: number; y: number; status: ProvinceStatus }>();

  useEffect(() => {
    fetch("/data/china-provinces.json")
      .then((response) => response.json())
      .then((collection: Collection) =>
        setFeatures(
          collection.features
            .filter((feature) => Boolean(feature.properties?.name))
            .map(rewindFeature),
        ),
      )
      .catch(() => setFeatures([]));
  }, []);

  const paths = useMemo(() => {
    if (!features.length) return [];
    const collection: Collection = { type: "FeatureCollection", features };
    const projection = geoMercator().fitExtent(
      [
        [36, 28],
        [864, 552],
      ],
      collection as GeoPermissibleObjects,
    );
    const generator = geoPath(projection);
    return features.map((feature) => ({ feature, d: generator(feature as GeoPermissibleObjects) || "" }));
  }, [features]);

  return (
    <div className="map-stage">
      <div className="map-orbit map-orbit-one" />
      <div className="map-orbit map-orbit-two" />
      {!paths.length && <div className="map-loading"><span />正在加载足迹坐标</div>}
      <svg className="china-map" viewBox="0 0 900 580" role="img" aria-label="中国省级足迹地图">
        <defs>
          <linearGradient id="visitedGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#45f4da" />
            <stop offset="1" stopColor="#3d82ff" />
          </linearGradient>
          <linearGradient id="plannedGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffcf70" />
            <stop offset="1" stopColor="#dd7c36" />
          </linearGradient>
        </defs>
        {paths.map(({ feature, d }, index) => {
          const name = feature.properties?.name || `区域 ${index + 1}`;
          const status = statuses[name] || "unplanned";
          return (
            <path
              key={`${name}-${index}`}
              d={d}
              className={`province province-${status}`}
              tabIndex={status === "unplanned" ? -1 : 0}
              role="button"
              aria-label={`${name} · ${statusLabel[status]}`}
              onClick={() => status !== "unplanned" && onSelect(name, status)}
              onKeyDown={(event) => event.key === "Enter" && status !== "unplanned" && onSelect(name, status)}
              onMouseMove={(event) => {
                const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                if (!box) return;
                setHovered({ name, status, x: event.clientX - box.left, y: event.clientY - box.top });
              }}
              onMouseLeave={() => setHovered(undefined)}
            />
          );
        })}
      </svg>
      {hovered && (
        <div className="map-tooltip" style={{ left: hovered.x, top: hovered.y }}>
          <small>{statusLabel[hovered.status]}</small>
          <strong>{hovered.name.replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, "")}</strong>
        </div>
      )}
      <div className="map-legend">
        <span><i className="legend-visited" />已去过</span>
        <span><i className="legend-planned" />计划前往</span>
        <span><i className="legend-empty" />未计划</span>
      </div>
    </div>
  );
}
