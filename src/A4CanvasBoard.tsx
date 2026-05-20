import { jsPDF } from "jspdf";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
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

type CanvasTextBlock = {
  id: string;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: "normal" | "bold";
};

type CanvasImageBlock = {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type A4CanvasBoardProps = {
  labels: string[];
  record: FitnessRecord | null;
  rosterName: string;
  testDate: string;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("圖片載入失敗。"));
    image.src = src;
  });
}

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
    const normalized = Math.max(0, Math.min(1, value / 5));

    return {
      x: centerX + Math.cos(angle) * radius * normalized,
      y: centerY + Math.sin(angle) * radius * normalized,
    };
  });
}

function scoreToLevel(score: number): string {
  if (score >= 5) {
    return "優良";
  }
  if (score >= 4) {
    return "良好";
  }
  if (score >= 3) {
    return "穩定發展中";
  }
  if (score >= 2) {
    return "可再加強";
  }
  return "需要多練習";
}

function formatMetricSummary(labels: string[], record: FitnessRecord | null): string {
  if (!record) {
    return "尚未選擇學生，請先到能力分析頁或總表選定一位學生。";
  }

  const values = [record.item1, record.item2, record.item3, record.item4, record.item5, record.item6];
  const strongestIndex = values.indexOf(Math.max(...values));
  const supportIndex = values.indexOf(Math.min(...values));

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
  for (let index = 0; index < total; index += 1) {
    drawRoundedRect(context, x + index * 34, y, 24, 16, 6);
    context.fillStyle = index < score ? color : "#eef4fb";
    context.fill();
    context.strokeStyle = index < score ? color : "#d8e6f7";
    context.lineWidth = 1;
    context.stroke();
  }
}

