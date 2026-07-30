function toLinearEnergy(rmsDb) {
  return 10 ** (rmsDb / 10);
}

// 1초 단위 RMS 포인트들로부터, 지정한 길이의 구간 중 평균 음량 에너지가
// 가장 높은(=가장 활기찬) 구간을 서로 겹치지 않게 최대 highlightCount개 고른다.
function selectHighlights(points, durationSec, highlightDurationSec, highlightCount) {
  const bucketCount = Math.max(1, Math.floor(durationSec));
  const perSecondRms = new Array(bucketCount).fill(-90);
  for (const point of points) {
    const idx = Math.min(bucketCount - 1, Math.floor(point.time));
    perSecondRms[idx] = point.rms;
  }
  const energy = perSecondRms.map(toLinearEnergy);

  const windowLen = Math.max(1, Math.min(Math.floor(highlightDurationSec), bucketCount));

  const candidates = [];
  let windowSum = 0;
  for (let i = 0; i < bucketCount; i += 1) {
    windowSum += energy[i];
    if (i >= windowLen) {
      windowSum -= energy[i - windowLen];
    }
    if (i >= windowLen - 1) {
      candidates.push({ start: i - windowLen + 1, score: windowSum });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const selected = [];
  for (const candidate of candidates) {
    const overlaps = selected.some(
      (s) => candidate.start < s.start + windowLen && s.start < candidate.start + windowLen
    );
    if (!overlaps) {
      selected.push(candidate);
    }
    if (selected.length >= highlightCount) break;
  }
  selected.sort((a, b) => a.start - b.start);

  return selected.map((s) => ({ start: s.start, duration: windowLen }));
}

module.exports = { selectHighlights };
