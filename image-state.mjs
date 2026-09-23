// Image checks are deliberately separate from image presence in a catalog response.
// A URL in TCGdex is only a candidate; an image counts as found after a real load.
export function imageState(id, records, transient, now=Date.now()) {
  const record=records.get(id);
  if(record?.source==='missing' && record.verificationVersion===3 && record.missingUntil>now)return 'missing';
  if(record?.source && record.source!=='missing' && record.checkedAt>0)return 'found';
  const current=transient.get(id);
  return ['checking','error'].includes(current)?current:'pending';
}
export function imageCoverage(cards, records, transient, now=Date.now()) {
  const stats={total:cards.length,found:0,missing:0,checking:0,error:0,pending:0,checked:0};
  for(const card of cards){
    const state=imageState(card.id,records,transient,now);
    stats[state]++;
  }
  stats.checked=stats.found+stats.missing;
  return stats;
}
export function reconcileIds(existingIds, wantedIds) {
  const wanted=new Set(wantedIds);
  return {retained:existingIds.filter(id=>wanted.has(id)),added:wantedIds.filter(id=>!existingIds.includes(id)),removed:existingIds.filter(id=>!wanted.has(id))};
}