export default function A4CanvasBoard({
  labels,
  record,
  rosterName,
  testDate,
}: A4CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [title, setTitle] = useState("幼兒體能測驗報告");
  const [textBlocks, setTextBlocks] = useState<CanvasTextBlock[]>([]);
  const [imageBlocks, setImageBlocks] = useState<CanvasImageBlock[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  const selectedText =
    textBlocks.find((block) => block.id === selectedTextId) ?? null;
  const selectedImage =
    imageBlocks.find((block) => block.id === selectedImageId) ?? null;

  async function drawCanvas(): Promise<void> {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const values = record
      ? [record.item1, record.item2, record.item3, record.item4, record.item5, record.item6]
      : [0, 0, 0, 0, 0, 0];
    const metricSummary = formatMetricSummary(labels, record);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    drawRoundedRect(context, 18, 18, canvas.width - 36, canvas.height - 36, 28);
    context.strokeStyle = PAGE_BORDER;
    context.lineWidth = 3;
    context.stroke();

    drawGenericBadge(context, 64, 54, 128);

    context.fillStyle = TITLE_COLOR;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.font = "700 62px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
    context.fillText(title, 620, 102);
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
      { label: "班級", value: rosterName || "未設定班級", x: 155 },
      { label: "身高", value: record?.height ? `${record.height} cm` : "未填寫", x: 420 },
      { label: "姓名", value: record?.studentName || "未選擇學生", x: 690 },
      { label: "體重", value: record?.weight ? `${record.weight} kg` : "未填寫", x: 960 },
    ];

    for (let index = 0; index < infoColumns.length; index += 1) {
      const column = infoColumns[index];
      context.fillStyle = SUBTITLE_COLOR;
      context.textAlign = "center";
      context.font = "700 24px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
      context.fillText(column.label, column.x, 242);
      context.fillStyle = TEXT_COLOR;
      context.font = "500 38px 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
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
      context.fillText(String(ring), chartCenterX, chartCenterY - currentRadius - 8);
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
      { label: "測驗項目", x: 76, width: 220 },
      { label: "分數", x: 334, width: 100 },
      { label: "表現等級", x: 490, width: 220 },
      { label: "表現長條圖", x: 760, width: 240 },
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
      context.fillText(scoreToLevel(score), 580, rowY + 1);

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

    for (const imageBlock of imageBlocks) {
      try {
        const image = await loadImage(imageBlock.src);
        context.drawImage(image, imageBlock.x, imageBlock.y, imageBlock.width, imageBlock.height);
      } catch {
        context.fillStyle = "#fecaca";
        context.fillRect(imageBlock.x, imageBlock.y, imageBlock.width, imageBlock.height);
      }
    }

    for (const block of textBlocks) {
      context.textAlign = "left";
      context.textBaseline = "top";
      context.fillStyle = block.color;
      context.font = `${block.fontWeight} ${block.fontSize}px "Noto Sans TC", "Microsoft JhengHei", sans-serif`;

      const lines = block.content.split("\n");
      lines.forEach((line, index) => {
        context.fillText(line || " ", block.x, block.y + index * (block.fontSize + 10));
      });
    }
  }

  useEffect(() => {
    void drawCanvas();
  }, [title, textBlocks, imageBlocks, labels, record, rosterName, testDate]);

  function addTextBlock(): void {
    const nextBlock: CanvasTextBlock = {
      id: crypto.randomUUID(),
      content: "請輸入補充文字",
      x: 120,
      y: 320,
      fontSize: 28,
      color: "#172033",
      fontWeight: "normal",
    };
    setTextBlocks((current) => [...current, nextBlock]);
    setSelectedTextId(nextBlock.id);
    setSelectedImageId(null);
  }

  function updateSelectedText(
    field: keyof Omit<CanvasTextBlock, "id">,
    value: string,
  ): void {
    if (!selectedTextId) {
      return;
    }

    setTextBlocks((current) =>
      current.map((block) => {
        if (block.id !== selectedTextId) {
          return block;
        }

        if (field === "x" || field === "y" || field === "fontSize") {
          return { ...block, [field]: Number(value) || 0 };
        }

        if (field === "fontWeight") {
          return {
            ...block,
            fontWeight: value === "bold" ? "bold" : "normal",
          };
        }

        return { ...block, [field]: value };
      }),
    );
  }

  function updateSelectedImage(
    field: keyof Omit<CanvasImageBlock, "id" | "name" | "src">,
    value: string,
  ): void {
    if (!selectedImageId) {
      return;
    }

    setImageBlocks((current) =>
      current.map((block) =>
        block.id === selectedImageId
          ? {
              ...block,
              [field]: Number(value) || 0,
            }
          : block,
      ),
    );
  }

  function removeSelectedText(): void {
    if (!selectedTextId) {
      return;
    }

    setTextBlocks((current) => current.filter((block) => block.id !== selectedTextId));
    setSelectedTextId(null);
  }

  function removeSelectedImage(): void {
    if (!selectedImageId) {
      return;
    }

    setImageBlocks((current) => current.filter((block) => block.id !== selectedImageId));
    setSelectedImageId(null);
  }

  async function handleImageUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) {
        return;
      }

      const nextBlock: CanvasImageBlock = {
        id: crypto.randomUUID(),
        name: file.name,
        src,
        x: 820,
        y: 1540,
        width: 200,
        height: 120,
      };
      setImageBlocks((current) => [...current, nextBlock]);
      setSelectedImageId(nextBlock.id);
      setSelectedTextId(null);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function exportCanvasPdf(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    await drawCanvas();
    const imageUrl = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    pdf.addImage(imageUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
    pdf.save("fitness-report.pdf");
  }

  return (
    <div className="canvas-board">
      <div className="canvas-tool-grid">
        <section className="canvas-tools">
          <div className="canvas-tool-card">
            <label className="metric-label-editor">
              報告標題
              <input
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
          </div>

          <div className="canvas-tool-card">
            <div className="button-row">
              <button className="secondary-button" onClick={addTextBlock} type="button">
                新增文字
              </button>
              <label className="file-button">
                上傳圖片
                <input accept="image/*" onChange={handleImageUpload} type="file" />
              </label>
              <button className="primary-button" onClick={exportCanvasPdf} type="button">
                下載 PDF
              </button>
            </div>
          </div>

          <div className="canvas-tool-card">
            <h3>文字圖層</h3>
            <div className="layer-list">
              {textBlocks.map((block, index) => (
                <button
                  className={block.id === selectedTextId ? "layer-item is-active" : "layer-item"}
                  key={block.id}
                  onClick={() => {
                    setSelectedTextId(block.id);
                    setSelectedImageId(null);
                  }}
                  type="button"
                >
                  <span>文字 {index + 1}</span>
                  <small>{block.content.slice(0, 14) || "空白文字"}</small>
                </button>
              ))}
            </div>

            {selectedText ? (
              <div className="canvas-form-grid">
                <label>
                  內容
                  <textarea
                    onChange={(event) => updateSelectedText("content", event.target.value)}
                    rows={4}
                    value={selectedText.content}
                  />
                </label>
                <label>
                  X
                  <input
                    onChange={(event) => updateSelectedText("x", event.target.value)}
                    type="number"
                    value={selectedText.x}
                  />
                </label>
                <label>
                  Y
                  <input
                    onChange={(event) => updateSelectedText("y", event.target.value)}
                    type="number"
                    value={selectedText.y}
                  />
                </label>
                <label>
                  字級
                  <input
                    onChange={(event) => updateSelectedText("fontSize", event.target.value)}
                    type="number"
                    value={selectedText.fontSize}
                  />
                </label>
                <label>
                  顏色
                  <input
                    onChange={(event) => updateSelectedText("color", event.target.value)}
                    type="color"
                    value={selectedText.color}
                  />
                </label>
                <label>
                  粗細
                  <select
                    onChange={(event) => updateSelectedText("fontWeight", event.target.value)}
                    value={selectedText.fontWeight}
                  >
                    <option value="normal">一般</option>
                    <option value="bold">粗體</option>
                  </select>
                </label>
                <button
                  className="danger-button"
                  onClick={removeSelectedText}
                  type="button"
                >
                  刪除文字
                </button>
              </div>
            ) : null}
          </div>

          <div className="canvas-tool-card">
            <h3>圖片圖層</h3>
            <div className="layer-list">
              {imageBlocks.map((block, index) => (
                <button
                  className={block.id === selectedImageId ? "layer-item is-active" : "layer-item"}
                  key={block.id}
                  onClick={() => {
                    setSelectedImageId(block.id);
                    setSelectedTextId(null);
                  }}
                  type="button"
                >
                  <span>圖片 {index + 1}</span>
                  <small>{block.name}</small>
                </button>
              ))}
            </div>

            {selectedImage ? (
              <div className="canvas-form-grid">
                <label>
                  X
                  <input
                    onChange={(event) => updateSelectedImage("x", event.target.value)}
                    type="number"
                    value={selectedImage.x}
                  />
                </label>
                <label>
                  Y
                  <input
                    onChange={(event) => updateSelectedImage("y", event.target.value)}
                    type="number"
                    value={selectedImage.y}
                  />
                </label>
                <label>
                  寬度
                  <input
                    onChange={(event) => updateSelectedImage("width", event.target.value)}
                    type="number"
                    value={selectedImage.width}
                  />
                </label>
                <label>
                  高度
                  <input
                    onChange={(event) => updateSelectedImage("height", event.target.value)}
                    type="number"
                    value={selectedImage.height}
                  />
                </label>
                <button
                  className="danger-button"
                  onClick={removeSelectedImage}
                  type="button"
                >
                  刪除圖片
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <div className="canvas-stage">
          <canvas
            className="a4-canvas"
            height={CANVAS_HEIGHT}
            ref={canvasRef}
            width={CANVAS_WIDTH}
          />
        </div>
      </div>
    </div>
  );
}
