const path = require('path');
const fs = require('fs');
const { probeDuration, extractLoudnessProfile, cutClip } = require('./ffmpeg');
const { selectHighlights } = require('./highlightSelector');

const HIGHLIGHT_DURATION_SEC = Number(process.env.HIGHLIGHT_DURATION_SEC || 30);
const HIGHLIGHT_COUNT = Number(process.env.HIGHLIGHT_COUNT || 1);

async function processVideo({ inputPath, outputFolder, processedFolder, log }) {
  const duration = await probeDuration(inputPath);
  log(`영상 길이: ${duration.toFixed(1)}초`);

  const loudnessPoints = await extractLoudnessProfile(inputPath);
  const highlights = selectHighlights(
    loudnessPoints,
    duration,
    HIGHLIGHT_DURATION_SEC,
    HIGHLIGHT_COUNT
  );

  if (highlights.length === 0) {
    throw new Error('하이라이트 구간을 찾지 못했습니다.');
  }

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const ext = path.extname(inputPath);

  for (let i = 0; i < highlights.length; i += 1) {
    const { start, duration: clipDuration } = highlights[i];
    const suffix = highlights.length > 1 ? `_highlight${i + 1}` : '_highlight';
    const outputPath = path.join(outputFolder, `${baseName}${suffix}${ext}`);
    log(`하이라이트 추출 (${start}s ~ ${start + clipDuration}s) -> ${path.basename(outputPath)}`);
    await cutClip(inputPath, outputPath, start, clipDuration);
  }

  const processedPath = path.join(processedFolder, path.basename(inputPath));
  fs.renameSync(inputPath, processedPath);
}

module.exports = { processVideo };
