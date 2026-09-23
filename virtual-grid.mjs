// Pure viewport math. Only a few overscanned rows exist in the DOM at a time.
export function windowRows({total,columns,rowStride,scrollTop,viewportHeight,originTop,overscan=900}) {
  if(!total || !columns || !rowStride) return {startRow:0,endRow:0,start:0,end:0,top:0,bottom:0,totalRows:0};
  const totalRows=Math.ceil(total/columns);
  const startRow=Math.max(0,Math.min(totalRows-1,Math.floor((scrollTop-originTop-overscan)/rowStride)));
  const endRow=Math.min(totalRows,Math.max(startRow+1,Math.ceil((scrollTop+viewportHeight-originTop+overscan)/rowStride)));
  return {startRow,endRow,start:startRow*columns,end:Math.min(total,endRow*columns),top:startRow*rowStride,bottom:(totalRows-endRow)*rowStride,totalRows};
}
