require('dotenv').config();
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const { checkFfmpegAvailable } = require('./ffmpeg');
const { processVideo } = require('./processVideo');

const WATCH_FOLDER = path.resolve(process.env.WATCH_FOLDER || './input');
const OUTPUT_FOLDER = path.resolve(process.env.OUTPUT_FOLDER || './output');
const PROCESSED_FOLDER = path.resolve(process.env.PROCESSED_FOLDER || './processed');
const VIDEO_EXTENSIONS = (process.env.VIDEO_EXTENSIONS || '.mp4,.mov,.mkv,.avi')
  .split(',')
  .map((ext) => ext.trim().toLowerCase())
  .filter(Boolean);
const STABLE_CHECK_INTERVAL_MS = Number(process.env.STABLE_CHECK_INTERVAL_MS || 2000);

for (const dir of [WATCH_FOLDER, OUTPUT_FOLDER, PROCESSED_FOLDER]) {
  fs.mkdirSync(dir, { recursive: true });
}

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function handleNewFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!VIDEO_EXTENSIONS.includes(ext)) return;

  log(`새 영상 감지: ${path.basename(filePath)}`);
  try {
    await processVideo({
      inputPath: filePath,
      outputFolder: OUTPUT_FOLDER,
      processedFolder: PROCESSED_FOLDER,
      log,
    });
    log(`처리 완료: ${path.basename(filePath)}`);
  } catch (err) {
    log(`처리 실패 (${path.basename(filePath)}): ${err.message}`);
  }
}

function main() {
  checkFfmpegAvailable();

  log(`폴더 감시 시작: ${WATCH_FOLDER}`);
  log(`하이라이트 저장 폴더: ${OUTPUT_FOLDER}`);
  log(`처리된 원본 이동 폴더: ${PROCESSED_FOLDER}`);

  const watcher = chokidar.watch(WATCH_FOLDER, {
    ignoreInitial: false,
    depth: 0,
    awaitWriteFinish: {
      stabilityThreshold: STABLE_CHECK_INTERVAL_MS,
      pollInterval: 500,
    },
  });

  watcher.on('add', (filePath) => {
    handleNewFile(filePath).catch((err) => log('예상치 못한 오류:', err.message));
  });

  watcher.on('error', (err) => log('감시 오류:', err.message));
}

try {
  main();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
