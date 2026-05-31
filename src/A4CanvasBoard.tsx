import { jsPDF } from "jspdf";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  getAbilityBandLabel,
  getAbilityScores,
} from "./ability-scoring";
import type { AbilityGradeProfile, AbilityRulesConfig } from "./ability-settings";
import type { FitnessRecord } from "./types";

const CANVAS_WIDTH = 1240;
const CANVAS_HEIGHT = 1754;
const SECTION_STROKE = "#9ac1f0";
const SECTION_FILL = "#ffffff";
const PAGE_BORDER = "#8fb7ea";
const TITLE_COLOR = "#183b70";
const SUBTITLE_COLOR = "#5d89c7";
const TEXT_COLOR = "#1f2937";
const MUTED_TEXT_COLOR = "#64748b";
const CHART_LINE = "#2d72d8";
const CHART_FILL = "rgba(69, 132, 220, 0.18)";
const SCORE_COLORS = ["#5b8fd9", "#75bc67", "#f59b43", "#f26b75", "#8c80d8", "#f7b93f"];

export type A4CanvasBoardHandle = {
  downloadCurrentPdf: () => Promise<void>;
};

type A4CanvasBoardProps = {
  labels: string[];
  record: FitnessRecord | null;
  abilityScores: number[];
  abilityLevelLabels: string[];
  rosterName: string;
  testDate: string;
  seatNumber: number | null;
};

type ReportRenderPayload = {
  labels: string[];
  record: FitnessRecord | null;
  abilityScores: number[];
  abilityLevelLabels: string[];
  rosterName: string;
  testDate: string;
  seatNumber: number | null;
};

type ExportAllReportsPayload = {
  abilityProfile: AbilityGradeProfile | null;
  abilityRulesConfig: AbilityRulesConfig;
  labels: string[];
  records: FitnessRecord[];
  rosterName: string;
  testDate: string;
};

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawSectionBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  width = 338,
): void {
  drawRoundedRect(context, x, y, width, 62, 22);
  const gradient = context.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, "#5c95d8");
  gradient.addColorStop(1, "#79a8e5");
  context.fillStyle = gradient;
  context.fill();

  context.fillStyle = "#ffffff";
  context.font = "700 28px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + 24, y + 32);
}

function drawGenericBadge(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): void {
  drawRoundedRect(context, x, y, size, size, 24);
  context.fillStyle = "#f4f9ff";
  context.fill();
  context.strokeStyle = "#c9def7";
  context.lineWidth = 2;
  context.stroke();

  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size * 0.24;

  context.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 8;
    const outerX = centerX + Math.cos(angle) * radius * 1.9;
    const outerY = centerY + Math.sin(angle) * radius * 1.9;
    const innerX = centerX + Math.cos(angle + Math.PI / 8) * radius * 0.75;
    const innerY = centerY + Math.sin(angle + Math.PI / 8) * radius * 0.75;

    if (index === 0) {
      context.moveTo(outerX, outerY);
    } else {
      context.lineTo(outerX, outerY);
    }
    context.lineTo(innerX, innerY);
  }
  context.closePath();
  context.fillStyle = "#9fc0ec";
  context.fill();

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = "#ffffff";
  context.fill();
  context.strokeStyle = "#8fb7ea";
  context.lineWidth = 2;
  context.stroke();

  context.beginPath();
  context.arc(centerX, centerY, radius * 0.35, 0, Math.PI * 2);
  context.fillStyle = "#f8c85c";
  context.fill();
}

function getRadarPolygonPoints(
  values: number[],
  centerX: number,
  centerY: number,
  radius: number,
): Array<{ x: number; y: number }> {
  return values.map((value, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / values.length;
    const normalized = Math.max(0, Math.min(100, value)) / 100;

    return {
      x: centerX + Math.cos(angle) * radius * normalized,
      y: centerY + Math.sin(angle) * radius * normalized,
    };
  });
}

