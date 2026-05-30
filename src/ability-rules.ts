export type AbilityScore = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100;

export type NumericAbilityBand = {
  min?: number;
  max?: number;
  score: AbilityScore;
};

export type RubricAbilityBand = {
  key: "excellent" | "good" | "pass" | "effort" | "starter";
  label: string;
  score: 20 | 40 | 60 | 80 | 100;
};

export type NumericAbilityRule = {
  kind: "numeric";
  metricLabel: string;
  abilityLabel: string;
  bands: NumericAbilityBand[];
};

export type RubricAbilityRule = {
  kind: "rubric";
  metricLabel: string;
  abilityLabel: string;
  bands: RubricAbilityBand[];
};

export type AbilityRule = NumericAbilityRule | RubricAbilityRule;

export type GradeGroupKey = "middleSenior" | "junior";

export type AbilityMetricKey =
  | "item1"
  | "item2"
  | "item3"
  | "item4"
  | "item5"
  | "item6";

export type AbilityReportBand = {
  min: number;
  max: number;
  systemLabel: string;
  parentAdvice: string;
};

export type LowAbilityAdvice = {
  title: string;
  description: string[];
  activities: string[];
};

export const LOW_ABILITY_THRESHOLD = 60;

const commonRubricBands: RubricAbilityBand[] = [
  { key: "excellent", label: "神表現", score: 100 },
  { key: "good", label: "穩當當", score: 80 },
  { key: "pass", label: "達標", score: 60 },
  { key: "effort", label: "再努力", score: 40 },
  { key: "starter", label: "起步中", score: 20 },
];

export const gradeGroupLabels: Record<GradeGroupKey, string> = {
  middleSenior: "中大班",
  junior: "小幼班",
};

export const abilityRulesByGradeGroup: Record<
  GradeGroupKey,
  Record<AbilityMetricKey, AbilityRule>
