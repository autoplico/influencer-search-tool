// 세트 SKU가 어떤 색상/부품으로 구성되는지 정의. 이지어드민 파일만으로는 세트 내부 구성을 알 수 없어
// 여기 직접 정의해두고 npm run seed:bom 으로 BOM에 반영한다. 새로운 세트를 안내받을 때마다 이 배열에 추가한다.
//
// setSku: 이지어드민 상품코드(정상재고 업로드 시 이 SKU로 세트를 찾음). 세트가 아직 등록되지 않았다면
//         먼저 이지어드민 재고 현황 파일을 업로드해 등록한 뒤 이 스크립트를 실행해야 한다(재고 기준값이 필요하기 때문).
// components: 세트 안에 든 부품/색상. 이지어드민에 없는 내부 전용 부자재는 sku를 "INT-"로 시작하는 값으로 직접 부여하고
//             처음에는 재고 0으로 등록한 뒤(is_sellable: false), 실제 수량은 재고 조정 화면에서 입력한다.
module.exports = [
  {
    setSku: '00218',
    setName: '도구세트',
    components: [
      { sku: 'INT-메탈스퀴지', name: '메탈스퀴지', isSellable: false, qty: 1 },
      { sku: 'INT-스크레이퍼1', name: '스크레이퍼1', isSellable: false, qty: 1 },
      { sku: 'INT-스크레이퍼2', name: '스크레이퍼2', isSellable: false, qty: 1 },
      { sku: 'INT-고무골무', name: '고무골무', isSellable: false, qty: 1 },
      { sku: 'INT-펠트케이스', name: '펠트케이스', isSellable: false, qty: 1 },
    ],
  },
];