function formatMetricSummary(labels: string[], scores: number[]): string {
  if (!scores.length) {
    return "尚未選擇學生，請先從上方名單選擇一位小朋友。";
  }

  const strongestIndex = scores.indexOf(Math.max(...scores));
  const supportIndex = scores.indexOf(Math.min(...scores));

  return `本次測驗中，${labels[strongestIndex] ?? "表現"}相對突出；${
    labels[supportIndex] ?? "另一項能力"
  }則可安排更多遊戲化練習。建議持續透過日常活動維持身體控制、節奏感與協調能力。`;
}

function drawBarMeter(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  score: number,
  color: string,
): void {
  const total = 5;
  const filledBars = Math.max(0, Math.min(total, Math.ceil(score / 20)));
  for (let index = 0; index < total; index += 1) {
    drawRoundedRect(context, x + index * 34, y, 24, 16, 6);
    context.fillStyle = index < filledBars ? color : "#eef4fb";
    context.fill();
    context.strokeStyle = index < filledBars ? color : "#d8e6f7";
    context.lineWidth = 1;
    context.stroke();
  }
}

function renderReportPage(
  context: CanvasRenderingContext2D,
  payload: ReportRenderPayload,
): void {
  const { labels, record, abilityScores, abilityLevelLabels, rosterName, testDate, seatNumber } = payload;
  const values = abilityScores;
  const metricSummary = formatMetricSummary(labels, abilityScores);

  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  drawRoundedRect(context, 18, 18, CANVAS_WIDTH - 36, CANVAS_HEIGHT - 36, 28);
  context.strokeStyle = PAGE_BORDER;
  context.lineWidth = 3;
  context.stroke();

  drawGenericBadge(context, 64, 54, 128);

  context.fillStyle = TITLE_COLOR;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = "700 62px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.fillText("幼兒體能測驗報告", 620, 102);
  context.fillStyle = SUBTITLE_COLOR;
  context.font = "500 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.fillText("KINDERGARTEN PHYSICAL FITNESS REPORT", 620, 145);

  drawRoundedRect(context, 970, 56, 196, 92, 22);
  context.fillStyle = SECTION_FILL;
  context.fill();
  context.strokeStyle = "#c9def7";
  context.lineWidth = 2;
  context.stroke();
  context.fillStyle = SUBTITLE_COLOR;
  context.font = "700 22px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.textAlign = "center";
  context.fillText("測驗日期", 1068, 93);
  context.fillStyle = TEXT_COLOR;
  context.font = "500 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.fillText(testDate || "尚未設定", 1068, 128);

  drawRoundedRect(context, 46, 178, 1148, 170, 24);
  context.fillStyle = SECTION_FILL;
  context.fill();
  context.strokeStyle = SECTION_STROKE;
  context.lineWidth = 3;
  context.stroke();

  const infoColumns = [
    { label: "班級", value: rosterName || "未設定班級", x: 165 },
    { label: "座號", value: seatNumber ? `${seatNumber} 號` : "-", x: 425 },
    { label: "姓名", value: record?.studentName || "未選擇學生", x: 695 },
    { label: "身高 / 體重", value: `${record?.height || "-"} cm / ${record?.weight || "-"} kg`, x: 970 },
  ];

  for (let index = 0; index < infoColumns.length; index += 1) {
    const column = infoColumns[index];
    context.fillStyle = SUBTITLE_COLOR;
    context.textAlign = "center";
    context.font = "700 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(column.label, column.x, 242);
    context.fillStyle = TEXT_COLOR;
    context.font = index === 3
      ? "500 30px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif"
      : "500 38px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(column.value, column.x, 296);

    if (index < infoColumns.length - 1) {
      context.setLineDash([5, 8]);
      context.beginPath();
      context.moveTo(column.x + 132, 196);
      context.lineTo(column.x + 132, 330);
      context.strokeStyle = "#c8daf2";
      context.lineWidth = 2;
      context.stroke();
      context.setLineDash([]);
    }
  }

  drawSectionBadge(context, 44, 378, "六項體能表現雷達圖");

  const chartCenterX = 620;
  const chartCenterY = 790;
  const chartRadius = 260;

  for (let ring = 1; ring <= 5; ring += 1) {
    const currentRadius = (chartRadius / 5) * ring;
    const ringLabel = String(ring * 20);
    context.beginPath();
    labels.forEach((_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
      const x = chartCenterX + Math.cos(angle) * currentRadius;
      const y = chartCenterY + Math.sin(angle) * currentRadius;
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.closePath();
    context.strokeStyle = ring % 2 === 0 ? "#d9e7f8" : "#edf4fc";
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = MUTED_TEXT_COLOR;
    context.font = "500 16px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textAlign = "center";
    context.fillText(ringLabel, chartCenterX, chartCenterY - currentRadius - 8);
  }

  labels.forEach((_, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
    const axisX = chartCenterX + Math.cos(angle) * chartRadius;
    const axisY = chartCenterY + Math.sin(angle) * chartRadius;

    context.beginPath();
    context.moveTo(chartCenterX, chartCenterY);
    context.lineTo(axisX, axisY);
    context.strokeStyle = "#c7d8ee";
    context.lineWidth = 2;
    context.stroke();
  });

  const polygonPoints = getRadarPolygonPoints(values, chartCenterX, chartCenterY, chartRadius);
  context.beginPath();
  polygonPoints.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.closePath();
  context.fillStyle = CHART_FILL;
  context.strokeStyle = CHART_LINE;
  context.lineWidth = 4;
  context.fill();
  context.stroke();

  polygonPoints.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, 8, 0, Math.PI * 2);
    context.fillStyle = CHART_LINE;
    context.fill();
  });

  labels.forEach((label, index) => {
    const color = SCORE_COLORS[index % SCORE_COLORS.length];
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / labels.length;
    const iconX = chartCenterX + Math.cos(angle) * 372;
    const iconY = chartCenterY + Math.sin(angle) * 372;
    const textX = chartCenterX + Math.cos(angle) * 430;
    const textY = chartCenterY + Math.sin(angle) * 430;

    context.beginPath();
    context.arc(iconX, iconY, 26, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();

    context.fillStyle = color;
    context.font = "700 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index + 1), iconX, iconY);

    context.fillStyle = color;
    context.font = "700 26px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textAlign =
      Math.cos(angle) < -0.1 ? "right" : Math.cos(angle) > 0.1 ? "left" : "center";
    context.fillText(label, textX, textY);
  });

  drawSectionBadge(context, 44, 1134, "六項測驗結果摘要");
  drawRoundedRect(context, 44, 1208, 1150, 290, 22);
  context.fillStyle = SECTION_FILL;
  context.fill();
  context.strokeStyle = SECTION_STROKE;
  context.lineWidth = 3;
  context.stroke();

  const tableColumns = [
    { label: "測驗項目", x: 76 },
    { label: "分數", x: 334 },
    { label: "表現等級", x: 490 },
    { label: "表現長條圖", x: 760 },
  ];

  context.strokeStyle = "#d5e4f7";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(44, 1262);
  context.lineTo(1194, 1262);
  context.stroke();

  tableColumns.forEach((column) => {
    context.fillStyle = SUBTITLE_COLOR;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = "700 22px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(column.label, column.x, 1235);
  });

  for (let index = 0; index < labels.length; index += 1) {
    const rowY = 1300 + index * 36;
    const score = values[index] ?? 0;
    const color = SCORE_COLORS[index % SCORE_COLORS.length];

    if (index < labels.length - 1) {
      context.beginPath();
      context.moveTo(64, rowY + 24);
      context.lineTo(1174, rowY + 24);
      context.strokeStyle = "#ecf3fb";
      context.stroke();
    }

    context.beginPath();
    context.arc(92, rowY, 16, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = "700 18px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(String(index + 1), 92, rowY + 1);

    context.fillStyle = TEXT_COLOR;
    context.textAlign = "left";
    context.font = "500 22px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(labels[index] ?? `項目 ${index + 1}`, 126, rowY + 1);

    context.textAlign = "center";
    context.font = "700 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(String(score), 384, rowY + 1);

    context.font = "500 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(abilityLevelLabels[index] ?? "未分級", 580, rowY + 1);

    drawBarMeter(context, 804, rowY - 10, score, color);
  }

  drawSectionBadge(context, 44, 1524, "老師觀察與鼓勵", 300);
  drawRoundedRect(context, 44, 1598, 1150, 118, 20);
  context.fillStyle = "#fffdf8";
  context.fill();
  context.strokeStyle = "#e5d1a0";
  context.lineWidth = 2.5;
  context.stroke();

  context.fillStyle = TEXT_COLOR;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.font = "500 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  context.fillText(record?.comment || metricSummary, 82, 1638, 1060);
}

function createReportCanvas(payload: ReportRenderPayload): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("無法建立報表畫布。");
  }

  renderReportPage(context, payload);
  return canvas;
}

