// CSS size and raster resolution are separate, so Retina screens stay sharp.
export function pdfDisplay(baseWidth,baseHeight,availableWidth,zoom=1,dpr=1){
 const width=Math.max(100,availableWidth)*zoom,height=width*baseHeight/baseWidth;
 const ratio=Math.min(Math.max(1,dpr),3,4096/Math.max(width,height),Math.sqrt(8000000/(width*height)));
 return {width,height,scale:width/baseWidth,ratio,pixelWidth:Math.ceil(width*ratio),pixelHeight:Math.ceil(height*ratio)};
}
