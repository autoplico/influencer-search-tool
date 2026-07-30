# 자동 하이라이트 편집기 (Auto Highlight Editor)

특정 폴더에 영상 파일을 넣으면, 자동으로 감지해서 가장 "활기찬"(음량이 높은) 구간을
지정한 길이만큼 잘라내는 로컬 폴더 감시 도구입니다. 클라우드/서버 배포 없이 내 PC에서
스크립트를 켜두기만 하면 동작합니다.

## 동작 방식

1. `input` 폴더를 상시 감시합니다.
2. 새 영상 파일이 들어오면 복사/다운로드가 끝날 때까지 기다립니다.
3. `ffprobe`로 영상 길이를 확인하고, `ffmpeg`로 1초 단위 오디오 음량(RMS)을 분석합니다.
4. 설정한 길이(`HIGHLIGHT_DURATION_SEC`)의 구간 중 평균 음량 에너지가 가장 높은
   구간을 `HIGHLIGHT_COUNT`개만큼 (서로 겹치지 않게) 찾습니다.
5. 해당 구간만 잘라 `output` 폴더에 저장하고, 처리한 원본은 `processed` 폴더로 옮깁니다.

> 음량 기반 방식이라 "말/소리가 커지는 구간 = 흥미로운 구간"이라는 가정을 사용합니다.
> 장면(씬) 전환이나 영상 내용 자체를 이해하는 방식은 아닙니다. 브이로그, 게임, 스포츠
> 하이라이트처럼 흥분되는 순간에 음량/함성이 커지는 영상에 특히 잘 맞습니다.

## 요구 사항

- Node.js 18 이상
- **ffmpeg / ffprobe**가 설치되어 PATH에서 실행 가능해야 합니다.
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: [ffmpeg.org](https://ffmpeg.org/download.html)에서 다운로드 후 PATH 등록

## 설치 및 실행

```bash
cd auto-highlight-editor
npm install
cp .env.example .env   # 필요하면 옵션 수정
npm start
```

실행 후 `input` 폴더(기본값)에 영상 파일을 넣으면 자동으로 처리가 시작됩니다.
콘솔에 진행 상황이 로그로 출력됩니다.

## 설정 (`.env`)

| 변수 | 설명 | 기본값 |
|---|---|---|
| `WATCH_FOLDER` | 감시할 입력 폴더 | `./input` |
| `OUTPUT_FOLDER` | 하이라이트 결과 저장 폴더 | `./output` |
| `PROCESSED_FOLDER` | 처리 완료된 원본 이동 폴더 | `./processed` |
| `HIGHLIGHT_DURATION_SEC` | 하이라이트 하나의 길이(초) | `30` |
| `HIGHLIGHT_COUNT` | 영상 하나당 뽑을 하이라이트 개수 | `1` |
| `VIDEO_EXTENSIONS` | 처리 대상 확장자 | `.mp4,.mov,.mkv,.avi` |
| `STABLE_CHECK_INTERVAL_MS` | 파일 쓰기 완료 판정 대기 시간(ms) | `2000` |

## 계속 켜두고 싶다면

터미널을 계속 열어두기 부담스럽다면 [pm2](https://pm2.keymetrics.io/) 같은 프로세스
매니저로 백그라운드 실행할 수 있습니다.

```bash
npm install -g pm2
pm2 start src/watcher.js --name auto-highlight-editor
pm2 save
```

## 알려진 제한

- 스트림 복사(`-c copy`) 대신 재인코딩(`libx264`/`aac`)을 사용해 자른 지점이 정확하지만,
  영상이 길거나 해상도가 높으면 처리 시간이 다소 걸릴 수 있습니다.
- 무음 브이로그, 자막 위주 영상처럼 음량 변화가 크지 않은 영상은 하이라이트 품질이
  떨어질 수 있습니다.