function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "fitness-report";
}

export async function exportAllReportsPdf(
  payload: ExportAllReportsPayload,
): Promise<void> {
  const { abilityProfile, abilityRulesConfig, labels, records, rosterName, testDate } = payload;
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (records.length === 0) {
    const canvas = createReportCanvas({
      abilityLevelLabels: ["未分級", "未分級", "未分級", "未分級", "未分級", "未分級"],
      abilityScores: [0, 0, 0, 0, 0, 0],
      labels,
      record: null,
      rosterName,
      testDate,
      seatNumber: null,
    });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
  } else {
    records.forEach((record, index) => {
      const abilityScores = getAbilityScores(record, abilityProfile);
      const canvas = createReportCanvas({
        abilityLevelLabels: abilityScores.map((score) =>
          getAbilityBandLabel(score, abilityRulesConfig),
        ),
        abilityScores,
        labels,
        record,
        rosterName,
        testDate,
        seatNumber: index + 1,
      });

      if (index > 0) {
        pdf.addPage();
      }

      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
    });
  }

  pdf.save(`${sanitizeFileName(rosterName)}-全班體能報告.pdf`);
}

const A4CanvasBoard = forwardRef<A4CanvasBoardHandle, A4CanvasBoardProps>(
  function A4CanvasBoard({ labels, record, abilityScores, abilityLevelLabels, rosterName, testDate, seatNumber }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const renderPayload = useMemo(
      () => ({
          labels,
          record,
          abilityScores,
          abilityLevelLabels,
          rosterName,
          testDate,
          seatNumber,
      }),
  [abilityLevelLabels, abilityScores, labels, record, rosterName, testDate, seatNumber],
);

    useEffect(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) {
        return;
      }

      renderReportPage(context, renderPayload);
    }, [renderPayload]);

    useImperativeHandle(ref, () => ({
      async downloadCurrentPdf(): Promise<void> {
        const canvas = createReportCanvas(renderPayload);
        const pdf = new jsPDF({
          orientation: "portrait",
          unit: "mm",
          format: "a4",
        });
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
        pdf.save(
          `${sanitizeFileName(
            `${rosterName || "班級"}-${record?.studentName || "未選擇學生"}-體能報告`,
          )}.pdf`,
        );
      },
    }), [renderPayload, record?.studentName, rosterName]);

    return (
      <div className="canvas-board">
        <div className="canvas-stage">
          <canvas
            className="a4-canvas"
            height={CANVAS_HEIGHT}
            ref={canvasRef}
            width={CANVAS_WIDTH}
          />
        </div>
      </div>
    );
  },
);

export default A4CanvasBoard;
