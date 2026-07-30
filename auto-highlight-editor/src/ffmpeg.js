const { spawn, spawnSync } = require('child_process');

function checkFfmpegAvailable() {
  const ffmpeg = spawnSync('ffmpeg', ['-version']);
  const ffprobe = spawnSync('ffprobe', ['-version']);
  if (ffmpeg.error || ffprobe.error) {
    throw new Error(
      'ffmpeg/ffprobe가 설치되어 있지 않습니다. https://ffmpeg.org 에서 설치한 뒤 다시 실행하세요.'
    );
  }
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${cmd} 실행 실패 (code ${code}): ${stderr.slice(-500)}`));
      }
    });
  });
}

async function probeDuration(inputPath) {
  const { stdout } = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    inputPath,
  ]);
  const duration = parseFloat(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('영상 길이를 확인할 수 없습니다.');
  }
  return duration;
}

function parseLoudnessOutput(output) {
  const points = [];
  let currentTime = null;
  for (const line of output.split('\n')) {
    const timeMatch = line.match(/pts_time:([\d.]+)/);
    if (timeMatch) {
      currentTime = parseFloat(timeMatch[1]);
      continue;
    }
    const rmsMatch = line.match(/lavfi\.astats\.Overall\.RMS_level=(-?[\d.]+|-inf)/);
    if (rmsMatch && currentTime !== null) {
      const value = rmsMatch[1] === '-inf' ? -90 : parseFloat(rmsMatch[1]);
      points.push({ time: currentTime, rms: value });
      currentTime = null;
    }
  }
  return points;
}

// 1초 단위로 오디오 RMS(음량) 값을 뽑아 시간대별 "활기 정도" 프로파일을 만든다.
async function extractLoudnessProfile(inputPath) {
  const { stdout } = await runCommand('ffmpeg', [
    '-i', inputPath,
    '-af',
    'aresample=44100,asetnsamples=n=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
    '-f', 'null', '-',
  ]);
  return parseLoudnessOutput(stdout);
}

async function cutClip(inputPath, outputPath, startSec, durationSec) {
  await runCommand('ffmpeg', [
    '-y',
    '-ss', String(startSec),
    '-i', inputPath,
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'veryfast',
    outputPath,
  ]);
}

module.exports = {
  checkFfmpegAvailable,
  probeDuration,
  extractLoudnessProfile,
  cutClip,
};
