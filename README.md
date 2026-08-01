# 인플루언서 검색 툴

제품 홍보에 적합한 인스타그램 인플루언서를 팔로워 구간과 참여도(바이럴 지수·댓글 비율) 기준으로 검색하는 웹앱입니다.

## 기능

- **팔로워 구간 필터**: 1만-4만 / 4.1만-7만 / 7.1만-10만 / 10.1만-15.5만
- **참여도 필터**: 팔로워수 대비 (좋아요+댓글)로 계산한 "바이럴 지수(참여율)"와, 팔로워수 대비 댓글 비율("댓글 비율")로 필터링·정렬
  - 참여율 = (평균 좋아요 + 평균 댓글) / 팔로워수 × 100
  - 댓글 비율 = 평균 댓글 / 팔로워수 × 100
  - 팔로워수만 많고 참여도가 낮은 "숫자만 큰" 계정을 걸러내고, 팔로워 대비 반응이 좋은 계정을 위로 올릴 수 있습니다.
- 계정 수동 등록 / CSV 대량 등록
- Instagram Graph API의 Business Discovery로 개별 계정 최신 지표 동기화(선택)

## 중요: 인스타그램 API의 한계

인스타그램(Meta)은 **팔로워수 조건으로 전체 계정을 검색할 수 있는 공개 API를 제공하지 않습니다.** 검색은 항상 특정 계정 단위로만 가능합니다(Business Discovery). 따라서 이 툴은 다음 방식으로 동작하도록 설계했습니다.

1. 관심 있는 인플루언서 후보를 직접 등록(계정명 + 팔로워수/평균 좋아요·댓글) 하거나 CSV로 대량 등록
2. 각 계정에 대해 "동기화" 버튼으로 Instagram Graph API Business Discovery 엔드포인트를 호출해 실제 팔로워수·최근 게시물 평균 좋아요/댓글 수를 가져와 자동 갱신
   - 이 API는 **본인 소유의 Instagram Business 계정**과 Meta 앱이 있어야 하며, 조회 대상도 **비즈니스/크리에이터 공개 계정**이어야 동작합니다. 개인 계정은 조회할 수 없습니다.
   - 자격 증명이 없으면 동기화 없이도 수동 입력값 기준으로 검색/필터 기능은 그대로 사용할 수 있습니다.
3. 등록된 후보들 중에서 팔로워 구간 + 참여도 조건으로 검색/정렬

실제 운영에서 "전체 인스타그램에서 자동으로 후보를 찾아오는" 기능이 필요하다면, Modash/HypeAuditor/Upfluence 같은 인플루언서 마케팅 플랫폼의 유료 API 연동이 필요합니다. 필요하시면 이 구조에 어댑터를 추가해 연동할 수 있습니다.

## 실행 방법

```bash
npm install
cp .env.example .env   # IG_ACCESS_TOKEN 등은 선택 사항
npm run seed            # 데모용 샘플 인플루언서 12명 등록
npm start                # http://localhost:3000
```

## 배포 (상시 접속 가능한 주소로 운영)

로컬에서 `npm start`로 띄우면 내 컴퓨터에서만 접속 가능합니다. 팀에서 상시 접속 가능한 주소가 필요하면 Railway처럼 **영구 디스크(볼륨)를 지원하는 호스팅**에 올려야 합니다. 이 앱은 SQLite 파일(`data.sqlite`)에 데이터를 저장하므로, 재배포/재시작 시에도 파일이 남아있는 볼륨이 꼭 필요합니다(볼륨 없이 무료 티어에 올리면 재시작할 때마다 재고 데이터가 초기화될 수 있습니다).

### Railway로 배포하기 (예시)

