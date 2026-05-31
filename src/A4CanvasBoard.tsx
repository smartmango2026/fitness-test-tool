import { jsPDF } from "jspdf";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  generateObservationAndEncouragement,
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
  downloadCurrentPng: () => Promise<void>;
};

type A4CanvasBoardProps = {
  abilityProfile: AbilityGradeProfile | null;
  abilityRulesConfig: AbilityRulesConfig;
  labels: string[];
  record: FitnessRecord | null;
  abilityScores: number[];
  abilityLevelLabels: string[];
  rosterName: string;
  testDate: string;
  seatNumber: number | null;
};

type ReportRenderPayload = {
  abilityProfile: AbilityGradeProfile | null;
  abilityRulesConfig: AbilityRulesConfig;
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

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph.trim()) {
      lines.push("");
      return;
    }

    const characters = Array.from(paragraph);
    let currentLine = "";

    characters.forEach((character) => {
      const candidate = `${currentLine}${character}`;
      if (!currentLine || context.measureText(candidate).width <= maxWidth) {
        currentLine = candidate;
        return;
      }

      lines.push(currentLine);
      currentLine = character;
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    if (paragraphIndex < paragraphs.length - 1) {
      lines.push("");
    }
  });

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    const lastLine = visibleLines[visibleLines.length - 1] ?? "";
    visibleLines[visibleLines.length - 1] = `${lastLine.slice(0, -1)}…`;
  }

  visibleLines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function getWrappedLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text.trim()) {
    return [];
  }

  const characters = Array.from(text);
  const lines: string[] = [];
  let currentLine = "";

  characters.forEach((character) => {
    const candidate = `${currentLine}${character}`;
    if (!currentLine || context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      return;
    }

    lines.push(currentLine);
    currentLine = character;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawObservationSections(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxLines: number,
): void {
  const sections = text
    .split("\n\n")
    .map((section) => section.trim())
    .filter(Boolean)
    .map((section) => {
      const [heading = "", ...bodyParts] = section.split("\n");
      return {
        heading: heading.trim(),
        body: bodyParts.join("").trim(),
      };
    });

  let cursorY = y;
  let usedLines = 0;

  for (const section of sections) {
    if (usedLines >= maxLines) {
      break;
    }

    context.fillStyle = "#476fbb";
    context.font = "700 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(section.heading, x, cursorY);
    cursorY += 32;
    usedLines += 1;

    if (usedLines >= maxLines) {
      break;
    }

    context.fillStyle = TEXT_COLOR;
    context.font = "500 22px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    const bodyLines = getWrappedLines(context, section.body, maxWidth);
    const remainingLines = Math.max(0, maxLines - usedLines);
    const visibleBodyLines = bodyLines.slice(0, remainingLines);

    if (bodyLines.length > remainingLines && visibleBodyLines.length > 0) {
      const lastLine = visibleBodyLines[visibleBodyLines.length - 1] ?? "";
      visibleBodyLines[visibleBodyLines.length - 1] = `${lastLine.slice(0, -1)}…`;
    }

    visibleBodyLines.forEach((line) => {
      context.fillText(line, x, cursorY);
      cursorY += 34;
      usedLines += 1;
    });

    cursorY += 10;
  }
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
  const {
    abilityProfile,
    abilityRulesConfig,
    labels,
    record,
    abilityScores,
    abilityLevelLabels,
    rosterName,
    testDate,
    seatNumber,
  } = payload;
  const values = abilityScores;
  const generatedObservation = generateObservationAndEncouragement(
    record,
    abilityProfile,
    abilityRulesConfig,
  );

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

  drawSectionBadge(context, 44, 378, "六項體能表現雷達圖", 320);
  drawRoundedRect(context, 44, 452, 552, 680, 22);
  context.fillStyle = SECTION_FILL;
  context.fill();
  context.strokeStyle = SECTION_STROKE;
  context.lineWidth = 3;
  context.stroke();

  drawSectionBadge(context, 642, 378, "六項測驗結果摘要", 300);
  drawRoundedRect(context, 642, 452, 552, 680, 22);
  context.fillStyle = SECTION_FILL;
  context.fill();
  context.strokeStyle = SECTION_STROKE;
  context.lineWidth = 3;
  context.stroke();

  const chartCenterX = 320;
  const chartCenterY = 790;
  const chartRadius = 170;

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
    context.strokeStyle = ring % 2 === 0 ? "#bdd3ec" : "#d7e4f5";
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
    context.strokeStyle = "#afc7e3";
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

  const labelLayouts = [
    {
      iconX: 320,
      iconY: 558,
      textX: 320,
      textY: 510,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
    {
      iconX: 521,
      iconY: 674,
      textX: 521,
      textY: 620,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
    {
      iconX: 521,
      iconY: 906,
      textX: 521,
      textY: 958,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
    {
      iconX: 320,
      iconY: 1022,
      textX: 320,
      textY: 1074,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
    {
      iconX: 119,
      iconY: 906,
      textX: 119,
      textY: 958,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
    {
      iconX: 119,
      iconY: 674,
      textX: 119,
      textY: 622,
      textAlign: "center" as CanvasTextAlign,
      textBaseline: "middle" as CanvasTextBaseline,
    },
  ];

  labels.forEach((label, index) => {
    const color = SCORE_COLORS[index % SCORE_COLORS.length];
    const layout = labelLayouts[index] ?? labelLayouts[0];
    const { iconX, iconY, textX, textY } = layout;

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
    context.font = "700 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textAlign = layout.textAlign;
    context.textBaseline = layout.textBaseline;
    context.fillText(label, textX, textY);
  });

  const tableColumns = [
    { label: "測驗項目", x: 696 },
    { label: "表現等級", x: 856 },
    { label: "表現長條圖", x: 996 },
  ];

  context.strokeStyle = "#d5e4f7";
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(642, 514);
  context.lineTo(1194, 514);
  context.stroke();

  tableColumns.forEach((column) => {
    context.fillStyle = SUBTITLE_COLOR;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = "700 20px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(column.label, column.x, 490);
  });

  for (let index = 0; index < labels.length; index += 1) {
    const rowY = 552 + index * 92;
    const rowCenterY = rowY;
    const score = values[index] ?? 0;
    const color = SCORE_COLORS[index % SCORE_COLORS.length];

    if (index < labels.length - 1) {
      context.beginPath();
      context.moveTo(662, rowY + 44);
      context.lineTo(1174, rowY + 44);
      context.strokeStyle = "#ecf3fb";
      context.stroke();
    }

    context.beginPath();
    context.arc(692, rowY, 16, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = "#ffffff";
    context.textAlign = "center";
    context.font = "700 18px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(String(index + 1), 692, rowY);

    context.fillStyle = color;
    context.textAlign = "left";
    context.font = "700 22px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textBaseline = "middle";
    context.fillText(labels[index] ?? `項目 ${index + 1}`, 722, rowCenterY);

    context.fillStyle = TEXT_COLOR;
    context.textAlign = "left";
    context.font = "500 18px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.textBaseline = "middle";
    context.fillText(abilityLevelLabels[index] ?? "未分級", 856, rowCenterY);

    drawBarMeter(context, 992, rowCenterY - 8, score, color);
  }

  drawSectionBadge(context, 44, 1158, "老師觀察與鼓勵", 300);
  drawRoundedRect(context, 44, 1232, 1150, 484, 20);
  context.fillStyle = "#fffdf8";
  context.fill();
  context.strokeStyle = "#e5d1a0";
  context.lineWidth = 2.5;
  context.stroke();

  context.fillStyle = TEXT_COLOR;
  drawObservationSections(context, generatedObservation, 82, 1272, 1070, 11);
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

function downloadBlobUrl(href: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
      abilityProfile: null,
      abilityRulesConfig,
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
        abilityProfile,
        abilityRulesConfig,
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
  function A4CanvasBoard(
    {
      abilityProfile,
      abilityRulesConfig,
      labels,
      record,
      abilityScores,
      abilityLevelLabels,
      rosterName,
      testDate,
      seatNumber,
    },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const renderPayload = useMemo(
      () => ({
        abilityProfile,
        abilityRulesConfig,
        labels,
        record,
        abilityScores,
        abilityLevelLabels,
        rosterName,
        testDate,
        seatNumber,
      }),
      [
        abilityLevelLabels,
        abilityProfile,
        abilityRulesConfig,
        abilityScores,
        labels,
        record,
        rosterName,
        seatNumber,
        testDate,
      ],
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
      async downloadCurrentPng(): Promise<void> {
        const canvas = createReportCanvas(renderPayload);
        const fileName = `${sanitizeFileName(
          `${rosterName || "班級"}-${record?.studentName || "未選擇學生"}-體能報告`,
        )}.png`;
        downloadBlobUrl(canvas.toDataURL("image/png"), fileName);
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
