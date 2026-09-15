// Fit an image inside its reserved header area without stretching either axis.
export function fitPdfImage({width,height},maxWidth,maxHeight){
 if(![width,height,maxWidth,maxHeight].every(n=>Number.isFinite(n)&&n>0))throw Error('Dimensions du logo invalides.');
 const scale=Math.min(maxWidth/width,maxHeight/height);
 return {width:width*scale,height:height*scale};
}
export function addPdfLogo(pdf,image,x,y,maxWidth,maxHeight){
 const properties=pdf.getImageProperties(image);
 const size=fitPdfImage(properties,maxWidth,maxHeight);
 pdf.addImage(image,properties.fileType,x,y+(maxHeight-size.height)/2,size.width,size.height);
 return size;
}