> = {
  middleSenior: {
    item1: {
      kind: "numeric",
      metricLabel: "立定跳遠",
      abilityLabel: "爆發力",
      bands: [
        { min: 125, score: 100 },
        { min: 110, max: 124, score: 90 },
        { min: 100, max: 109, score: 80 },
        { min: 90, max: 99, score: 70 },
        { min: 80, max: 89, score: 60 },
        { min: 70, max: 79, score: 50 },
        { min: 60, max: 69, score: 40 },
        { min: 50, max: 59, score: 30 },
        { min: 40, max: 49, score: 20 },
        { max: 39, score: 10 },
      ],
    },
    item2: {
      kind: "numeric",
      metricLabel: "坐姿體前彎",
      abilityLabel: "柔軟度",
      bands: [
        { min: 40, score: 100 },
        { min: 35, max: 39, score: 90 },
        { min: 31, max: 34, score: 80 },
        { min: 28, max: 30, score: 70 },
        { min: 25, max: 27, score: 60 },
        { min: 20, max: 24, score: 50 },
        { min: 15, max: 19, score: 40 },
        { min: 10, max: 14, score: 30 },
        { min: 0, max: 9, score: 20 },
        { max: -1, score: 10 },
      ],
    },
    item3: {
      kind: "numeric",
      metricLabel: "擲遠",
      abilityLabel: "上肢力量",
      bands: [
        { min: 450, score: 100 },
        { min: 400, max: 449, score: 90 },
        { min: 350, max: 399, score: 80 },
        { min: 300, max: 349, score: 70 },
        { min: 250, max: 299, score: 60 },
        { min: 200, max: 249, score: 50 },
        { min: 150, max: 199, score: 40 },
        { min: 100, max: 149, score: 30 },
        { min: 50, max: 99, score: 20 },
        { min: 0, max: 49, score: 10 },
      ],
    },
    item4: {
      kind: "rubric",
      metricLabel: "前滾翻",
      abilityLabel: "協調力",
      bands: commonRubricBands,
    },
    item5: {
      kind: "numeric",
      metricLabel: "側併摸地",
      abilityLabel: "敏捷度",
      bands: [
        { min: 18, score: 100 },
        { min: 16, max: 17, score: 90 },
        { min: 14, max: 15, score: 80 },
        { min: 12, max: 13, score: 70 },
        { min: 10, max: 11, score: 60 },
        { min: 8, max: 9, score: 50 },
        { min: 6, max: 7, score: 40 },
        { min: 4, max: 5, score: 30 },
        { min: 2, max: 3, score: 20 },
        { min: 1, max: 2, score: 10 },
      ],
    },
    item6: {
      kind: "numeric",
      metricLabel: "單腳跳",
      abilityLabel: "平衡力",
      bands: [
        { min: 100, score: 100 },
        { min: 90, max: 99, score: 90 },
        { min: 80, max: 89, score: 80 },
        { min: 70, max: 79, score: 70 },
        { min: 60, max: 69, score: 60 },
        { min: 41, max: 59, score: 50 },
        { min: 31, max: 40, score: 40 },
        { min: 21, max: 30, score: 30 },
        { min: 11, max: 20, score: 20 },
        { max: 10, score: 10 },
      ],
    },
  },
  junior: {
    item1: {
      kind: "numeric",
      metricLabel: "立定跳遠",
      abilityLabel: "爆發力",
      bands: [
        { min: 100, score: 100 },
        { min: 90, max: 99, score: 90 },
        { min: 80, max: 89, score: 80 },
        { min: 70, max: 79, score: 70 },
        { min: 60, max: 69, score: 60 },
        { min: 50, max: 59, score: 50 },
        { min: 40, max: 49, score: 40 },
        { min: 30, max: 39, score: 30 },
        { min: 25, max: 29, score: 20 },
        { max: 24, score: 10 },
      ],
    },
    item2: {
      kind: "numeric",
      metricLabel: "坐姿體前彎",
      abilityLabel: "柔軟度",
      bands: [
        { min: 40, score: 100 },
        { min: 35, max: 39, score: 90 },
        { min: 31, max: 34, score: 80 },
        { min: 28, max: 30, score: 70 },
        { min: 25, max: 27, score: 60 },
        { min: 20, max: 24, score: 50 },
        { min: 15, max: 19, score: 40 },
        { min: 10, max: 14, score: 30 },
        { min: 0, max: 9, score: 20 },
        { max: -1, score: 10 },
      ],
    },
    item3: {
      kind: "numeric",
      metricLabel: "擲遠",
      abilityLabel: "上肢力量",
      bands: [
        { min: 100, score: 100 },
        { min: 90, max: 99, score: 90 },
        { min: 80, max: 89, score: 80 },
        { min: 70, max: 79, score: 70 },
        { min: 60, max: 69, score: 60 },
        { min: 50, max: 59, score: 50 },
        { min: 40, max: 49, score: 40 },
        { min: 30, max: 39, score: 30 },
        { min: 25, max: 29, score: 20 },
        { max: 24, score: 10 },
      ],
    },
    item4: {
      kind: "rubric",
      metricLabel: "6 公尺定向爬行",
      abilityLabel: "敏捷移動",
      bands: commonRubricBands,
    },
    item5: {
      kind: "rubric",
      metricLabel: "平衡走",
      abilityLabel: "平衡力",
      bands: commonRubricBands,
    },
    item6: {
      kind: "numeric",
      metricLabel: "雙腳跳",
      abilityLabel: "協調力",
      bands: [
        { min: 100, score: 100 },
        { min: 90, max: 99, score: 90 },
        { min: 80, max: 89, score: 80 },
        { min: 70, max: 79, score: 70 },
        { min: 50, max: 69, score: 60 },
        { min: 40, max: 49, score: 50 },
        { min: 30, max: 39, score: 40 },
        { min: 20, max: 29, score: 30 },
        { min: 10, max: 19, score: 20 },
        { max: 9, score: 10 },
      ],
    },
  },
};

export const abilityReportBands: AbilityReportBand[] = [
  {
    min: 90,
    max: 100,
    systemLabel: "卓越",
    parentAdvice:
      "孩子在此項能力表現相當突出，不僅具備良好的身體控制能力，也展現出成熟的感覺統合發展。建議提供更多元的挑戰與進階活動，持續培養自信心與運動興趣。",
  },
  {
    min: 80,
    max: 89,
    systemLabel: "優秀",
    parentAdvice:
      "孩子在此能力發展穩定，身體協調與動作控制表現良好，已具備良好的學習基礎。透過持續參與運動遊戲，可進一步提升整體發展。",
  },
  {
    min: 70,
    max: 79,
    systemLabel: "良好",
    parentAdvice:
      "孩子已具備不錯的身體能力與感覺統合基礎，大部分動作皆能順利完成。建議持續透過遊戲與活動累積經驗，促進動作更加成熟穩定。",
  },
  {
    min: 60,
    max: 69,
    systemLabel: "達標",
    parentAdvice:
      "孩子的能力發展符合目前年齡階段，已建立基本的身體控制與動作能力。建議維持規律運動與多元感官刺激，幫助能力持續成長。",
  },
  {
    min: 50,
    max: 59,
    systemLabel: "接近達標",
    parentAdvice:
      "孩子正在建立相關能力，部分動作穩定度與身體控制能力仍有進步空間。透過遊戲化活動與成功經驗累積，可逐步提升感覺統合與動作表現。",
  },
  {
    min: 40,
    max: 49,
    systemLabel: "需加強",
    parentAdvice:
      "孩子在此項能力的發展較需要練習，可能影響部分身體控制、動作協調或感覺統合表現。建議增加相關運動遊戲與操作活動，建立更多動作經驗。",
  },
  {
    min: 10,
    max: 39,
    systemLabel: "重點提升",
    parentAdvice:
      "孩子目前在此能力的發展較為不足，建議從簡單、安全且有趣的活動開始，逐步建立身體能力、感覺統合與動作自信，避免過度要求造成挫折感。",
  },
];

