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