1. [railway.app](https://railway.app)에 가입 후 "New Project" → "Deploy from GitHub repo"로 이 저장소(`autoplico/influencer-search-tool`) 선택
2. Node.js 프로젝트를 자동 인식해 `npm install` → `npm start`로 빌드/실행합니다(별도 설정 불필요). `better-sqlite3`는 네이티브 모듈이라 빌드에 시간이 조금 더 걸릴 수 있습니다.
3. 서비스 설정에서 **Volume(볼륨) 추가** → 마운트 경로를 예: `/data`로 지정
4. 서비스의 환경변수(Variables)에 `DB_PATH=/data/data.sqlite` 추가 (이 값이 없으면 SQLite 파일이 컨테이너 임시 디스크에 생성되어 재배포 시 사라집니다)
5. `PORT`는 Railway가 자동으로 주입하므로 별도 설정 불필요
6. 배포가 끝나면 Railway가 발급하는 `https://xxxx.up.railway.app` 같은 주소로 접속 (Settings에서 커스텀 도메인 연결도 가능)
7. 초기 데이터가 필요하면 Railway 대시보드의 Shell(또는 `railway run npm run seed:inventory`)로 1회 실행 — 실제 운영에서는 시드 대신 `/inventory.html`의 "품목 등록"으로 실제 상품을 직접 등록하는 것을 권장합니다.

같은 방식(빌드 자동 인식 + 영구 볼륨 + `DB_PATH` 환경변수)은 Fly.io 등 다른 호스팅에도 동일하게 적용됩니다.

## CSV 형식

```
username,displayName,category,followerCount,avgLikes,avgComments,postsSampled
glow_skincare_jn,글로우스킨케어,뷰티,88000,9500,1300,20
```

## API

- `GET /api/influencers/buckets` - 팔로워 구간 목록
- `GET /api/influencers?minFollowers=&maxFollowers=&minEngagementRate=&minCommentRate=&sortBy=&order=&q=` - 검색
- `POST /api/influencers` - 수동 등록
- `PUT /api/influencers/:id` - 수정
- `DELETE /api/influencers/:id` - 삭제
- `POST /api/influencers/:id/sync` - Instagram Business Discovery로 지표 동기화
- `POST /api/influencers/import` - CSV 업로드 (multipart, 필드명 `file`)

## 재고 관리 (세트상품 BOM)

`/inventory.html`에서 세트상품과 하위 단품(구성품) 재고를 함께 관리합니다. `http://localhost:3000/inventory.html`

### 동작 방식

- 모든 품목(단품/부자재/세트)은 `products` 테이블 한 곳에서 관리하며, 세트는 `is_set = true`로 표시합니다.
- 세트의 구성은 `bom_items`(세트당 구성품 수량)로 정의하며, 하나의 구성품을 여러 세트가 동시에 참조할 수 있습니다.
  - 예: "플리코 세미볼드 10색 세트", "6색 세트(파스텔)", "3색 세트(기본)"처럼 이름이 다른 세트 여러 개가 동일한 색상 낱개 재고를 공유합니다.
- 세트를 판매(`POST /api/inventory/products/:id/sell`)하면 세트 자체 재고를 차감하고, 구성품 재고도 세트 판매 수량 × 세트당 구성 수량만큼 함께 차감됩니다.
  - 펜촉 48개입 세트 1개 판매 → 펜촉 낱개 재고 48개 차감.
  - 세트 안에 또 다른 세트가 포함된 경우도 재귀적으로 펼쳐서 최하위 단품까지 차감합니다(순환 참조는 등록 시 차단).
- 구성품은 `is_sellable = false`로 등록해 "단독으로는 판매하지 않지만 재고는 추적"할 수 있습니다.
  - 예: 오일파스텔 도구세트의 홀더/블렌딩 스틱/샤프너/트레이는 낱개로 팔지 않지만, 재주문점(`reorder_point`)을 설정해두면 부족할 때 발주 대상으로 잡아낼 수 있습니다.
- 모든 재고 변동은 `stock_movements`에 이력으로 남습니다(판매/세트연쇄차감/입고/수동조정).

### 실행

```bash
npm run seed:inventory   # 데모 데이터: 세미볼드 세트 3종 + 펜촉 세트 + 오일파스텔 도구세트
npm start
```

### 주요 API

- `GET /api/inventory/products?q=&type=set|component&low=1` - 품목 목록/검색
- `POST /api/inventory/products` - 품목 등록 `{ sku, name, category, isSet, isSellable, unit, stockQty, reorderPoint }`
- `GET /api/inventory/products/:id` - 품목 상세(세트면 BOM 구성 포함, 다른 세트에서 사용 중인지도 함께 조회)
- `PUT/DELETE /api/inventory/products/:id` - 수정/삭제(구성에 사용 중이면 삭제 불가)
- `GET/POST /api/inventory/products/:id/bom` - 세트 구성 조회/추가 `{ componentProductId, quantity }`
- `DELETE /api/inventory/bom/:bomItemId` - 세트 구성에서 제외
- `GET /api/inventory/products/:id/expand?quantity=` - 세트 N개 생산/판매 시 필요한 최하위 단품 총수량 미리보기(부족분 포함)
- `POST /api/inventory/products/:id/sell` - 판매 처리 `{ quantity, memo }` (세트면 구성품까지 연쇄 차감)
- `POST /api/inventory/products/:id/adjust` - 입고/수동 재고 조정 `{ delta, reason, memo }`
- `GET /api/inventory/products/:id/movements` - 재고 변동 이력
- `GET /api/inventory/reorder-alerts` - 재주문점 이하로 떨어진 품목 목록(발주 대상)

### 이지어드민 판매 데이터 업로드로 재고 반영

이지어드민 API 연동(과금) 대신, 이지어드민에서 내려받은 판매내역 파일(.csv/.xlsx)을 업로드해 SKU별 판매수량을 집계하고 재고를 차감하는 방식입니다. 재고를 이지어드민 쪽에 반영하는 것은 이 툴의 범위가 아니며, 이지어드민에서 내려받은 판매내역만 가져와 자체 재고를 갱신합니다. `/inventory.html`의 "이지어드민 판매 데이터 업로드" 패널에서 사용합니다.

- 이지어드민 내보내기 양식이 상황마다 다를 수 있어(헤더 행 위치, 컬럼 순서 등), 업로드 후 헤더 행/시트/컬럼 매핑(SKU, 수량, 상태, 주문번호)을 직접 확인·조정한 뒤 반영합니다. 흔한 헤더명(상품코드, 수량, 주문상태 등)은 자동으로 추측해 미리 선택해둡니다.
- "제외할 상태값"에 `취소,반품` 등을 입력하면 해당 상태의 행은 재고 차감에서 제외됩니다.
- 같은 SKU가 여러 행에 걸쳐 있으면 합산 후 한 번에 차감하며, 세트 SKU면 구성 단품까지 연쇄 차감됩니다.
- 등록되지 않은 SKU나 판매 불가 품목은 실패 목록으로 표시되고, 나머지 SKU 처리는 계속 진행됩니다(전체 실패 없음).

API:

- `POST /api/inventory/sales-import/upload` (multipart `file`) - 파일 업로드 후 기본 미리보기 반환(uploadId 포함, 서버 메모리에 30분간 보관)
- `GET /api/inventory/sales-import/:uploadId/preview?sheetIndex=&headerRow=` - 시트/헤더 행을 바꿔 다시 미리보기
- `POST /api/inventory/sales-import/:uploadId/commit` `{ sheetIndex, headerRow, skuColIdx, qtyColIdx, statusColIdx, memoColIdx, excludeStatuses, sourceLabel }` - 매핑 확정 후 실제 재고 반영
