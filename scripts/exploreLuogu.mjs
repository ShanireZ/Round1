const BASE_URL = 'https://ti.luogu.com.cn';

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index++;
    }
  }
  return args;
}

async function fetchInjectionJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const html = await response.text();
  const match = html.match(/decodeURIComponent\("([^"]+)"\)/);
  if (!match) {
    throw new Error(`No _feInjection payload found for ${url}`);
  }

  return JSON.parse(decodeURIComponent(match[1]));
}

async function listProblemsets(keyword) {
  const all = [];

  for (let page = 1; ; page++) {
    const url = page === 1 ? `${BASE_URL}/` : `${BASE_URL}/?page=${page}`;
    const data = await fetchInjectionJson(url);
    const result = data.currentData?.problemsets?.result;
    const totalCount = data.currentData?.problemsets?.totalCount ?? 0;

    if (!Array.isArray(result) || result.length === 0) {
      break;
    }

    all.push(...result);
    if (all.length >= totalCount) {
      break;
    }
  }

  const filtered = keyword
    ? all.filter((item) => item.name.includes(keyword))
    : all;

  console.log(`Total problemsets: ${all.length}`);
  console.log(`Matched: ${filtered.length}`);
  for (const item of filtered) {
    console.log(`${item.id}\t${item.name}`);
  }
}

async function inspectProblemset(examIds) {
  for (const examId of examIds) {
    const data = await fetchInjectionJson(`${BASE_URL}/problemset/${examId}/training`);
    const problemset = data.currentData?.problemset;
    const problems = problemset?.problems ?? [];
    const firstProblem = problems[0];
    const firstQuestion = firstProblem?.questions?.[0];

    console.log(`\n[${examId}] ${problemset?.name ?? 'N/A'}`);
    console.log(`Problems: ${problems.length}`);
    console.log(`First problem keys: ${firstProblem ? Object.keys(firstProblem).join(', ') : 'N/A'}`);
    console.log(`First question keys: ${firstQuestion ? Object.keys(firstQuestion).join(', ') : 'N/A'}`);
    if (firstQuestion?.correctAnswers) {
      console.log(`First question correct answers: ${firstQuestion.correctAnswers.join(',')}`);
    }
  }
}

async function checkAvailability(fromId, toId) {
  for (let examId = fromId; examId <= toId; examId++) {
    try {
      const data = await fetchInjectionJson(`${BASE_URL}/problemset/${examId}/training`);
      const problemset = data.currentData?.problemset;
      console.log(`${examId}\t${data.code}\t${problemset?.name ?? 'N/A'}\t${problemset?.problems?.length ?? 0}`);
    } catch (error) {
      console.log(`${examId}\tERROR\t${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [mode = 'list', ...rest] = args._;

  if (mode === 'list') {
    await listProblemsets(typeof args.keyword === 'string' ? args.keyword : undefined);
    return;
  }

  if (mode === 'inspect') {
    if (rest.length === 0) {
      throw new Error('Usage: node scripts/exploreLuogu.mjs inspect <examId> [examId...]');
    }
    await inspectProblemset(rest);
    return;
  }

  if (mode === 'availability') {
    const from = Number(args.from ?? rest[0]);
    const to = Number(args.to ?? rest[1] ?? rest[0]);
    if (Number.isNaN(from) || Number.isNaN(to)) {
      throw new Error('Usage: node scripts/exploreLuogu.mjs availability --from <id> --to <id>');
    }
    await checkAvailability(from, to);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
