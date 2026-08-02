// bomDefinitions.js에 정의된 세트 구성을 실제 BOM에 반영한다(npm run seed:bom).
// 여러 번 실행해도 안전하다(이미 있는 품목/구성은 건너뛰거나 수량만 갱신).
const svc = require('./inventory/service');
const definitions = require('./inventory/bomDefinitions');

function ensureComponent(def) {
  const existing = svc.getProductBySku(def.sku);
  if (existing) return existing;
  return svc.createProduct({
    sku: def.sku,
    name: def.name,
    isSet: false,
    isSellable: def.isSellable !== false,
    stockQty: 0,
  });
}

for (const def of definitions) {
  const setProduct = svc.getProductBySku(def.setSku);
  if (!setProduct) {
    console.log(
      `[건너뜀] ${def.setSku} ${def.setName}: 아직 등록되지 않은 세트입니다. ` +
        '먼저 이지어드민 재고 현황 파일을 업로드해 등록한 뒤 다시 실행해주세요(재고 기준값이 필요합니다).'
    );
    continue;
  }
  if (!setProduct.isSet) {
    console.log(`[건너뜀] ${def.setSku} ${def.setName}: 세트(is_set)로 등록되어 있지 않습니다. 품목 수정에서 먼저 "세트상품"으로 표시해주세요.`);
    continue;
  }

  for (const compDef of def.components) {
    const component = ensureComponent(compDef);
    svc.addBomItem(setProduct.id, component.id, compDef.qty);
    console.log(`- ${def.setName} <- ${compDef.name} x${compDef.qty}`);
  }
}

console.log('BOM 정의 적용 완료');
