import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { FitnessRecord } from "./types";

type RadarChartProps = {
  labels: string[];
  record: FitnessRecord | null;
  scores: number[];
};

export default function RadarChart({
  labels,
  record,
  scores,
}: RadarChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const chart = echarts.init(containerRef.current);
    const percentageValues = scores.map((value) =>
      Math.max(0, Math.min(100, value)),
    );

    chart.setOption({
      animationDuration: 400,
      backgroundColor: "transparent",
      radar: {
        radius: "64%",
        splitNumber: 5,
        axisName: {
          color: "#1f2937",
          fontSize: 13,
          fontWeight: 600,
        },
        indicator: labels.map((label) => ({
          name: label,
          max: 100,
        })),
        splitArea: {
          areaStyle: {
            color: ["rgba(249, 250, 251, 0.85)", "rgba(229, 231, 235, 0.3)"],
          },
        },
      },
      series: [
        {
          type: "radar",
          data: [
            {
              value: percentageValues,
              name: record?.studentName ?? "尚未選取",
              areaStyle: {
                color: "rgba(15, 118, 110, 0.22)",
              },
              lineStyle: {
                color: "#0f766e",
                width: 2,
              },
              itemStyle: {
                color: "#0f766e",
              },
            },
          ],
        },
      ],
      tooltip: {
        trigger: "item",
      },
    });

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
  }, [labels, record, scores]);

  return <div className="chart-shell" ref={containerRef} />;
}
