// 재고 관리 데모용 샘플 데이터.
// 1) 여러 이름의 세미볼드 색상 세트 (10색/6색/3색)가 동일한 낱개 컬러 재고를 공유
// 2) 펜촉 48개입 세트 1개 판매 -> 펜촉 낱개 48개 차감
// 3) 오일파스텔 도구세트: 구성 부자재는 단독 판매하지 않지만 재고/재주문점을 추적
const db = require('./db');
const svc = require('./inventory/service');

function upsertProduct(data) {
  const existing = db.prepare('SELECT id FROM products WHERE sku = ?').get(data.sku);
  if (existing) {
    return svc.updateProduct(existing.id, data);
  }
  return svc.createProduct(data);
}

function ensureBom(setSku, componentSku, quantity) {
  const parent = db.prepare('SELECT id FROM products WHERE sku = ?').get(setSku);
  const component = db.prepare('SELECT id FROM products WHERE sku = ?').get(componentSku);
  svc.addBomItem(parent.id, component.id, quantity);
}

// --- 1. 플리코 세미볼드 색상 (낱개, 여러 세트가 공유) ---
const colors = [
  ['SB-RED', '플리코 세미볼드 레드'],
  ['SB-ORANGE', '플리코 세미볼드 오렌지'],
  ['SB-YELLOW', '플리코 세미볼드 옐로우'],
  ['SB-GREEN', '플리코 세미볼드 그린'],
  ['SB-BLUE', '플리코 세미볼드 블루'],
  ['SB-NAVY', '플리코 세미볼드 네이비'],
  ['SB-PURPLE', '플리코 세미볼드 퍼플'],
  ['SB-PINK', '플리코 세미볼드 핑크'],
  ['SB-BROWN', '플리코 세미볼드 브라운'],
  ['SB-BLACK', '플리코 세미볼드 블랙'],
];
for (const [sku, name] of colors) {
  upsertProduct({ sku, name, category: '세미볼드', isSet: false, isSellable: true, unit: '자루', stockQty: 50, reorderPoint: 15 });
}

// 여러 이름의 세미볼드 세트
upsertProduct({ sku: 'SB-SET-10', name: '플리코 세미볼드 10색 세트', category: '세미볼드', isSet: true, isSellable: true, unit: '세트', stockQty: 20, reorderPoint: 5 });
upsertProduct({ sku: 'SB-SET-6-PASTEL', name: '플리코 세미볼드 6색 세트 (파스텔)', category: '세미볼드', isSet: true, isSellable: true, unit: '세트', stockQty: 20, reorderPoint: 5 });
upsertProduct({ sku: 'SB-SET-3-BASIC', name: '플리코 세미볼드 3색 세트 (기본)', category: '세미볼드', isSet: true, isSellable: true, unit: '세트', stockQty: 20, reorderPoint: 5 });

colors.forEach(([sku]) => ensureBom('SB-SET-10', sku, 1));
['SB-YELLOW', 'SB-PINK', 'SB-BLUE', 'SB-GREEN', 'SB-PURPLE', 'SB-ORANGE'].forEach((sku) => ensureBom('SB-SET-6-PASTEL', sku, 1));
['SB-RED', 'SB-BLUE', 'SB-BLACK'].forEach((sku) => ensureBom('SB-SET-3-BASIC', sku, 1));

// --- 2. 펜촉 48개입 세트 -> 펜촉 낱개 48개 차감 ---
upsertProduct({ sku: 'NIB-1', name: '펜촉 (낱개)', category: '펜촉', isSet: false, isSellable: true, unit: '개', stockQty: 500, reorderPoint: 100 });
upsertProduct({ sku: 'NIB-SET-48', name: '펜촉 48개입 세트', category: '펜촉', isSet: true, isSellable: true, unit: '박스', stockQty: 30, reorderPoint: 5 });
ensureBom('NIB-SET-48', 'NIB-1', 48);

// --- 3. 오일파스텔 도구세트: 부자재는 단독 판매하지 않지만 재고 추적 ---
upsertProduct({ sku: 'OP-HOLDER', name: '오일파스텔 홀더', category: '오일파스텔', isSet: false, isSellable: false, unit: '개', stockQty: 8, reorderPoint: 10 });
upsertProduct({ sku: 'OP-BLEND-STICK', name: '블렌딩 스틱', category: '오일파스텔', isSet: false, isSellable: false, unit: '개', stockQty: 40, reorderPoint: 20 });
upsertProduct({ sku: 'OP-SHARPENER', name: '오일파스텔 샤프너', category: '오일파스텔', isSet: false, isSellable: false, unit: '개', stockQty: 25, reorderPoint: 10 });
upsertProduct({ sku: 'OP-TRAY', name: '수납 트레이', category: '오일파스텔', isSet: false, isSellable: false, unit: '개', stockQty: 12, reorderPoint: 10 });
upsertProduct({ sku: 'OP-TOOLSET', name: '오일파스텔 도구세트', category: '오일파스텔', isSet: true, isSellable: true, unit: '세트', stockQty: 15, reorderPoint: 5 });

ensureBom('OP-TOOLSET', 'OP-HOLDER', 1);
ensureBom('OP-TOOLSET', 'OP-BLEND-STICK', 2);
ensureBom('OP-TOOLSET', 'OP-SHARPENER', 1);
ensureBom('OP-TOOLSET', 'OP-TRAY', 1);

console.log('재고 관리 샘플 데이터를 등록했습니다.');
console.log('- 세미볼드 색상 10종 + 세트 3종(10색/6색/3색, 서로 다른 이름이 컬러 재고를 공유)');
console.log('- 펜촉 낱개 + 펜촉 48개입 세트');
console.log('- 오일파스텔 도구세트 + 판매되지 않는 부자재 4종(재주문점 추적, 홀더는 현재 재고 부족)');
