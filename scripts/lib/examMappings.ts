export interface ExamMeta {
  examType: string;
  year: number;
  label: string;
  outDir: string;
  outFile: string;
}

const examMap: Record<string, ExamMeta> = {};

const cspJ: [number, string][] = [
  [2019, '1030'], [2020, '1034'], [2021, '1036'], [2022, '1039'],
  [2023, '1041'], [2024, '1043'], [2025, '1119'],
];

const cspS: [number, string][] = [
  [2019, '1031'], [2020, '1035'], [2021, '1037'], [2022, '1040'],
  [2023, '1042'], [2024, '1044'], [2025, '1120'],
];

for (const [year, id] of cspJ) {
  examMap[id] = {
    examType: 'CSP-J',
    year,
    label: `CSP ${year} 入门级`,
    outDir: 'csp-j',
    outFile: `${year}.json`,
  };
}

for (const [year, id] of cspS) {
  examMap[id] = {
    examType: 'CSP-S',
    year,
    label: `CSP ${year} 提高级`,
    outDir: 'csp-s',
    outFile: `${year}.json`,
  };
}

examMap['1033'] = {
  examType: 'CSP-J',
  year: 2020,
  label: 'CSP 2020 第一轮（初赛）模拟',
  outDir: 'csp-j',
  outFile: '2020-mock.json',
};

examMap['1038'] = {
  examType: 'CSP-J',
  year: 2021,
  label: 'CSP 2021 第一轮（初赛）模拟',
  outDir: 'csp-j',
  outFile: '2021-mock.json',
};

for (let level = 1; level <= 8; level++) {
  const id = String(1100 + level);
  examMap[id] = {
    examType: `GESP-${level}`,
    year: 2023,
    label: `GESP ${level}级 样题`,
    outDir: 'gesp',
    outFile: `level-${level}-sample.json`,
  };
}

export const gespBatches: { batch: string; startId: number; levels: number[] }[] = [
  { batch: '202303', startId: 1121, levels: [1, 2] },
  { batch: '202306', startId: 1123, levels: [1, 2, 3, 4] },
  { batch: '202309', startId: 1127, levels: [1, 2, 3, 4, 5, 6] },
  { batch: '202312', startId: 1133, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202403', startId: 1141, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202406', startId: 1149, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202409', startId: 1157, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202412', startId: 1165, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202503', startId: 1173, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202506', startId: 1181, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202509', startId: 1189, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202512', startId: 1197, levels: [1, 2, 3, 4, 5, 6, 7, 8] },
  { batch: '202603', startId: 1205, levels: [1, 2] },
];

for (const { batch, startId, levels } of gespBatches) {
  for (let index = 0; index < levels.length; index++) {
    const level = levels[index];
    const id = String(startId + index);
    examMap[id] = {
      examType: `GESP-${level}`,
      year: Number.parseInt(batch.slice(0, 4), 10),
      label: `GESP ${level}级 ${batch}`,
      outDir: 'gesp',
      outFile: `level-${level}-${batch}.json`,
    };
  }
}

export const EXAM_MAP: Readonly<Record<string, ExamMeta>> = Object.freeze(examMap);

export function getExamMeta(examId: string): ExamMeta | undefined {
  return EXAM_MAP[examId];
}