export const lowAbilityAdviceByKey: Record<string, LowAbilityAdvice> = {
  explosivePower: {
    title: "爆發力偏低",
    description: [
      "爆發力主要反映孩子下肢肌力、身體控制能力與動作輸出的效率，也是跑步、跳躍、跨越障礙等動作的重要基礎。",
      "若爆發力發展較弱，孩子在跑跳活動中可能較容易感到吃力，跳躍距離較短，或在需要快速移動與改變方向時表現較不穩定。",
      "爆發力的發展與本體覺有密切關聯，本體覺能幫助孩子掌握出力大小、控制身體動作與建立身體自信。",
    ],
    activities: ["跳格子", "雙腳連續跳", "障礙跨越", "攀爬遊戲", "跳箱活動", "上下樓梯", "跳圈圈"],
  },
  flexibility: {
    title: "柔軟度偏低",
    description: [
      "柔軟度代表肌肉與關節的活動範圍，與身體伸展能力、動作品質及受傷風險有關。",
      "若柔軟度較不足，孩子可能出現動作幅度較小、蹲姿不穩、身體容易緊繃，或在進行較大幅度動作時顯得較為吃力。",
      "良好的柔軟度能幫助孩子更順利完成各種身體動作，也有助於姿勢發展與身體控制。",
    ],
    activities: ["動物伸展遊戲", "幼兒瑜珈", "模仿操", "大肌肉律動活動", "滾動遊戲", "地板活動"],
  },
  balance: {
    title: "平衡力偏低",
    description: [
      "平衡能力與前庭覺系統發展密切相關。",
      "前庭覺位於內耳，負責感知身體移動、方向改變與重心控制，是姿勢穩定與身體控制的重要基礎。",
      "若平衡能力較弱，孩子可能容易跌倒、單腳站立不穩、動作協調較差，坐姿與站姿穩定度也較弱。",
    ],
    activities: ["平衡木行走", "單腳站立", "跳房子", "滑步車", "旋轉遊戲", "搖擺活動", "障礙路徑挑戰"],
  },
  coordination: {
    title: "協調力偏低",
    description: [
      "協調能力代表孩子能否有效整合眼睛、手部、腳部及身體各部位動作，是感覺統合能力的重要表現之一。",
      "協調能力與左右腦整合、雙側協調及神經系統成熟度有關。",
      "若協調能力較弱，可能影響拍球與接球、使用剪刀、書寫準備能力、動作學習效率與球類運動表現。",
    ],
    activities: ["拍球遊戲", "接球遊戲", "爬行活動", "交叉動作遊戲", "雙手合作遊戲", "障礙挑戰活動"],
  },
  agility: {
    title: "敏捷力偏低",
    description: [
      "敏捷能力反映孩子在移動過程中快速反應、轉換方向與調整動作的能力。",
      "敏捷力與神經肌肉控制、專注力及反應能力有密切關聯。",
      "若敏捷力較弱，孩子可能出現動作反應較慢、轉彎速度較慢、追逐遊戲容易落後、動作切換較不流暢。",
    ],
    activities: ["折返跑", "鬼抓人遊戲", "追逐遊戲", "顏色反應遊戲", "聽指令移動遊戲", "敏捷梯活動"],
  },
  upperBodyStrength: {
    title: "上肢力量偏低",
    description: [
      "上肢力量與肩膀穩定度、核心控制及本體覺發展密切相關。",
      "充足的上肢力量有助於投擲、攀爬、支撐身體及未來精細動作發展。",
      "若上肢力量較弱，孩子可能較容易出現投擲距離較短、攀爬能力不足、手部耐力較差、長時間操作容易疲勞。",
    ],
    activities: ["攀爬活動", "吊單槓", "推拉遊戲", "投擲活動", "熊爬", "螃蟹走路", "推球遊戲"],
  },
};
